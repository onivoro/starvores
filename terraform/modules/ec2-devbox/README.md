# Remote AWS Development Box

Terraform configuration to provision an AWS EC2 instance optimized for remote development with VS Code Remote SSH.

## Features

- Ubuntu 22.04 LTS with development tools pre-installed
- Node.js 20, Python 3.11, Docker, and Docker Compose
- GitHub CLI, AWS CLI, and Terraform
- Pre-configured for VS Code Remote SSH development
- Uses existing VPC infrastructure with secure security groups and encrypted storage

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform installed (>= 1.0)
3. SSH key pair generated
4. Existing VPC with a public subnet (with internet gateway route)

## Quick Start

### 1. Generate SSH Key Pair (if you don't have one)

```bash
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/my-devbox
```

### 2. Create terraform.tfvars

```hcl
vpc_id        = "vpc-xxxxxxxxx"           # Your existing VPC ID
subnet_id     = "subnet-xxxxxxxxx"       # Public subnet ID in the VPC
allowed_cidr  = "YOUR_IP/32"             # Replace with your public IP
aws_region    = "us-west-2"
project_name  = "my-devbox"
friendly_name = "my-devbox"              # Used for SSH config host name and key file names
instance_type = "t3.medium"
# ssh_key_path = "~/.ssh/my-custom-key.pub"  # Optional: defaults to ~/.ssh/{friendly_name}.pub
# ssh_port     = 2222                        # Optional: defaults to 22
```

### 3. Configure Backend (Optional but Recommended)

For production use, configure remote state in `backend.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "your-terraform-state-bucket"
    key            = "remote-devbox/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
```

### 4. Deploy Infrastructure

```bash
terraform init
terraform plan
terraform apply
```

### 5. Configure VS Code Remote SSH

Add the output configuration to your `~/.ssh/config`:

```
Host remote-devbox
    HostName <INSTANCE_PUBLIC_IP>
    User ubuntu
    IdentityFile ~/.ssh/remote-devbox
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### 6. Connect with VS Code

1. Install the "Remote - SSH" extension
2. Open Command Palette (Cmd/Ctrl + Shift + P)
3. Run "Remote-SSH: Connect to Host"
4. Select your configured host name (e.g., "my-devbox")

## Installed Software

- **Languages**: Node.js 20, Python 3.11
- **Package Managers**: npm, yarn, pnpm, pip, pipenv, poetry
- **Tools**: Git, GitHub CLI, AWS CLI, Terraform, Docker, Docker Compose
- **Development**: TypeScript, common CLI tools, Jupyter

## Security Considerations

- Security group restricts SSH access to your IP (set via `allowed_cidr`)
- Development ports (3000-9000) only accessible from your IP
- Root volume is encrypted
- Regular security updates via automated patching

## Customization

### Instance Size
Modify `instance_type` in variables.tf or terraform.tfvars:
- `t3.small` - 2 vCPU, 2GB RAM (basic development)
- `t3.medium` - 2 vCPU, 4GB RAM (recommended)
- `t3.large` - 2 vCPU, 8GB RAM (heavy workloads)

### Storage
Adjust `volume_size` variable (default: 50GB)

### SSH Port
Set `ssh_port` variable to use a custom port (default: 22). Custom ports reduce automated attacks:
- Common choices: 2222, 2200, or any port 1024-65535
- Terraform will automatically update security group and SSH config

### Additional Software
Modify `user_data.sh` to install additional packages

## Costs

Estimated monthly costs (us-west-2):
- t3.medium instance: ~$30/month
- 50GB EBS storage: ~$5/month
- Elastic IP: ~$3.65/month (if instance is stopped)

## Cleanup

```bash
terraform destroy
```

## Troubleshooting

### Can't connect via SSH
- Verify security group allows your current IP
- Check that the instance is running
- Ensure SSH key permissions: `chmod 600 ~/.ssh/{your-key-name}`

### VS Code Remote SSH issues
- Update VS Code and Remote SSH extension
- Check SSH connection works from terminal first
- Restart VS Code if connection hangs