variable "cluster_identifier" {
  description = "The identifier for the Redshift cluster"
  type        = string
}

variable "database_name" {
  description = "The Redshift database name"
  type        = string
}

variable "master_username" {
  description = "The Redshift master username"
  type        = string
}

variable "master_password" {
  description = "The Redshift master password"
  type        = string
}

variable "node_type" {
  description = "Node type for the Redshift cluster"
  type        = string
  default     = "dc2.large"
}