variable "application_name" {
  description = "The name of the Azure AD application"
  type        = string
}

variable "domain_prefix" {
  description = "The prefix for the Cognito domain"
  type        = string
}

variable "aws_region" {
  description = "The AWS region where Cognito is deployed"
  type        = string
}