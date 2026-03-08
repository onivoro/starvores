variable "AWS_ECR" { type = string }
variable "AWS_REGION" {
  type = string
}
variable "AWS_VPC_ID" {
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
variable "CERT_ARN" {
  type = string
}
variable "SECURITY_GROUPS" {
  type = list(string)
}
variable "AWS_LB_LISTENER_ARN" {
  type = string
}
variable "DOMAIN" {
  type = string
}
variable "SERVICE_TASK_COUNT" {
  type = number
  default = 1
}

variable "assign_public_ip" {
  default = false
  type = bool
}