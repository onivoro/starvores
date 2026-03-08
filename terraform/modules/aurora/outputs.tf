output "aurora_cluster_endpoint" {
  description = "Endpoint for Aurora Serverless cluster"
  value       = aws_rds_cluster.aurora_serverless.endpoint
}

output "aurora_cluster_encrypted" {
  description = "Whether the Aurora cluster is encrypted"
  value       = aws_rds_cluster.aurora_serverless.storage_encrypted
}

output "aurora_cluster_kms_key_id" {
  description = "The KMS key ID used for Aurora cluster encryption"
  value       = aws_rds_cluster.aurora_serverless.kms_key_id
}