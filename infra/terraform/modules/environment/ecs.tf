locals {
  environment_variables = {
    NODE_ENV                            = "production"
    HOSTNAME                            = "0.0.0.0"
    PORT                                = "3000"
    AWS_REGION                          = var.aws_region
    DEPLOYMENT_ENV                      = "_${var.environment}"
    ASSET_STORAGE                       = "s3"
    ASSETS_BUCKET                       = module.buckets["assets"].name
    DIAGNOSTICS_BUCKET                  = module.buckets["diagnostics"].name
    RECOVERY_BUCKET                     = module.buckets["recovery"].name
    MONGODB_DATABASE                    = var.environment == "prod" ? "kids_booklet_prod" : "kids_booklet"
    MODEL_RUNTIME                       = "real"
    IMAGE_PROVIDER_MODE                 = "real"
    OPENAI_TRACE_INCLUDE_SENSITIVE_DATA = "false"
  }
  container = {
    name            = "application"
    image           = "${aws_ecr_repository.application.repository_url}:bootstrap-unpublished"
    essential       = true
    stopTimeout     = 120
    user            = "1001"
    linuxParameters = { initProcessEnabled = true }
    portMappings    = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }]
    environment     = [for key, value in merge(local.environment_variables, { RUNNER_ENABLED = "true" }) : { name = key, value = value }]
    secrets         = [for name, secret in aws_secretsmanager_secret.application : { name = name, valueFrom = secret.arn }]
    logConfiguration = {
      logDriver = "awslogs"
      options   = { awslogs-group = aws_cloudwatch_log_group.application.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "application", mode = "non-blocking", max-buffer-size = "25m" }
    }
  }
  task_template = {
    family                  = local.name
    networkMode             = "awsvpc"
    requiresCompatibilities = ["FARGATE"]
    cpu                     = tostring(var.cpu)
    memory                  = tostring(var.memory)
    executionRoleArn        = var.execution_role_arn
    taskRoleArn             = var.task_role_arn
    runtimePlatform         = { cpuArchitecture = "X86_64", operatingSystemFamily = "LINUX" }
    containerDefinitions    = [local.container]
    tags                    = [for key, value in local.tags : { key = key, value = value }]
  }
  maintenance_template = merge(local.task_template, {
    family      = "${local.name}-maintenance"
    taskRoleArn = var.maintenance_role_arn
    containerDefinitions = [merge(local.container, {
      name         = "maintenance"
      command      = ["./node_modules/.bin/tsx", "scripts/check-deployment-readiness.ts"]
      environment  = [for key, value in merge(local.environment_variables, { RUNNER_ENABLED = "false" }) : { name = key, value = value }]
      portMappings = []
      logConfiguration = merge(local.container.logConfiguration, {
        options = merge(local.container.logConfiguration.options, { awslogs-stream-prefix = "maintenance" })
      })
    })]
  })
}
resource "aws_ecs_cluster" "application" {
  name = local.name
  tags = local.tags
}
resource "aws_ecs_task_definition" "bootstrap" {
  family                   = local.task_template.family
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = local.task_template.cpu
  memory                   = local.task_template.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn
  container_definitions    = jsonencode(local.task_template.containerDefinitions)
  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }
  tags = local.tags
}
resource "aws_ecs_task_definition" "maintenance_bootstrap" {
  family                   = local.maintenance_template.family
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = local.maintenance_template.cpu
  memory                   = local.maintenance_template.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.maintenance_role_arn
  container_definitions    = jsonencode(local.maintenance_template.containerDefinitions)
  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }
  tags = local.tags
}
resource "aws_ecs_service" "application" {
  name                               = local.name
  cluster                            = aws_ecs_cluster.application.id
  task_definition                    = aws_ecs_task_definition.bootstrap.arn
  desired_count                      = 0
  launch_type                        = "FARGATE"
  platform_version                   = "1.4.0"
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  health_check_grace_period_seconds  = 120
  enable_execute_command             = false
  wait_for_steady_state              = true
  deployment_circuit_breaker {
    enable   = true
    rollback = false
  }
  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.application.arn
    container_name   = "application"
    container_port   = 3000
  }
  lifecycle { ignore_changes = [desired_count, task_definition] }
  depends_on = [aws_lb_listener.http]
  tags       = local.tags
}
output "deployment" {
  value = {
    environment                          = var.environment
    cluster                              = aws_ecs_cluster.application.name
    cluster_arn                          = aws_ecs_cluster.application.arn
    service                              = aws_ecs_service.application.name
    repository_url                       = aws_ecr_repository.application.repository_url
    task_definition_template             = local.task_template
    maintenance_task_definition_template = local.maintenance_template
    maintenance_task_definition          = aws_ecs_task_definition.maintenance_bootstrap.arn
    container_name                       = local.maintenance_template.containerDefinitions[0].name
    subnet_ids                           = var.subnet_ids
    security_group_ids                   = [aws_security_group.task.id]
    buckets                              = { for name, bucket in module.buckets : name => bucket.name }
    secrets                              = { for name, secret in aws_secretsmanager_secret.application : name => secret.arn }
    url                                  = "https://${aws_cloudfront_distribution.application.domain_name}"
    distribution_id                      = aws_cloudfront_distribution.application.id
    log_group                            = aws_cloudwatch_log_group.application.name
  }
}
