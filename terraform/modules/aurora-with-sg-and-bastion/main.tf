resource "aws_security_group" "aurora_sg" {
  name        = "${var.name}-aurora-sg"
  description = "(${var.name}) Security group for Aurora PostgreSQL Serverless"
  vpc_id      = var.vpc_id

  ingress {
    description = "(${var.name}) PostgreSQL from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    security_groups = [aws_security_group.bastion_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name}-aurora-sg"
  }
}

resource "aws_db_subnet_group" "aurora_subnet_group" {
  name       = "${var.name}-aurora-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "aurora-subnet-group"
  }
}

resource "aws_rds_cluster" "aurora_serverless" {
  cluster_identifier  = "${var.name}-aurora-serverless-cluster"
  engine              = "aurora-postgresql"
  engine_mode         = "provisioned"
  engine_version          = var.engine_version
  database_name           = var.database_name
  master_username         = var.master_username
  master_password         = var.master_password
  vpc_security_group_ids  = [aws_security_group.aurora_sg.id]
  db_subnet_group_name    = aws_db_subnet_group.aurora_subnet_group.name
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
  publicly_accessible = false
}

resource "aws_security_group" "bastion_sg" {
  name        = "${var.name}-bastion-security-group"
  description = "(${var.name}) Security group for bastion host"
  vpc_id      = var.vpc_id

  ingress {
    description = "(${var.name}) SSH from anywhere"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name}-bastion-sg"
  }
}

# EC2 Key Pair for SSH
resource "aws_key_pair" "bastion_key" {
  key_name   = "${var.name}-bastion-key"
  public_key = var.bastion_public_key  # You'll need to provide this
}

# Bastion EC2 Instance
resource "aws_instance" "bastion" {
  ami                    = "ami-0e83be366243f524a"  # Amazon Linux 2 AMI for us-east-2, update as needed
  instance_type          = "t2.micro"
  subnet_id              = var.bastion_subnet_id
  vpc_security_group_ids = [aws_security_group.bastion_sg.id]
  key_name               = aws_key_pair.bastion_key.key_name
  associate_public_ip_address = true

  tags = {
    Name = "bastion-host"
  }
}