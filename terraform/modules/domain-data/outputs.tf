output "domain_az_subnets" {
  value = local.subnets
}

output "domain_cert" {
  value = data.aws_acm_certificate.domain_cert
}

output "domain_security_group" {
  value = data.aws_security_group.default_security_group
}

output "domain_vpc" {
  value = data.aws_vpc.default_vpc
}

output "domain_zone" {
  value = data.aws_route53_zone.domain_zone
}
