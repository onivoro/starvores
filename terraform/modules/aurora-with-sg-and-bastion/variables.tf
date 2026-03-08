variable "name" {
  type = string
  default = "main"
}

variable subnet_ids {
  type = list(string)
}

variable "vpc_cidr" {
  description = "CIDR block for the security group"
}

variable "vpc_id" {
}

variable "engine_version" {
  type = string
  default = "16.6"
}

variable "database_name" {
  type = string
  default = "postgres"
}

variable "master_username" {
  type = string
}

variable "master_password" {
  type = string
  sensitive = true
}

variable "min_capacity" {
  type = number
}

variable "max_capacity" {
  type = number
}

variable "bastion_public_key" {
  description = "Public key for bastion SSH access"
  type        = string
}

variable "bastion_subnet_id" {
  description = "Public key for bastion SSH access"
  type        = string
}

variable "kms_key_id" {
  description = "The ARN for the KMS encryption key. If not specified, the default KMS key for RDS will be used"
  type        = string
  default     = null
}

