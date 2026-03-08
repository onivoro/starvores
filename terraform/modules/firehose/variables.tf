variable "firehose_name" {
  description = "Name of the Kinesis Firehose"
  type        = string
}

variable "kinesis_stream_arn" {
  description = "The ARN of the Kinesis Data Stream"
  type        = string
}

variable "redshift_cluster" {
  description = "Redshift cluster endpoint"
  type        = string
}

variable "redshift_database" {
  description = "Redshift database name"
  type        = string
}

variable "redshift_table" {
  description = "Redshift table to write data to"
  type        = string
}

variable "redshift_role_arn" {
  description = "IAM role ARN for Redshift"
  type        = string
}

variable "redshift_master_password" {
  sensitive = true
  description = "Redshift master password"
  type        = string
}

variable "redshift_master_username" {
  description = "Redshift master username"
  type        = string
}