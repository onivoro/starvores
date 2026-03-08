variable "sns_role_external_id" {
  type = string
}

# variables.tf
variable "environment" {
  description = "Environment name (e.g. dev, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name to be used in resource naming"
  type        = string
}

variable "user_pool_name" {
  description = "Name of the Cognito User Pool"
  type        = string
}

variable "client_name" {
  description = "Name of the Cognito User Pool Client"
  type        = string
}

variable "password_minimum_length" {
  description = "Minimum length of password"
  type        = number
  default     = 8
}

# main.tf

data "aws_iam_policy_document" "sms_role_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["cognito-idp.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [var.sns_role_external_id]
    }
  }
}

data "aws_iam_policy_document" "sns_publish" {
  statement {
    actions = [
      "sns:publish"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "sms_role" {
  name               = "${var.project_name}-${var.environment}-cognito-sms"
  assume_role_policy = data.aws_iam_policy_document.sms_role_trust.json
}

resource "aws_iam_role_policy" "sns_publish" {
  name   = "sns-publish"
  role   = aws_iam_role.sms_role.id
  policy = data.aws_iam_policy_document.sns_publish.json
}

resource "aws_cognito_user_pool" "pool" {
  name = "${var.project_name}-${var.environment}-${var.user_pool_name}"

  mfa_configuration = "ON"

  # Add dependency to ensure IAM role is fully configured before user pool
  depends_on = [aws_iam_role_policy.sns_publish]

  sms_configuration {
    external_id    = var.sns_role_external_id
    sns_caller_arn = aws_iam_role.sms_role.arn
  }

  sms_authentication_message = "Your COGVIMO authentication code is {####}"

  password_policy {
    minimum_length                   = var.password_minimum_length
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  username_attributes = ["email"]

  schema {
    attribute_data_type = "String"
    name               = "email"
    required           = true
    mutable           = true

    string_attribute_constraints {
      min_length = 5
      max_length = 255
    }
  }

  schema {
    attribute_data_type = "String"
    name               = "phone_number"
    mutable           = true

    string_attribute_constraints {
      min_length = 10
      max_length = 15
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name         = "${var.project_name}-${var.environment}-${var.client_name}"
  user_pool_id = aws_cognito_user_pool.pool.id

  generate_secret = true

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity     = 1
  refresh_token_validity = 30
}

# outputs.tf
output "user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.pool.id
}

output "user_pool_arn" {
  description = "ARN of the Cognito User Pool"
  value       = aws_cognito_user_pool.pool.arn
}

output "client_id" {
  description = "ID of the Cognito User Pool Client"
  value       = aws_cognito_user_pool_client.client.id
}

output "client_secret" {
  description = "Secret of the Cognito User Pool Client"
  value       = aws_cognito_user_pool_client.client.client_secret
  sensitive   = true
}

output "sms_role_arn" {
  description = "ARN of the IAM role used for SMS sending"
  value       = aws_iam_role.sms_role.arn
}

output "sns_role_external_id" {
  description = "External ID used for the SMS IAM role"
  value       = var.sns_role_external_id
  sensitive   = true
}