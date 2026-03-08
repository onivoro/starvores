variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-west-2"
}

variable "project_name" {
  description = "Name of the project for resource naming"
  type        = string
  default     = "remote-devbox"
}

variable "friendly_name" {
  description = "Friendly name for SSH configuration and key file references"
  type        = string
  default     = "remote-devbox"
}

variable "vpc_id" {
  description = "ID of the existing VPC to use"
  type        = string
}

variable "subnet_id" {
  description = "ID of the existing subnet to use (must be in the specified VPC)"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "volume_size" {
  description = "Root volume size in GB"
  type        = number
  default     = 50
}

variable "allowed_cidr" {
  description = "CIDR block allowed to access the instance (your IP)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "ssh_key_path" {
  description = "Path to the SSH public key file"
  type        = string
  default     = ""
}

variable "username" {
  description = "Username for the development environment"
  type        = string
  default     = "developer"
}

variable "ssh_port" {
  description = "SSH port for the instance"
  type        = number
  default     = 22
}