mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["eu-west-1a", "eu-west-1b", "eu-west-1c"] }
  }
}
variables { aws_account_id = "123456789012" }
run "isolated_subnets" {
  command = plan
  assert {
    condition     = length(aws_subnet.private) == 4 && length(aws_subnet.public) == 2
    error_message = "Each environment needs separate private subnets across two zones."
  }
  assert {
    condition     = aws_subnet.private["staging-a"].cidr_block != aws_subnet.private["prod-a"].cidr_block
    error_message = "Staging and production subnet ranges must differ."
  }
  assert {
    condition     = aws_vpc_endpoint.s3.vpc_endpoint_type == "Gateway"
    error_message = "S3 traffic must use the gateway endpoint."
  }
}
