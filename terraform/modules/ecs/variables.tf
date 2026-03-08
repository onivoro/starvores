variable "AWS_ECR" { type = string }
variable "AWS_REGION" {
  type = string
}
variable "AWS_VPC_ID" {
  type = string
}
variable "CERT_ARN" {
  type = string
}
variable "CPU" {
  type    = number
}
variable "ECS_SERVICE_SUBNETS" {
  type = set(string)
}
variable "IMAGE_TAG" { type = string }
variable "MEMORY" { type = number }
variable "PORT" {
  type = number
}
variable "PREFIX" {
  type = string
}
variable "SECURITY_GROUP_ID" {
  type = string
}
variable "SUB_DOMAIN" {
  type = string
}
variable "TASK_VARS" {
  sensitive = true
  type = list(object({
    name  = string
    value = string
  }))
}
variable "ZONE_ID" {
  type = string
}
variable "ZONE_NAME" {
  type = string
}