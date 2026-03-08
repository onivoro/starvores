data "aws_route53_zone" "domain_zone" {
  name = var.DOMAIN
}

data "aws_acm_certificate" "domain_cert" {
  domain      = var.DOMAIN
  types       = ["AMAZON_ISSUED"]
  most_recent = true
}

data "aws_vpc" "default_vpc" {
  filter {
    name   = "tag:domain"
    values = [var.DOMAIN]
  }
}

data "aws_subnets" "default_vpc_subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default_vpc.id]
  }
}

data "aws_security_group" "default_security_group" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default_vpc.id]
  }

  filter {
    name   = "group-name"
    values = ["default"]
  }
}

data "aws_subnet" "default_vpc_subnet" {
  for_each = toset(data.aws_subnets.default_vpc_subnets.ids)
  id       = each.key
}

locals {
  availability_zone_subnets = {
    for s in data.aws_subnet.default_vpc_subnet : s.availability_zone => s.id...
  }

  subnets = [for subnet_ids in local.availability_zone_subnets : subnet_ids[0]]
}
