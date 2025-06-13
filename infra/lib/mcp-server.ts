import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class McpServer extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
    });

    // Create ECS service
    new cdk.aws_ecs.Ec2Service(this, `${id}Service`, {
      cluster,
      taskDefinition,
      desiredCount: 1,
      placementConstraints: [],
    });

    // Output the ECR repository URI
    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: repository.repositoryUri,
    });
  }
}
