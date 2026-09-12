locals {
  # Read APIs omit all value-bearing Secrets Manager operations and S3 object reads.
  read_statement = {
    Effect = "Allow"
    Action = [
      "sts:GetCallerIdentity", "ec2:Describe*", "ecs:Describe*", "ecs:List*",
      "elasticloadbalancing:Describe*", "cloudfront:Get*", "cloudfront:List*",
      "wafv2:Get*", "wafv2:List*", "ecr:Describe*", "ecr:GetLifecyclePolicy",
      "ecr:GetRepositoryPolicy", "ecr:ListTagsForResource",
      "logs:DescribeLogGroups", "logs:ListTagsForResource",
      "secretsmanager:DescribeSecret", "secretsmanager:ListSecretVersionIds",
      "secretsmanager:GetResourcePolicy", "iam:GetRole", "iam:GetRolePolicy",
      "iam:ListRolePolicies", "iam:ListAttachedRolePolicies"
    ]
    Resource = "*"
  }
  bucket_read_actions = [
    "s3:GetBucketLocation", "s3:GetBucketPolicy", "s3:GetBucketAcl", "s3:GetBucketVersioning",
    "s3:GetEncryptionConfiguration", "s3:GetBucketPublicAccessBlock", "s3:GetBucketOwnershipControls",
    "s3:GetLifecycleConfiguration", "s3:GetBucketTagging", "s3:GetBucketCors",
    "s3:GetBucketLogging", "s3:GetBucketObjectLockConfiguration",
    "s3:GetBucketRequestPayment", "s3:GetBucketWebsite", "s3:GetBucketNotification",
    "s3:GetAccelerateConfiguration", "s3:GetReplicationConfiguration"
  ]
  state_statements = { for key, cfg in local.roles : key => [
    {
      Effect    = "Allow", Action = ["s3:ListBucket", "s3:GetBucketLocation"], Resource = local.state_arn,
      Condition = { StringLike = { "s3:prefix" = ["${var.project}/bootstrap.tfstate", "${var.project}/shared.tfstate", "${var.project}/${cfg.scope}.tfstate*"] } }
    },
    {
      Effect = "Allow", Action = ["s3:GetBucketLocation"], Resource = local.state_arn
    },
    {
      Effect = "Allow", Action = ["s3:GetObject"], Resource = distinct([
        "${local.state_arn}/${var.project}/bootstrap.tfstate",
        "${local.state_arn}/${var.project}/shared.tfstate",
        "${local.state_arn}/${var.project}/${cfg.scope}.tfstate"
      ])
    }
  ] }
  ops_statements = [
    { Effect = "Allow", Action = ["s3:GetBucketLocation"], Resource = local.ops_arn },
    { Effect = "Allow", Action = ["s3:ListBucket"], Resource = local.ops_arn, Condition = { StringLike = { "s3:prefix" = ["operations/*"] } } },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${local.ops_arn}/operations/*" }
  ]
  state_write_statements = { for key, cfg in local.roles : key => [
    { Effect = "Allow", Action = ["s3:PutObject"], Resource = "${local.state_arn}/${var.project}/${cfg.scope}.tfstate" },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${local.state_arn}/${var.project}/${cfg.scope}.tfstate.tflock" }
  ] }
  # Boundaries prevent role escalation and deletion of recovery material.
  safeguards = [
    {
      Effect   = "Deny",
      Action   = ["iam:Create*", "iam:Update*", "iam:Delete*", "iam:Put*", "iam:Attach*", "iam:Detach*", "iam:Add*", "iam:Remove*", "iam:Set*", "sts:AssumeRole", "ec2:ReleaseAddress"],
      Resource = "*"
    },
    {
      Effect   = "Deny", Action = ["s3:DeleteBucket", "s3:DeleteObjectVersion"],
      Resource = [local.state_arn, "${local.state_arn}/*", local.ops_arn, "${local.ops_arn}/*", "arn:aws:s3:::${local.prefix}-*-recovery", "arn:aws:s3:::${local.prefix}-*-recovery/*"]
    },
    {
      Effect = "Deny", Action = ["s3:PutObject", "s3:DeleteObject"], Resource = "${local.state_arn}/${var.project}/bootstrap.tfstate*"
    },
    {
      Effect = "Deny", Action = ["secretsmanager:GetSecretValue", "secretsmanager:BatchGetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret"], Resource = "*"
    }
  ]
  ec2_actions = [
    "ec2:CreateVpc", "ec2:DeleteVpc", "ec2:ModifyVpcAttribute",
    "ec2:CreateSubnet", "ec2:DeleteSubnet", "ec2:ModifySubnetAttribute",
    "ec2:CreateInternetGateway", "ec2:AttachInternetGateway", "ec2:DetachInternetGateway", "ec2:DeleteInternetGateway",
    "ec2:AllocateAddress", "ec2:CreateNatGateway", "ec2:DeleteNatGateway",
    "ec2:CreateRouteTable", "ec2:DeleteRouteTable", "ec2:CreateRoute", "ec2:ReplaceRoute", "ec2:DeleteRoute",
    "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable", "ec2:ReplaceRouteTableAssociation",
    "ec2:CreateVpcEndpoint", "ec2:ModifyVpcEndpoint", "ec2:DeleteVpcEndpoints",
    "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup",
    "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
    "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
    "ec2:ModifySecurityGroupRules", "ec2:CreateTags", "ec2:DeleteTags"
  ]
  network_statements = [
    {
      Effect    = "Allow", Action = [for action in local.ec2_actions : action if action != "ec2:CreateTags"],
      Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:*",
      Condition = { StringEquals = { "aws:ResourceTag/Project" = var.project } }
    },
    {
      Effect    = "Allow", Action = [for action in local.ec2_actions : action if action != "ec2:CreateTags"],
      Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:*",
      Condition = { StringEquals = { "aws:RequestTag/Project" = var.project } }
    },
    {
      Effect    = "Allow", Action = ["ec2:CreateTags"],
      Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:*",
      Condition = { StringEquals = { "aws:ResourceTag/Project" = var.project } }
    },
    {
      Effect   = "Allow", Action = ["ec2:CreateTags"],
      Resource = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:*",
      Condition = { StringEquals = {
        "aws:RequestTag/Project" = var.project,
        "ec2:CreateAction"       = ["CreateVpc", "CreateSubnet", "CreateInternetGateway", "AllocateAddress", "CreateNatGateway", "CreateRouteTable", "CreateVpcEndpoint", "CreateSecurityGroup"]
      } }
    }
  ]
  environment_apply_statements = { for env in local.environments : env => [
    {
      Effect   = "Allow", Action = ["s3:CreateBucket", "s3:PutBucketPolicy", "s3:PutBucketPublicAccessBlock", "s3:PutBucketOwnershipControls", "s3:PutBucketVersioning", "s3:PutEncryptionConfiguration", "s3:PutLifecycleConfiguration", "s3:PutBucketTagging"],
      Resource = [for kind in ["assets", "diagnostics", "recovery"] : "arn:aws:s3:::${local.prefix}-${env}-${kind}"]
    },
    {
      Effect   = "Allow", Action = ["ecs:CreateCluster", "ecs:UpdateCluster", "ecs:UpdateClusterSettings", "ecs:DeleteCluster", "ecs:CreateService", "ecs:UpdateService", "ecs:DeleteService", "ecs:TagResource", "ecs:UntagResource"],
      Resource = ["arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:cluster/${var.project}-${env}", "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:service/${var.project}-${env}/*"]
    },
    {
      Effect   = "Allow", Action = ["ecs:RegisterTaskDefinition", "ecs:DeregisterTaskDefinition", "ecs:TagResource"],
      Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/${var.project}-${env}*"
    },
    {
      Effect   = "Allow", Action = ["ecr:CreateRepository", "ecr:PutLifecyclePolicy", "ecr:PutImageScanningConfiguration", "ecr:PutImageTagMutability", "ecr:TagResource", "ecr:UntagResource"],
      Resource = "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/${var.project}-${env}"
    },
    {
      Effect   = "Allow", Action = ["logs:CreateLogGroup", "logs:PutRetentionPolicy", "logs:TagResource", "logs:UntagResource"],
      Resource = "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/${var.project}/${env}*"
    },
    {
      Effect   = "Allow", Action = ["secretsmanager:CreateSecret", "secretsmanager:TagResource", "secretsmanager:UntagResource"],
      Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:${var.project}/${env}/*"
    },
    {
      Effect = "Allow", Action = ["iam:PassRole"], Resource = [
        "arn:aws:iam::${var.aws_account_id}:role/${var.project}-${env}-execution", "arn:aws:iam::${var.aws_account_id}:role/${var.project}-${env}-task", "arn:aws:iam::${var.aws_account_id}:role/${var.project}-${env}-maintenance-task"
      ], Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
    },
    {
      Effect = "Allow", Action = ["elasticloadbalancing:CreateLoadBalancer", "elasticloadbalancing:DeleteLoadBalancer", "elasticloadbalancing:ModifyLoadBalancerAttributes", "elasticloadbalancing:SetSecurityGroups", "elasticloadbalancing:SetSubnets", "elasticloadbalancing:CreateListener", "elasticloadbalancing:DeleteListener", "elasticloadbalancing:ModifyListener", "elasticloadbalancing:CreateTargetGroup", "elasticloadbalancing:DeleteTargetGroup", "elasticloadbalancing:ModifyTargetGroup", "elasticloadbalancing:ModifyTargetGroupAttributes", "elasticloadbalancing:AddTags", "elasticloadbalancing:RemoveTags"],
      Resource = [
        "arn:aws:elasticloadbalancing:${var.aws_region}:${var.aws_account_id}:loadbalancer/app/${var.project}-${env}/*",
        "arn:aws:elasticloadbalancing:${var.aws_region}:${var.aws_account_id}:listener/app/${var.project}-${env}/*/*",
        "arn:aws:elasticloadbalancing:${var.aws_region}:${var.aws_account_id}:targetgroup/${var.project}-${env}/*"
      ]
    },
    {
      Effect    = "Allow",
      Action    = ["cloudfront:CreateDistribution", "cloudfront:CreateDistributionWithTags", "cloudfront:CreateVpcOrigin", "wafv2:CreateWebACL"],
      Resource  = "*",
      Condition = { StringEquals = { "aws:RequestTag/Project" = var.project, "aws:RequestTag/Environment" = env } }
    },
    {
      Effect    = "Allow",
      Action    = ["cloudfront:UpdateDistribution", "cloudfront:DeleteDistribution", "cloudfront:UpdateVpcOrigin", "cloudfront:DeleteVpcOrigin", "cloudfront:TagResource", "cloudfront:UntagResource", "wafv2:UpdateWebACL", "wafv2:DeleteWebACL", "wafv2:TagResource", "wafv2:UntagResource"],
      Resource  = ["arn:aws:cloudfront::${var.aws_account_id}:*", "arn:aws:wafv2:us-east-1:${var.aws_account_id}:global/webacl/${var.project}-${env}/*"],
      Condition = { StringEquals = { "aws:ResourceTag/Project" = var.project, "aws:ResourceTag/Environment" = env } }
    },
    {
      Effect    = "Allow",
      Action    = ["ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup", "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress", "ec2:ModifySecurityGroupRules", "ec2:CreateTags", "ec2:DeleteTags"],
      Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:*",
      Condition = { StringEquals = { "aws:ResourceTag/Project" = var.project, "aws:ResourceTag/Environment" = env } }
    },
    {
      Effect    = "Allow", Action = ["ec2:CreateSecurityGroup"],
      Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:*",
      Condition = { StringEquals = { "aws:RequestTag/Project" = var.project, "aws:RequestTag/Environment" = env } }
    },
    {
      Effect   = "Allow", Action = ["ec2:CreateTags"],
      Resource = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:*",
      Condition = { StringEquals = {
        "aws:RequestTag/Project" = var.project, "aws:RequestTag/Environment" = env,
        "ec2:CreateAction"       = ["CreateSecurityGroup", "AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress"]
      } }
    },
    {
      Effect    = "Allow", Action = ["ec2:CreateSecurityGroup"],
      Resource  = "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:vpc/*",
      Condition = { StringEquals = { "aws:ResourceTag/Project" = var.project } }
    }
  ] }
  release_statements = { for env in local.environments : env => [
    { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"], Resource = "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/${var.project}-${env}" },
    { Effect = "Allow", Action = ["ecs:RegisterTaskDefinition", "ecs:TagResource"], Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/${var.project}-${env}:*" },
    { Effect = "Allow", Action = ["ecs:UpdateService"], Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:service/${var.project}-${env}/${var.project}-${env}" },
    { Effect = "Allow", Action = ["iam:PassRole"], Resource = ["arn:aws:iam::${var.aws_account_id}:role/${var.project}-${env}-execution", "arn:aws:iam::${var.aws_account_id}:role/${var.project}-${env}-task"], Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } } },
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "arn:aws:s3:::${local.prefix}-${env}-recovery/migration/*" }
  ] }
  maintenance_statements = { for env in local.environments : env => [
    { Effect = "Allow", Action = ["ecs:RegisterTaskDefinition", "ecs:TagResource"], Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/${var.project}-${env}-maintenance:*" },
    { Effect = "Allow", Action = ["ecs:RunTask"], Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/${var.project}-${env}-maintenance:*", Condition = { ArnEquals = { "ecs:cluster" = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:cluster/${var.project}-${env}" } } },
    { Effect = "Allow", Action = ["ecs:StopTask"], Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task/${var.project}-${env}/*" },
    { Effect = "Allow", Action = ["ecs:UpdateService"], Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:service/${var.project}-${env}/${var.project}-${env}" },
    { Effect = "Allow", Action = ["iam:PassRole"], Resource = ["arn:aws:iam::${var.aws_account_id}:role/${var.project}-${env}-execution", "arn:aws:iam::${var.aws_account_id}:role/${var.project}-${env}-maintenance-task"], Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } } },
    { Effect = "Allow", Action = ["logs:GetLogEvents", "logs:FilterLogEvents"], Resource = "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/${var.project}/${env}:*" },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = "arn:aws:s3:::${local.prefix}-${env}-recovery/migration/*" }
  ] }
  policy_statements = { for key, cfg in local.roles : key => concat(
    [local.read_statement, { Effect = "Allow", Action = local.bucket_read_actions, Resource = [local.state_arn, local.ops_arn, "arn:aws:s3:::${local.prefix}-${cfg.scope}-*"] }],
    local.state_statements[key],
    [{ Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${local.state_arn}/${var.project}/${cfg.scope}.tfstate.tflock" }],
    [for statement in local.ops_statements : statement if cfg.kind != "plan"],
    [for statement in local.state_write_statements[key] : statement if cfg.kind == "apply"],
    [for statement in local.network_statements : statement if cfg.kind == "apply" && cfg.scope == "shared"],
    [for statement in try(local.environment_apply_statements[cfg.scope], []) : statement if cfg.kind == "apply" && cfg.scope != "shared"],
    [for statement in try(local.release_statements[cfg.scope], []) : statement if cfg.kind == "release"],
    [for statement in try(local.maintenance_statements[cfg.scope], []) : statement if cfg.kind == "maintenance"]
    )
  }
  # Managed policies have a 6,144-character limit. Four statements per policy
  # keep the policies below that limit and below ten attachments per role.
  policy_chunks = merge([for role, statements in local.policy_statements : {
    for index, chunk in chunklist([for statement in statements : jsonencode(statement)], 4) :
    "${role}-${index}" => { role = role, policy = "{\"Version\":\"2012-10-17\",\"Statement\":[${join(",", chunk)}]}" }
  }]...)
}
resource "aws_iam_policy" "boundary" {
  for_each = local.roles
  name     = "${var.project}-${each.key}-boundary"
  policy = jsonencode({
    Version   = "2012-10-17",
    Statement = concat([{ Effect = "Allow", Action = "*", Resource = "*" }], local.safeguards)
  })
}
resource "aws_iam_policy" "permissions" {
  for_each = local.policy_chunks
  name     = "${var.project}-${each.key}"
  policy   = each.value.policy
  lifecycle {
    precondition {
      condition     = length(each.value.policy) <= 6144
      error_message = "Split this IAM policy before it exceeds the managed policy size limit."
    }
  }
}
resource "aws_iam_role" "github" {
  for_each             = local.roles
  name                 = "${var.project}-${each.key}"
  max_session_duration = 7200
  permissions_boundary = aws_iam_policy.boundary[each.key].arn
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect    = "Allow", Action = "sts:AssumeRoleWithWebIdentity",
      Principal = { Federated = local.oidc_arn },
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com",
        # GitHub expands the special context claim to environment:<name>.
        # It does not insert a literal context: segment.
        "token.actions.githubusercontent.com:sub" = [for workflow in local.workflow_files[each.value.kind] :
          "repository_id:${var.repository_id}:repository_owner_id:${var.repository_owner_id}:ref:refs/heads/${each.value.branch}:environment:${each.value.environment}:job_workflow_ref:${var.repository}/.github/workflows/${workflow}@refs/heads/${each.value.branch}"
        ]
      } }
    }]
  })
}
resource "aws_iam_role_policy_attachment" "github" {
  for_each   = local.policy_chunks
  role       = aws_iam_role.github[each.value.role].name
  policy_arn = aws_iam_policy.permissions[each.key].arn
}


