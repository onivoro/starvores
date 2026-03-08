resource "aws_iam_role" "sagemaker_role" {
  name = "sagemaker-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "sagemaker.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "redshift_access_policy" {
  name        = "redshift-access-policy"
  description = "Policy to allow access to Redshift workgroup."

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "redshift-data:ExecuteStatement",
          "redshift-data:GetStatementResult",
          "redshift-data:DescribeStatement",
          "redshift-data:ListDatabases",
          "redshift-data:ListSchemas",
          "redshift-data:ListTables"
        ],
        Resource = var.redshift_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_redshift_policy" {
  role       = aws_iam_role.sagemaker_role.name
  policy_arn = aws_iam_policy.redshift_access_policy.arn
}

resource "aws_sagemaker_notebook_instance" "notebook" {
  name          = var.sagemaker_notebook_name
  instance_type = var.instance_type
  role_arn      = aws_iam_role.sagemaker_role.arn
}

resource "aws_iam_group" "user_group" {
  name = var.iam_user_group_name
}

resource "aws_iam_group_policy_attachment" "attach_group_policy" {
  group      = aws_iam_group.user_group.name
  policy_arn = aws_iam_policy.redshift_access_policy.arn
}


# Attach necessary policies to Studio role
resource "aws_iam_role_policy_attachment" "sagemaker_studio_full_access" {
  role       = aws_iam_role.sagemaker_studio.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
}

# Additional IAM policies for maximum user permissions
resource "aws_iam_role_policy_attachment" "studio_user_sagemaker_full_access" {
  role       = aws_iam_role.sagemaker_studio.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
}

resource "aws_iam_role_policy_attachment" "studio_user_s3_access" {
  role       = aws_iam_role.sagemaker_studio.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

# Create SageMaker Studio Domain
resource "aws_sagemaker_domain" "studio" {
  domain_name = "warevim-studio-domain"
  auth_mode   = "IAM"
  vpc_id      = var.vpc_id
  subnet_ids  = var.subnet_ids

  default_user_settings {
    execution_role = aws_iam_role.sagemaker_studio.arn

    security_groups = [aws_security_group.sagemaker_studio.id]
  }
}

# Create SageMaker user profile
resource "aws_sagemaker_user_profile" "studio_user" {
  domain_id         = aws_sagemaker_domain.studio.id
  user_profile_name = var.studio_user_profile_name

  user_settings {
    execution_role = aws_iam_role.sagemaker_studio.arn

    jupyter_server_app_settings {
      default_resource_spec {
        instance_type = "system"
      }
    }

    kernel_gateway_app_settings {
      default_resource_spec {
        instance_type = var.instance_type
      }
    }
  }

  tags = {
    Name = "SageMaker Studio Admin User"
  }
}

# Create VPC security group for Studio domain
resource "aws_security_group" "sagemaker_studio" {
  name        = "sagemaker-studio-sg"
  description = "Security group for SageMaker Studio domain"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Create IAM role for SageMaker Studio domain
resource "aws_iam_role" "sagemaker_studio" {
  name = "sagemaker-studio-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "sagemaker.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# Create IAM policy for SageMaker and Redshift access
data "aws_iam_policy_document" "sagemaker_policy" {
  statement {
    effect = "Allow"
    actions = [
      "sagemaker:*Notebook*",
      "sagemaker:*Studio*",
      "sagemaker:ListTags",
      "redshift-data:BatchExecuteStatement",
      "redshift-data:ExecuteStatement",
      "redshift-data:CancelStatement",
      "redshift-data:ListStatements",
      "redshift-data:GetStatementResult",
      "redshift:GetClusterCredentials",
      "redshift:DescribeClusters",
      "redshift:ListSchemas",
      "redshift:ListTables",
      "redshift:ListDatabases"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "sagemaker_policy" {
  name        = "sagemaker-notebook-redshift-policy"
  description = "Policy for SageMaker notebook users to access notebooks and execute Redshift queries"
  policy      = data.aws_iam_policy_document.sagemaker_policy.json
}

resource "aws_iam_group_policy_attachment" "sagemaker_policy_attachment" {
  group      = var.iam_user_group_name
  policy_arn = aws_iam_policy.sagemaker_policy.arn
}