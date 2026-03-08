resource "aws_rds_cluster" "aurora_serverless" {
  cluster_identifier  = "${var.name}-serverless-cluster"
  engine              = "aurora-postgresql"
  engine_mode         = "provisioned"
  engine_version          = var.engine_version
  database_name           = var.database_name
  master_username         = var.master_username
  master_password         = var.master_password
  vpc_security_group_ids  = var.security_group_ids
  db_subnet_group_name    = var.db_subnet_group_name
  skip_final_snapshot = true

  # Enable encryption at rest
  storage_encrypted   = true
  kms_key_id         = var.kms_key_id

  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }
}

resource "aws_rds_cluster_instance" "aurora_instance" {
  cluster_identifier = aws_rds_cluster.aurora_serverless.id
  instance_class     = "db.serverless"
  engine             = "aurora-postgresql"
  engine_version     = var.engine_version
  publicly_accessible = var.publicly_accessible
}
