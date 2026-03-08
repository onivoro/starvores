variable "name" {
  type = string
  default = "main"
}

variable db_subnet_group_name {
  type = string
}

variable security_group_ids {
  type = list(string)
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

variable "kms_key_id" {
  description = "The ARN for the KMS encryption key. If not specified, the default KMS key for RDS will be used"
  type        = string
  default     = null
}

variable "publicly_accessible" {
  type = bool
  default = false
}

