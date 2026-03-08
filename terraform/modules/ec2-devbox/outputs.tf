output "instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.dev_instance.id
}

output "instance_public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_eip.dev_eip.public_ip
}

output "instance_private_ip" {
  description = "Private IP address of the EC2 instance"
  value       = aws_instance.dev_instance.private_ip
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = var.ssh_port == 22 ? "ssh -i ~/.ssh/${var.friendly_name} ubuntu@${aws_eip.dev_eip.public_ip}" : "ssh -i ~/.ssh/${var.friendly_name} -p ${var.ssh_port} ubuntu@${aws_eip.dev_eip.public_ip}"
}

output "vscode_remote_ssh_config" {
  description = "VS Code Remote SSH configuration"
  value = <<-EOT
Host ${var.friendly_name}
    HostName ${aws_eip.dev_eip.public_ip}
    User ubuntu${var.ssh_port != 22 ? "\n    Port ${var.ssh_port}" : ""}
    IdentityFile ~/.ssh/${var.friendly_name}
    ServerAliveInterval 60
    ServerAliveCountMax 3
EOT
}