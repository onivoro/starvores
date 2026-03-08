# This Terraform module provisions an IAM group with specific permissions. It assumes that the IAM users have already been created.

variable "usernames" {
  description = "List of usernames to create."
  type        = list(string)
}

variable "group_name" {
  description = "Name of the IAM group to create."
  type        = string
}

resource "aws_iam_group" "group" {
  name = var.group_name
}

resource "aws_iam_group_policy_attachment" "ecr_access" {
  group      = aws_iam_group.group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess"
}

resource "aws_iam_group_policy_attachment" "s3_access" {
  group      = aws_iam_group.group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

resource "aws_iam_group_policy_attachment" "ecs_access" {
  group      = aws_iam_group.group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonECS_FullAccess"
}

resource "aws_iam_group_policy_attachment" "cloudwatch_access" {
  group      = aws_iam_group.group.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

resource "aws_iam_group_policy_attachment" "change_password" {
  group      = aws_iam_group.group.name
  policy_arn = "arn:aws:iam::aws:policy/IAMUserChangePassword"
}

resource "aws_iam_user_group_membership" "group_membership" {
  for_each = toset(var.usernames)
  user     = each.key # Reference existing users by their usernames
  groups   = [aws_iam_group.group.name]
}

output "group_name" {
  value = aws_iam_group.group.name
}
