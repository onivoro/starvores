
locals {
  ssh_key_path = var.ssh_key_path != "" ? var.ssh_key_path : "~/.ssh/${var.friendly_name}.pub"
}

data "local_file" "ssh_key" {
  filename = pathexpand(local.ssh_key_path)
}

locals {
  ssh_public_key = chomp(data.local_file.ssh_key.content)
}

resource "aws_security_group" "dev_sg" {
  name        = "${var.project_name}-sg"
  description = "Security group for development instance"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH"
    from_port   = var.ssh_port
    to_port     = var.ssh_port
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Development ports"
    from_port   = 3000
    to_port     = 9000
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-sg"
  }
}

resource "aws_key_pair" "dev_key" {
  key_name   = "${var.project_name}-key"
  public_key = local.ssh_public_key
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "dev_instance" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.dev_key.key_name
  vpc_security_group_ids = [aws_security_group.dev_sg.id]
  subnet_id              = var.subnet_id

  root_block_device {
    volume_type = "gp3"
    volume_size = var.volume_size
    encrypted   = true
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    username = var.username
    ssh_port = var.ssh_port
  }))

  tags = {
    Name = "${var.project_name}-instance"
  }
}

resource "aws_eip" "dev_eip" {
  instance = aws_instance.dev_instance.id
  domain   = "vpc"

  tags = {
    Name = "${var.project_name}-eip"
  }
}