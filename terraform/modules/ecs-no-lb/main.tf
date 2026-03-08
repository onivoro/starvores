locals {
  prefix         = var.PREFIX
  image          = "${var.AWS_ECR}:${var.IMAGE_TAG}"
  container_name = "${local.prefix}-container"
  tags = {
    prefix : local.prefix
  }
}

data "aws_lb_listener" "existing_lb_listener" {
  arn = var.AWS_LB_LISTENER_ARN
}

resource "aws_ecs_cluster" "cluster" {
  name = "${local.prefix}-cluster"

  tags = local.tags
}

resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${local.prefix}-ecsTaskExecutionRole"

  assume_role_policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Action" : "sts:AssumeRole",
        "Principal" : {
          "Service" : "ecs-tasks.amazonaws.com"
        },
        "Effect" : "Allow",
        "Sid" : ""
      }
    ]
  })

  tags = local.tags
}

resource "aws_cloudwatch_log_group" "log_group" {
  name = local.prefix

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "ecs-task-execution-role-policy-attachment" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "task_execution_logs" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

resource "aws_iam_role_policy_attachment" "task_execution_rds" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonRDSFullAccess"
}

resource "aws_iam_role_policy_attachment" "task_ecr" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess"
}

resource "aws_iam_role_policy_attachment" "task_logs" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

resource "aws_iam_role_policy_attachment" "task_s3" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

resource "aws_iam_role_policy_attachment" "task_load_balancing" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess"
}

# resource "aws_iam_role_policy_attachment" "task_iam" {
#   role       = aws_iam_role.ecs_task_execution_role.name
#   policy_arn = "arn:aws:iam::aws:policy/IAMFullAccess"
# }

resource "aws_iam_role_policy_attachment" "task_redshift_data" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonRedshiftDataFullAccess"
}

resource "aws_iam_role_policy_attachment" "task_redshift" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonRedshiftFullAccess"
}

resource "aws_iam_role_policy_attachment" "task_ecs_full" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonECS_FullAccess"
}

resource "aws_ecs_task_definition" "definition" {
  family                   = "${local.prefix}-family"
  task_role_arn            = aws_iam_role.ecs_task_execution_role.arn
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  network_mode             = "awsvpc"
  cpu                      = var.CPU
  memory                   = var.MEMORY
  requires_compatibilities = ["FARGATE"]

  container_definitions = jsonencode([
    {
      "image" : "${var.AWS_ECR}:${var.IMAGE_TAG}",
      "name" : "${local.container_name}",
      "portMappings" : [
        {
          "protocol" : "tcp",
          "containerPort" : var.PORT,
          "hostPort" : var.PORT
        }
      ],
      "logConfiguration" : {
        "logDriver" : "awslogs",
        "options" : {
          "awslogs-group" : "${local.prefix}",
          "awslogs-region" : "${var.AWS_REGION}",
          "awslogs-stream-prefix" : "ecs"
        }
      },
      "environment" : var.TASK_VARS
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "api_service" {
  name            = "${local.prefix}-service"
  cluster         = aws_ecs_cluster.cluster.id
  task_definition = aws_ecs_task_definition.definition.arn
  desired_count   = var.SERVICE_TASK_COUNT
  launch_type     = "FARGATE"

  network_configuration {
    assign_public_ip = var.assign_public_ip
    subnets          = var.ECS_SERVICE_SUBNETS
    security_groups = var.SECURITY_GROUPS
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.ecs_lb_target.arn
    container_name   = local.container_name
    container_port   = var.PORT
  }

  tags = local.tags
}

resource "aws_alb_target_group" "ecs_lb_target" {
  name        = "${local.prefix}-lbt"
  port        = var.PORT
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.AWS_VPC_ID

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 300
  }

  health_check {
    enabled  = true
    matcher  = 200
    port     = var.PORT
    protocol = "HTTP"
    path     = "/api/health"
  }

  tags = local.tags
}

resource "aws_lb_listener_rule" "listener_rule_forwarding" {
  listener_arn = data.aws_lb_listener.existing_lb_listener.arn
  priority     = var.PORT

  lifecycle {
    create_before_destroy = true
  }

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.ecs_lb_target.arn
  }

  condition {
    host_header {
      values = ["${var.SUB_DOMAIN}.${var.DOMAIN}"]
    }
  }

  tags = {
    Name : local.prefix
  }
}
