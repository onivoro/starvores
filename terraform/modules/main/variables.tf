variable "AWS_ECR" {
  type = string
}

variable "AWS_REGION" {
  type = string
}

variable "CPU" {
  type = number
}

variable "DOMAIN" {
  type = string
}

variable "IMAGE_TAG" {
  type = string
}

variable "MEMORY" {
  type = number
}

variable "PORT" {
  type = number
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
