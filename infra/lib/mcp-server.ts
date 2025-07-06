import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export class McpServer extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const capacityProviderProdName =
      "CarrotCore-CarrotCoreCapProviderMainT3EC374532-4v1kftFzrlH4";

    // vpc created in core-infra in us-east-2
    const vpc = cdk.aws_ec2.Vpc.fromLookup(this, `Vpc`, {
      region: this.region,
      tags: {
        Name: `CarrotCore/CarrotCoreVPC`,
      },
    });

    // --- ECS Cluster ---
    const cluster = cdk.aws_ecs.Cluster.fromClusterAttributes(this, "Cluster", {
      clusterName: "CarrotCoreMain",
      vpc,
    });

    // --- DynamoDB Table for Session Management ---
    const sessionTable = new cdk.aws_dynamodb.Table(this, `${id}SessionTable`, {
      tableName: `${id}SessionTable`,
      partitionKey: { name: "sessionId", type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    // --- MCP Application Service ---
    const appRepository = new cdk.aws_ecr.Repository(
      this,
      `${id}AppEcrRepo`,
      {
        repositoryName: `${id.toLowerCase()}-app-repo`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteImages: true,
      },
    );

    const appTaskRole = new cdk.aws_iam.Role(this, `${id}AppTaskRole`, {
      assumedBy: new cdk.aws_iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // Grant the app task role permissions to access the DynamoDB table
    sessionTable.grantReadWriteData(appTaskRole);

    const appExecutionRole = new cdk.aws_iam.Role(this, `${id}AppExecutionRole`, {
      assumedBy: new cdk.aws_iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    const appTaskDefinition = new cdk.aws_ecs.Ec2TaskDefinition(
      this,
      `${id}AppTaskDef`,
      {
        taskRole: appTaskRole,
        executionRole: appExecutionRole,
        networkMode: cdk.aws_ecs.NetworkMode.AWS_VPC,
      }
    );

    appTaskDefinition.addContainer(`${id}AppContainer`, {
      image: cdk.aws_ecs.ContainerImage.fromEcrRepository(appRepository, "latest"),
      memoryLimitMiB: 512,
      cpu: 256,
      logging: cdk.aws_ecs.LogDrivers.awsLogs({
        streamPrefix: `/ecs/${id}-app`,
      }),
      portMappings: [{ containerPort: 8080 }],
    });

    const appService = new cdk.aws_ecs.Ec2Service(this, `${id}AppService`, {
      cluster,
      taskDefinition: appTaskDefinition,
      desiredCount: 1,
      // Configure Service Discovery for the app service
      cloudMapOptions: {
        name: "mcp-app", // This is the hostname NGINX will use
        dnsTtl: cdk.Duration.seconds(10),
      },
      capacityProviderStrategies: [
        { capacityProvider: capacityProviderProdName, weight: 1 },
      ],
    });

    // --- NGINX Reverse Proxy Service ---
    const nginxRepository = new cdk.aws_ecr.Repository(
      this,
      `${id}NginxEcrRepo`,
      {
        repositoryName: `${id.toLowerCase()}-nginx-repo`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteImages: true,
      }
    );

    const nginxTaskDefinition = new cdk.aws_ecs.Ec2TaskDefinition(
      this,
      `${id}NginxTaskDef`,
      {
        networkMode: cdk.aws_ecs.NetworkMode.AWS_VPC,
      }
    );

    nginxTaskDefinition.addContainer(`${id}NginxContainer`, {
      image: cdk.aws_ecs.ContainerImage.fromAsset(
        path.join(__dirname, "../../nginx-conf")
      ),
      memoryLimitMiB: 256,
      cpu: 128,
      logging: cdk.aws_ecs.LogDrivers.awsLogs({
        streamPrefix: `/ecs/${id}-nginx`,
      }),
      portMappings: [{ containerPort: 80 }],
    });

    const nginxService = new cdk.aws_ecs.Ec2Service(this, `${id}NginxService`, {
      cluster,
      taskDefinition: nginxTaskDefinition,
      desiredCount: 1,
      capacityProviderStrategies: [
        { capacityProvider: capacityProviderProdName, weight: 1 },
      ],
    });

    // --- Network Load Balancer (NLB) ---
    const nlb = new cdk.aws_elasticloadbalancingv2.NetworkLoadBalancer(
      this,
      `${id}Nlb`,
      {
        vpc,
        internetFacing: true,
      }
    );

    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(
      this,
      `${id}Cert`,
      "arn:aws:acm:us-east-2:058264184558:certificate/ce6189af-c431-4a83-a897-f65903485504"
    );

    // Listener for TLS traffic on port 443
    const tlsListener = nlb.addListener(`${id}TlsListener`, {
      port: 443,
      protocol: cdk.aws_elasticloadbalancingv2.Protocol.TLS,
      certificates: [certificate],
    });

    // Add the NGINX service as the target for the NLB listener
    tlsListener.addTargets(`${id}NginxTarget`, {
      port: 80,
      targets: [nginxService],
    });

    // --- Security Groups ---
    const appServiceSecurityGroup = new cdk.aws_ec2.SecurityGroup(
      this,
      `${id}AppServiceSg`,
      { vpc, allowAllOutbound: true }
    );
    appService.connections.addSecurityGroup(appServiceSecurityGroup);

    const nginxServiceSecurityGroup = new cdk.aws_ec2.SecurityGroup(
      this,
      `${id}NginxServiceSg`,
      { vpc, allowAllOutbound: true }
    );
    nginxService.connections.addSecurityGroup(nginxServiceSecurityGroup);

    // Allow traffic from NGINX to the App Service on port 8080
    appServiceSecurityGroup.connections.allowFrom(
      nginxServiceSecurityGroup,
      cdk.aws_ec2.Port.tcp(8080),
      "Allow traffic from NGINX to App"
    );

    // Allow traffic from the NLB to NGINX on port 80
    nginxServiceSecurityGroup.connections.allowFrom(
      nlb,
      cdk.aws_ec2.Port.tcp(80),
      "Allow traffic from NLB to NGINX"
    );

    // --- Outputs ---
    new cdk.CfnOutput(this, "AppEcrRepositoryUri", {
      value: appRepository.repositoryUri,
    });
    new cdk.CfnOutput(this, "NginxEcrRepositoryUri", {
      value: nginxRepository.repositoryUri,
    });
    new cdk.CfnOutput(this, "LoadBalancerDns", {
      value: nlb.loadBalancerDnsName,
    });
    new cdk.CfnOutput(this, "SessionTableName", {
      value: sessionTable.tableName,
    });
  }
}
