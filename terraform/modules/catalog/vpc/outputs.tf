output "vpc_details" {
  description = "Details of the VPC"
  value       = data.aws_vpc.target_vpc
}

output "subnet_details" {
  description = "Details of all subnets in the VPC"
  value       = data.aws_subnet.subnet_details
}

output "route_table_details" {
  description = "Details of all route tables in the VPC"
  value       = data.aws_route_table.route_table_details
}

output "network_acls" {
  description = "All Network ACLs in the VPC"
  value       = data.aws_network_acls.all
}

output "security_group_details" {
  description = "Details of all Security Groups in the VPC"
  value       = data.aws_security_group.sg_details
}

output "internet_gateway" {
  description = "Details of attached Internet Gateway"
  value       = data.aws_internet_gateway.default
}

output "nat_gateways" {
  description = "Details of NAT Gateways in the VPC"
  value       = data.aws_nat_gateways.all
}