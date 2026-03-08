#!/bin/bash

# Update system
apt-get update -y
apt-get upgrade -y

# Install essential packages
apt-get install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    tree \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential

# Install Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Python 3.11 and pip
add-apt-repository ppa:deadsnakes/ppa -y
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

# Install Python package managers
python3 -m pip install --upgrade pip
python3 -m pip install pipenv poetry

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf aws awscliv2.zip

# Install GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update -y
apt-get install -y gh

# Install Terraform
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list
apt-get update -y
apt-get install -y terraform

# Create development user if specified
if [ "${username}" != "ubuntu" ]; then
    useradd -m -s /bin/bash ${username}
    usermod -aG sudo,docker ${username}
    
    # Copy SSH keys
    mkdir -p /home/${username}/.ssh
    cp /home/ubuntu/.ssh/authorized_keys /home/${username}/.ssh/
    chown -R ${username}:${username} /home/${username}/.ssh
    chmod 700 /home/${username}/.ssh
    chmod 600 /home/${username}/.ssh/authorized_keys
fi

# Set up development directories
mkdir -p /home/ubuntu/projects
chown ubuntu:ubuntu /home/ubuntu/projects

# Configure Git (placeholder - user will need to set their own)
sudo -u ubuntu git config --global init.defaultBranch main
sudo -u ubuntu git config --global pull.rebase false

# Install common development tools
npm install -g yarn pnpm @angular/cli @vue/cli create-react-app typescript ts-node nodemon
python3 -m pip install black flake8 mypy pytest jupyter

# Configure SSH for better VS Code Remote experience
echo "ClientAliveInterval 60" >> /etc/ssh/sshd_config
echo "ClientAliveCountMax 3" >> /etc/ssh/sshd_config

# Configure custom SSH port if not default
if [ "${ssh_port}" != "22" ]; then
    echo "Port ${ssh_port}" >> /etc/ssh/sshd_config
fi

systemctl restart sshd

# Enable and start services
systemctl enable docker
systemctl start docker

# Clean up
apt-get autoremove -y
apt-get autoclean

echo "Development environment setup complete!" > /var/log/user-data.log