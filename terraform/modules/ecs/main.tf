locals {
  prefix         = var.PREFIX
  image          = "${var.AWS_ECR}:${var.IMAGE_TAG}"
  container_name = "${local.prefix}-container"
  tags = {
    prefix : local.prefix
  }
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

resource "aws_iam_role_policy_attachment" "task_execution_dynamo" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
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
  desired_count   = 1
  depends_on      = [aws_iam_role.ecs_task_execution_role, aws_alb_listener.ecs_load_balancer_https_listener, aws_alb_listener.ecs_load_balancer_http_listener]
  launch_type     = "FARGATE"

  network_configuration {
    assign_public_ip = false
    subnets          = var.ECS_SERVICE_SUBNETS    
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.ecs_lb_target.arn
    container_name   = local.container_name
    container_port   = var.PORT
  }

  tags = local.tags
}

resource "aws_security_group" "allow_http_https_sg" {
  name = "${local.prefix}-sg"

  vpc_id = var.AWS_VPC_ID

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "ingress_rule_for_lb_sg" {
  depends_on = [aws_security_group.allow_http_https_sg]

  security_group_id            = var.SECURITY_GROUP_ID
  ip_protocol                  = "-1"
  referenced_security_group_id = aws_security_group.allow_http_https_sg.id

  tags = local.tags
}

resource "aws_route53_zone" "subdomain_zone" {
  name = "${var.SUB_DOMAIN}.${var.ZONE_NAME}"

  tags = local.tags
}

resource "aws_route53_record" "zone_record" {
  type    = "NS"
  zone_id = var.ZONE_ID
  name    = aws_route53_zone.subdomain_zone.name
  ttl     = "86400"
  records = aws_route53_zone.subdomain_zone.name_servers
}

resource "aws_lb" "ecs_lb" {
  name               = "${local.prefix}-lb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.allow_http_https_sg.id]
  subnets            = var.ECS_SERVICE_SUBNETS

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

resource "aws_alb_listener" "ecs_load_balancer_https_listener" {
  load_balancer_arn = aws_lb.ecs_lb.arn
  certificate_arn   = var.CERT_ARN
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"

  default_action {
    target_group_arn = aws_alb_target_group.ecs_lb_target.id
    type             = "forward"
  }

  tags = local.tags
}

resource "aws_alb_listener" "ecs_load_balancer_http_listener" {
  load_balancer_arn = aws_lb.ecs_lb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = local.tags
}

resource "aws_route53_record" "app_record" {
  zone_id = aws_route53_zone.subdomain_zone.zone_id
  name    = ""
  type    = "A"
  alias {
    name                   = aws_lb.ecs_lb.dns_name
    zone_id                = aws_lb.ecs_lb.zone_id
    evaluate_target_health = false
  }
}
