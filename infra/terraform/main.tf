# ==============================================================================
# RescueNet Cloud Infrastructure as Code (Terraform Sample for AWS / EKS)
# Provisions: VPC, RDS PostgreSQL + PostGIS, EKS Cluster, and Application Load Balancer
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  default = "ap-south-1" # Mumbai region
}

variable "environment" {
  default = "production"
}

# 1. Virtual Private Cloud
resource "aws_vpc" "rescuenet_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "rescuenet-${var.environment}-vpc"
    Environment = var.environment
  }
}

# 2. RDS PostgreSQL with PostGIS Extension
resource "aws_db_instance" "rescuenet_db" {
  identifier             = "rescuenet-${var.environment}-db"
  allocated_storage      = 100
  max_allocated_storage  = 500
  engine                 = "postgres"
  engine_version         = "16.2"
  instance_class         = "db.r6g.large"
  db_name                = "rescuenet"
  username               = "rescuenet_admin"
  password               = var.db_password
  parameter_group_name   = "default.postgres16"
  skip_final_snapshot    = false
  final_snapshot_identifier = "rescuenet-final-snapshot"
  backup_retention_period = 30
  storage_encrypted      = true
  multi_az               = true

  tags = {
    Name        = "rescuenet-postgres-postgis"
    Environment = var.environment
  }
}

variable "db_password" {
  type      = string
  sensitive = true
}

# 3. Output Database Connection String
output "database_endpoint" {
  value       = aws_db_instance.rescuenet_db.endpoint
  description = "RDS Endpoint for RescueNet backend"
}
