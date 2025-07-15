import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

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

    // Get the existing cluster
    const cluster = cdk.aws_ecs.Cluster.fromClusterAttributes(this, "Cluster", {
      clusterName: "CarrotCoreMain",
      vpc,
    });

    const repository = new cdk.aws_ecr.Repository(
      this,
      `${id}McpServerEcrRepo`,
      {
        repositoryName: `${id.toLowerCase()}-repo`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteImages: true,
      },
    );

    // Create task role
    const taskRole = new cdk.aws_iam.Role(this, `${id}TaskRole`, {
      assumedBy: new cdk.aws_iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    const executionRole = new cdk.aws_iam.Role(this, `${id}ExecutionRole`, {
      assumedBy: new cdk.aws_iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // Add necessary permissions to execution role
    executionRole.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy",
      ),
    );

    // Add ECR permissions
    executionRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetAuthorizationToken",
        ],
        resources: [repository.repositoryArn],
      }),
    );

    // Create task definition
    const taskDefinition = new cdk.aws_ecs.Ec2TaskDefinition(
      this,
      `${id}TaskDef`,
      {
        taskRole,
        executionRole,
        networkMode: cdk.aws_ecs.NetworkMode.AWS_VPC,
      },
    );

    // Add log group
    const logGroupName = `/ecs/${id}-container`;
    const logGroup = new cdk.aws_logs.LogGroup(this, `${id}LogGroup`, {
      retention: cdk.aws_logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      logGroupName,
    });

    // Add main app container
    taskDefinition.addContainer(`${id}Container`, {
      image: cdk.aws_ecs.ContainerImage.fromEcrRepository(repository, "latest"),
      memoryLimitMiB: 512,
      cpu: 256,
      logging: cdk.aws_ecs.LogDrivers.awsLogs({
        streamPrefix: logGroupName,
        logGroup,
      }),
      portMappings: [
        {
          containerPort: 8080,
        },
      ],
    });

    // --- Create a security group for the ECS service ---
    const serviceSecurityGroup = new cdk.aws_ec2.SecurityGroup(
      this,
      `${id}ServiceSg`,
      {
        vpc,
        description: "Security group for the MCP ECS service",
        allowAllOutbound: true,
      },
    );

    // --- Create an Application Load Balancer (ALB) ---
    const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(
      this,
      `${id}Alb`,
      {
        vpc,
        internetFacing: true,
      },
    );

    // manually created certificate in us-east-2
    // manually created subdomain in route53
    const certificate =
      cdk.aws_certificatemanager.Certificate.fromCertificateArn(
        this,
        `${id}Cert`,
        "arn:aws:acm:us-east-2:058264184558:certificate/ce6189af-c431-4a83-a897-f65903485504",
      );

    // This listener will handle incoming HTTPS traffic on port 443
    const httpsListener = alb.addListener(`${id}HttpsListener`, {
      port: 443,
      certificates: [certificate], // Attach the certificate
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
    });

    // Create ECS service
    const ecsService = new cdk.aws_ecs.Ec2Service(this, `${id}Service`, {
      cluster,
      taskDefinition,
      desiredCount: 1,
      placementConstraints: [],
      securityGroups: [serviceSecurityGroup],
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProviderProdName,
          weight: 1,
        },
      ],
    });

    // forward 443 to 80
    httpsListener.addTargets(`${id}EcsTarget`, {
      port: 80,
      targets: [ecsService],
      healthCheck: {
        path: "/",
        interval: cdk.Duration.seconds(30),
      },
    });

    // redirect 80 to 443
    alb.addListener(`${id}HttpListener`, {
      port: 80,
      defaultAction: cdk.aws_elasticloadbalancingv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    // --- Allow traffic from the ALB to the ECS service ---
    // The security group for the ALB was opened on port 80 by the listener (open: true)
    // Now, allow the service's security group to accept traffic from the ALB
    ecsService.connections.allowFrom(
      alb,
      cdk.aws_ec2.Port.tcp(8080),
      "Allow traffic from ALB",
    );

    // Output the ECR repository URI
    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: repository.repositoryUri,
    });

    // Output the application load balancer DNS name
    new cdk.CfnOutput(this, "LoadBalancerDns", {
      value: alb.loadBalancerDnsName,
      description: "The public DNS name of the Application Load Balancer.",
    });
  }
}
