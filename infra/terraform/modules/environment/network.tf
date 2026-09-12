data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "CloudFront origin traffic only"
  vpc_id      = var.vpc_id
  tags        = local.tags
}
resource "aws_security_group" "task" {
  name        = "${local.name}-task"
  description = "Private application and maintenance tasks"
  vpc_id      = var.vpc_id
  tags        = local.tags
}
resource "aws_vpc_security_group_ingress_rule" "cloudfront" {
  security_group_id = aws_security_group.alb.id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  tags              = local.tags
}
resource "aws_vpc_security_group_ingress_rule" "task" {
  security_group_id            = aws_security_group.task.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  tags                         = local.tags
}
resource "aws_vpc_security_group_egress_rule" "alb" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.task.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  tags                         = local.tags
}
resource "aws_vpc_security_group_egress_rule" "task" {
  security_group_id = aws_security_group.task.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  tags              = local.tags
}
resource "aws_lb" "application" {
  name                       = local.name
  internal                   = true
  load_balancer_type         = "application"
  subnets                    = var.subnet_ids
  security_groups            = [aws_security_group.alb.id]
  idle_timeout               = 120
  drop_invalid_header_fields = true
  tags                       = local.tags
}
resource "aws_lb_target_group" "application" {
  name                 = local.name
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 120
  health_check {
    path                = "/api/health/live"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  tags = local.tags
}
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.application.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.application.arn
  }
  tags = local.tags
}
resource "aws_cloudfront_vpc_origin" "application" {
  vpc_origin_endpoint_config {
    name                   = local.name
    arn                    = aws_lb.application.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"
    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
  tags       = local.tags
  depends_on = [aws_lb_listener.http, aws_vpc_security_group_ingress_rule.cloudfront]
}
data "aws_cloudfront_cache_policy" "disabled" { name = "Managed-CachingDisabled" }
data "aws_cloudfront_origin_request_policy" "viewer" { name = "Managed-AllViewer" }
resource "aws_wafv2_web_acl" "application" {
  provider = aws.global
  name     = local.name
  scope    = "CLOUDFRONT"
  default_action {
    allow {}
  }
  rule {
    name     = "per-ip-rate"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = 2000
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate"
      sampled_requests_enabled   = false
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.name
    sampled_requests_enabled   = false
  }
  tags = local.tags
}
resource "aws_cloudfront_distribution" "application" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = local.name
  price_class     = "PriceClass_100"
  http_version    = "http2and3"
  web_acl_id      = aws_wafv2_web_acl.application.arn
  origin {
    domain_name         = aws_lb.application.dns_name
    origin_id           = local.name
    connection_attempts = 1
    connection_timeout  = 10
    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.application.id
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }
  default_cache_behavior {
    target_origin_id         = local.name
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.viewer.id
    compress                 = true
  }
  dynamic "custom_error_response" {
    for_each = toset([400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504])
    content {
      error_code            = custom_error_response.value
      error_caching_min_ttl = 0
    }
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
  tags = local.tags
}
