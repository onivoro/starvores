variable "name" {
  description = "Name prefix for the load balancer resources"
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC where the load balancer will be created"
  type        = string
}

variable "subnets" {
  description = "List of subnet IDs where the load balancer will be provisioned"
  type        = list(string)
}

variable "security_groups" {
  description = "List of security group IDs to attach to the load balancer"
  type        = list(string)
}

variable "certificate_arn" {
  description = "ARN of the ACM certificate to use for HTTPS"
  type        = string
}

variable "tags" {
  description = "A map of tags to assign to the load balancer"
  type        = map(string)
  default     = {}
}