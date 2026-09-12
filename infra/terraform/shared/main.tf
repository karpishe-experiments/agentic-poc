data "aws_availability_zones" "available" { state = "available" }
locals {
  zones = slice(data.aws_availability_zones.available.names, 0, 2)
}
resource "aws_vpc" "this" {
  cidr_block           = "10.24.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.project }
}
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = var.project }
}
resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  availability_zone = local.zones[count.index]
  cidr_block        = cidrsubnet(aws_vpc.this.cidr_block, 8, count.index)
  tags              = { Name = "${var.project}-public-${count.index}" }
}
resource "aws_subnet" "private" {
  for_each          = { staging-a = 10, staging-b = 11, prod-a = 20, prod-b = 21 }
  vpc_id            = aws_vpc.this.id
  availability_zone = local.zones[each.value % 2]
  cidr_block        = cidrsubnet(aws_vpc.this.cidr_block, 8, each.value)
  tags              = { Name = "${var.project}-${each.key}", Environment = split("-", each.key)[0] }
}
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.project}-nat" }
  lifecycle { prevent_destroy = true }
}
resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.this]
  tags          = { Name = var.project }
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.project}-public" }
}
resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.project}-private" }
}
resource "aws_route" "nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this.id
}
resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
  tags              = { Name = "${var.project}-s3" }
}
output "vpc_id" { value = aws_vpc.this.id }
output "private_subnet_ids" {
  value = { for env in ["staging", "prod"] : env => [aws_subnet.private["${env}-a"].id, aws_subnet.private["${env}-b"].id] }
}
output "nat_eip" { value = aws_eip.nat.public_ip }
output "nat_allocation_id" { value = aws_eip.nat.id }
