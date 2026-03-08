locals {
  PREFIX = replace("${var.SUB_DOMAIN}.${var.DOMAIN}", ".", "-")
}

module "domain_data" {
  source = "../domain-data"

  AWS_REGION = var.AWS_REGION
  DOMAIN     = var.DOMAIN
}

module "ecs" {
  source = "../ecs"

  AWS_ECR             = var.AWS_ECR
  AWS_REGION          = var.AWS_REGION
  AWS_VPC_ID          = module.domain_data.domain_vpc.id
  CERT_ARN            = module.domain_data.domain_cert.arn
  CPU = var.CPU
  ECS_SERVICE_SUBNETS = module.domain_data.domain_az_subnets
  IMAGE_TAG           = var.IMAGE_TAG
  MEMORY = var.MEMORY
  PORT                = var.PORT
  PREFIX              = local.PREFIX
  SUB_DOMAIN          = var.SUB_DOMAIN
  TASK_VARS = var.TASK_VARS
  SECURITY_GROUP_ID = module.domain_data.domain_security_group.id
  ZONE_ID           = module.domain_data.domain_zone.id
  ZONE_NAME         = module.domain_data.domain_zone.name
}
