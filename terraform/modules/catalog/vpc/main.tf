
data "aws_vpc" "target_vpc" {
  id = var.vpc_id
}

data "aws_subnets" "all" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
}

data "aws_subnet" "subnet_details" {
  for_each = toset(data.aws_subnets.all.ids)
  id       = each.value
}

data "aws_route_tables" "all" {
  vpc_id = var.vpc_id
}

data "aws_route_table" "route_table_details" {
  for_each = toset(data.aws_route_tables.all.ids)
  route_table_id = each.value
}

data "aws_network_acls" "all" {
  vpc_id = var.vpc_id
}

data "aws_security_groups" "all" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
}

data "aws_security_group" "sg_details" {
  for_each = toset(data.aws_security_groups.all.ids)
  id       = each.value
}

data "aws_internet_gateway" "default" {
  filter {
    name   = "attachment.vpc-id"
    values = [var.vpc_id]
  }
}

data "aws_nat_gateways" "all" {
  vpc_id = var.vpc_id
}
