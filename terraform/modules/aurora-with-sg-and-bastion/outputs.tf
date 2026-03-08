output "aurora_security_group_id" {
  description = "Security group ID for Aurora cluster"
  value       = aws_security_group.aurora_sg.id
}

output "aurora_cluster_endpoint" {
  description = "Endpoint for Aurora Serverless cluster"
  value       = aws_rds_cluster.aurora_serverless.endpoint
}

output "bastion_public_ip" {
  description = "Public IP of the bastion host"
  value       = aws_instance.bastion.public_ip
}

output "bastion_security_group_id" {
  description = "Security group ID for bastion host"
  value       = aws_security_group.bastion_sg.id
}

output "aurora_cluster_encrypted" {
  description = "Whether the Aurora cluster is encrypted"
  value       = aws_rds_cluster.aurora_serverless.storage_encrypted
}

output "aurora_cluster_kms_key_id" {
  description = "The KMS key ID used for Aurora cluster encryption"
  value       = aws_rds_cluster.aurora_serverless.kms_key_id
}