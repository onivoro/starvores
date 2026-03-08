output "cluster_endpoint" {
  value = aws_redshift_cluster.redshift.endpoint
}

output "role_arn" {
  value = aws_iam_role.redshift_role.arn
}