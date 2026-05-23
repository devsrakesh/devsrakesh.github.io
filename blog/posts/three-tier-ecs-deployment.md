---
title: "A 3-Tier ECS Deployment: Production Architecture with Fargate, ALB, and RDS"
date: 2026-05-23
excerpt: "Real production ECS Fargate architecture — VPC, ALB, ECR, RDS Postgres, GitHub Actions deploys. The 3-tier pattern I run for accounting SaaS platforms in NestJS + Next.js."
tags: [ecs, fargate, aws, terraform, alb, rds, 3-tier, architecture, ci-cd]
---

The 3-tier ECS Fargate setup is my default for serverless-container workloads — NestJS APIs, Next.js apps, anything that doesn't need raw EC2. It's how I shipped MyBankSlip, Tally Cash Pro, and Monday Report. Cheaper than EKS to run, easier than EKS to operate, and just as production-credible.

This post is the architecture and the Terraform that builds it.

## The architecture

<div class="diagram">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 580" role="img" aria-label="ECS Fargate 3-tier architecture diagram">
  <style>
    .box { fill: #ffffff; stroke: #222222; stroke-width: 1; }
    .vpc { fill: #f8f8f8; stroke: #222222; stroke-width: 1; stroke-dasharray: 4 3; }
    .subnet-pub { fill: #ffffff; stroke: #c4c4c4; stroke-width: 1; stroke-dasharray: 2 2; }
    .subnet-priv { fill: #fafafa; stroke: #c4c4c4; stroke-width: 1; stroke-dasharray: 2 2; }
    .task-fe { fill: #e8f0ff; stroke: #4a7dd3; stroke-width: 1; }
    .task-be { fill: #fff1e8; stroke: #c97a30; stroke-width: 1; }
    .data { fill: #ebf6ec; stroke: #4a8a52; stroke-width: 1; }
    .external { fill: #222222; stroke: #222222; }
    .label { font-family: 'Inter', sans-serif; font-size: 12px; fill: #222222; }
    .label-small { font-family: 'JetBrains Mono', monospace; font-size: 10px; fill: #7B7B7B; letter-spacing: 0.05em; }
    .label-white { font-family: 'Inter', sans-serif; font-size: 12px; fill: #ffffff; }
    .label-title { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; fill: #222222; }
    .arrow { stroke: #222222; stroke-width: 1.2; fill: none; }
  </style>
  <defs>
    <marker id="arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#222222"/>
    </marker>
  </defs>

  <!-- Internet -->
  <rect class="external" x="280" y="14" width="160" height="32" rx="4"/>
  <text class="label-white" x="360" y="35" text-anchor="middle">Internet</text>

  <!-- Route 53 -->
  <rect class="box" x="280" y="64" width="160" height="32" rx="4"/>
  <text class="label-title" x="360" y="77" text-anchor="middle">Route 53</text>
  <text class="label-small" x="360" y="90" text-anchor="middle">app + api domains</text>

  <!-- VPC -->
  <rect class="vpc" x="40" y="110" width="640" height="424" rx="8"/>
  <text class="label-small" x="56" y="128">VPC  10.0.0.0/16</text>

  <!-- Public subnet (ALB) -->
  <rect class="subnet-pub" x="60" y="142" width="600" height="60" rx="6"/>
  <text class="label-small" x="74" y="158">Public subnets (2 AZs)</text>
  <rect class="box" x="200" y="168" width="320" height="28" rx="4"/>
  <text class="label-title" x="360" y="186" text-anchor="middle">Application Load Balancer (HTTPS:443)</text>

  <!-- Private subnet — frontend tasks -->
  <rect class="subnet-priv" x="60" y="216" width="600" height="76" rx="6"/>
  <text class="label-small" x="74" y="232">Private subnets · Tier 1 — Frontend (Next.js)</text>
  <rect class="task-fe" x="78" y="244" width="140" height="40" rx="4"/>
  <text class="label-title" x="148" y="258" text-anchor="middle">Fargate Task</text>
  <text class="label-small" x="148" y="272" text-anchor="middle">web · AZ-a</text>
  <rect class="task-fe" x="228" y="244" width="140" height="40" rx="4"/>
  <text class="label-title" x="298" y="258" text-anchor="middle">Fargate Task</text>
  <text class="label-small" x="298" y="272" text-anchor="middle">web · AZ-b</text>
  <rect class="task-fe" x="500" y="244" width="142" height="40" rx="4"/>
  <text class="label-title" x="571" y="258" text-anchor="middle">ECS Service · web</text>
  <text class="label-small" x="571" y="272" text-anchor="middle">desired=2 · autoscaled</text>

  <!-- Private subnet — backend tasks -->
  <rect class="subnet-priv" x="60" y="306" width="600" height="76" rx="6"/>
  <text class="label-small" x="74" y="322">Private subnets · Tier 2 — Backend (NestJS API)</text>
  <rect class="task-be" x="78" y="334" width="140" height="40" rx="4"/>
  <text class="label-title" x="148" y="348" text-anchor="middle">Fargate Task</text>
  <text class="label-small" x="148" y="362" text-anchor="middle">api · AZ-a</text>
  <rect class="task-be" x="228" y="334" width="140" height="40" rx="4"/>
  <text class="label-title" x="298" y="348" text-anchor="middle">Fargate Task</text>
  <text class="label-small" x="298" y="362" text-anchor="middle">api · AZ-b</text>
  <rect class="task-be" x="500" y="334" width="142" height="40" rx="4"/>
  <text class="label-title" x="571" y="348" text-anchor="middle">ECS Service · api</text>
  <text class="label-small" x="571" y="362" text-anchor="middle">desired=2 · autoscaled</text>

  <!-- Private subnet — data tier -->
  <rect class="subnet-priv" x="60" y="396" width="600" height="76" rx="6"/>
  <text class="label-small" x="74" y="412">Isolated subnets · Tier 3 — Data</text>
  <rect class="data" x="78" y="424" width="280" height="40" rx="4"/>
  <text class="label-title" x="218" y="438" text-anchor="middle">RDS PostgreSQL (Multi-AZ)</text>
  <text class="label-small" x="218" y="452" text-anchor="middle">gp3 storage · automated backups</text>
  <rect class="data" x="370" y="424" width="272" height="40" rx="4"/>
  <text class="label-title" x="506" y="438" text-anchor="middle">ElastiCache Redis</text>
  <text class="label-small" x="506" y="452" text-anchor="middle">session + rate-limit store</text>

  <!-- Shared services strip -->
  <rect class="box" x="60" y="488" width="600" height="34" rx="4"/>
  <text class="label-small" x="68" y="510">ECR · Secrets Manager · CloudWatch Logs · CloudWatch Alarms · S3 (assets) · NAT GW per AZ · GitHub Actions OIDC</text>

  <!-- Arrows -->
  <path class="arrow" d="M 360 46 V 64" marker-end="url(#arrow2)"/>
  <path class="arrow" d="M 360 96 V 168" marker-end="url(#arrow2)"/>
  <path class="arrow" d="M 360 196 V 244" marker-end="url(#arrow2)"/>
  <path class="arrow" d="M 360 196 V 334" marker-end="url(#arrow2)"/>
  <path class="arrow" d="M 148 374 V 424" marker-end="url(#arrow2)"/>
  <path class="arrow" d="M 298 374 V 424" marker-end="url(#arrow2)"/>
</svg>
</div>

The shape:

- **ALB in public subnets** — the only thing the internet touches. HTTPS termination at the ALB via ACM.
- **Tasks in private subnets** — frontend (Next.js) and backend (NestJS) both run as Fargate tasks. No public IPs.
- **Data tier in isolated subnets** — RDS Postgres + ElastiCache. No internet access at all, not even outbound.
- **One ALB, two services** — host-based routing splits `app.example.com` → frontend and `api.example.com` → backend.
- **Across two AZs** for resilience — RDS Multi-AZ, Redis with replication, ECS service spread.

## Why Fargate over EC2 launch type

For services running 2-10 tasks at a time, Fargate beats EC2 every time:

- **No node management.** No capacity provider mess, no Cluster Autoscaler, no EC2 patching.
- **Pay for what you use** at the second. EC2 charges for the instance whether it has tasks or not.
- **Faster cold starts** on scale-out — tasks start in ~30s vs. 2+ minutes including node provisioning.
- **Per-task IAM roles** via Task Role — no `kube2iam` equivalent needed.

EC2 launch type wins at sustained high throughput (>15-20 tasks running 24/7) where the per-task overhead of Fargate's pricing becomes meaningful. For everything else, Fargate.

## The Terraform

I'll show the core. Full module is ~500 lines; the abridged shape is below.

### VPC

Same `terraform-aws-modules/vpc/aws` module as my EKS post. The difference:

```hcl
private_subnet_tags  = { Tier = "private" }
public_subnet_tags   = { Tier = "public" }
database_subnet_tags = { Tier = "data" }

database_subnets = ["10.0.21.0/24", "10.0.22.0/24"]    # extra isolated subnets for RDS
create_database_subnet_group = true
```

ECS doesn't need the `kubernetes.io/role/elb` tags — those are EKS-specific.

### Cluster + capacity provider

```hcl
resource "aws_ecs_cluster" "main" {
  name = "mybankslip-prod"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 2
    weight            = 100
    capacity_provider = "FARGATE"
  }
}
```

Container Insights gives you per-task CPU/memory/network metrics in CloudWatch automatically. Worth the small cost.

Optional: add a FARGATE_SPOT strategy for cost savings on non-critical environments. Up to 70% off for tasks that can tolerate interruption.

### Task definition (backend API)

```hcl
resource "aws_ecs_task_definition" "api" {
  family                   = "api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512                # 0.5 vCPU
  memory                   = 1024               # 1 GB
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"

      essential = true

      portMappings = [
        { containerPort = 3000, protocol = "tcp" }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT",     value = "3000" },
        { name = "DB_HOST",  value = aws_db_instance.main.address },
      ]

      secrets = [
        { name = "DB_PASSWORD", valueFrom = aws_secretsmanager_secret.db.arn },
        { name = "JWT_SECRET",  valueFrom = aws_secretsmanager_secret.jwt.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "api"
        }
      }

      healthCheck = {
        command  = ["CMD-SHELL", "wget -q --spider http://localhost:3000/health || exit 1"]
        interval = 30
        timeout  = 5
        retries  = 3
        startPeriod = 30
      }

      readonlyRootFilesystem = true
      user = "1000:1000"
    }
  ])
}
```

The non-obvious wins:

- **Execution role vs. Task role.** Execution role lets ECS pull from ECR + write logs (the platform's permissions). Task role is what your application code's AWS SDK calls use (your app's permissions). Don't conflate them.
- **`secrets` field reads from Secrets Manager** — values land as env vars at task start. Never put secrets in `environment`.
- **`startPeriod` on healthcheck** — gives the app 30 seconds to boot before health checks count against it. Without it, slow boots trigger restart loops.
- **`readonlyRootFilesystem: true`** + `user: "1000:1000"` — security hardening on by default. If your app writes to `/tmp`, mount a writable volume for that path explicitly.

### Service

```hcl
resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.api_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200       # allow new tasks during deploy
  deployment_minimum_healthy_percent = 100       # never go below current capacity

  health_check_grace_period_seconds = 60

  lifecycle {
    ignore_changes = [task_definition, desired_count]   # CI/CD manages these
  }
}
```

The `deployment_circuit_breaker` is gold. If the new task definition fails health checks, ECS automatically rolls back to the previous one without you doing anything. Always enable it.

`ignore_changes = [task_definition, desired_count]` is the magic that lets Terraform define the service while GitHub Actions deploys new task definitions and autoscaling adjusts replicas. Without it, every `terraform apply` would revert your deploys.

### Autoscaling

```hcl
resource "aws_appautoscaling_target" "api" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "api-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300       # wait 5 min before scaling in
    scale_out_cooldown = 60        # scale out aggressively
  }
}
```

CPU at 70% target — scale out when average CPU exceeds, scale in when it stays well below. For request-rate-based scaling, use `ALBRequestCountPerTarget`.

### ALB

```hcl
resource "aws_lb" "main" {
  name               = "mybankslip-alb"
  internal           = false
  load_balancer_type = "application"
  subnets            = module.vpc.public_subnets
  security_groups    = [aws_security_group.alb.id]

  drop_invalid_header_fields = true   # security: reject malformed headers
  enable_deletion_protection = true
}

resource "aws_lb_target_group" "api" {
  name        = "api"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"                  # for Fargate awsvpc network mode

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30           # drain connections gracefully
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header { values = ["api.example.com"] }
  }
}
```

Same pattern for `web` → frontend service, on `app.example.com`.

`deregistration_delay = 30` — when a task is being replaced, the ALB stops sending new traffic and waits 30 seconds for in-flight requests to complete. Without this, deploys cause 5xx errors.

`target_type = "ip"` is **required** for Fargate `awsvpc` networking. Without it, the ALB can't reach the task.

### RDS

```hcl
resource "aws_db_subnet_group" "main" {
  name       = "mybankslip-db-subnets"
  subnet_ids = module.vpc.database_subnets
}

resource "aws_db_instance" "main" {
  identifier = "mybankslip-db"
  engine     = "postgres"
  engine_version = "16.4"

  instance_class    = "db.t4g.small"
  allocated_storage = 50
  storage_type      = "gp3"
  storage_encrypted = true

  username = "appdb"
  password = random_password.db.result   # store in Secrets Manager

  db_name                 = "mybankslip"
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.db.id]

  multi_az                = true
  backup_retention_period = 14
  backup_window           = "01:00-02:00"
  maintenance_window      = "Mon:02:30-Mon:03:30"

  performance_insights_enabled = true
  deletion_protection          = true
  skip_final_snapshot          = false

  apply_immediately = false
}
```

Multi-AZ on production. Backups for 14 days. Deletion protection on so you can't `terraform destroy` your way to a P0. Performance Insights for "why is this query slow?" debugging.

## The GitHub Actions deploy

```yaml
# .github/workflows/deploy-api.yml
name: deploy-api
on:
  push:
    branches: [main]
    paths: ["apps/api/**"]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy
          aws-region: ap-south-1

      - uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        env:
          ECR_REGISTRY: 123456789012.dkr.ecr.ap-south-1.amazonaws.com
        run: |
          IMAGE=$ECR_REGISTRY/mybankslip-api:${{ github.sha }}
          docker build -t $IMAGE apps/api
          docker push $IMAGE
          echo "IMAGE=$IMAGE" >> $GITHUB_ENV

      - name: Render new task definition
        id: taskdef
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: infra/api-task-def.json
          container-name: api
          image: ${{ env.IMAGE }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.taskdef.outputs.task-definition }}
          service: api
          cluster: mybankslip-prod
          wait-for-service-stability: true
          wait-for-minutes: 10
```

The whole thing:

1. OIDC into AWS, no static keys
2. Build the image, tag with the commit SHA
3. Push to ECR
4. Render a new task definition with the new image
5. Update the ECS service to use it
6. Wait for the rollout to be healthy (with circuit breaker rollback if not)

End-to-end deploy time on a tuned setup: ~4 minutes.

## What ECS won't give you (vs. EKS)

Things I miss when on ECS vs. EKS:

- **Service mesh.** No Istio/Linkerd equivalent — App Mesh is being deprecated.
- **NetworkPolicies.** Security groups are coarser.
- **Sidecars are clunky** — easy to add but no native init-container model.
- **CRDs and Operators.** ECS has no extension mechanism beyond what AWS ships.

Things ECS gives you that EKS doesn't:

- **No control plane to manage.** EKS control plane is $73/month before any node.
- **No version upgrades to plan.** ECS just works; EKS makes you upgrade.
- **No add-on graveyard** — every EKS cluster I touch has 10+ Helm releases for things EKS should have built in.
- **AWS-native everything** — IAM, Secrets Manager, CloudWatch are first-class, not bolted-on via plugins.

For a team of 1-5 engineers shipping NestJS/Next.js services, ECS Fargate is usually the right answer. Move to EKS when you've got the engineering bandwidth to own a Kubernetes platform.

## What's not in the diagram

A complete production ECS account also has, in some combination:

- **CloudFront** in front of the frontend service for global edge caching
- **WAF** attached to the ALB for OWASP Top 10 + bot protection
- **CloudTrail** + **GuardDuty** for audit and threat detection
- **AWS Backup** for cross-account snapshot backups
- **Cost Explorer** with tag-based allocation per service

Add them when the project earns them — not on day one for an MVP.

---

That's a production 3-tier ECS Fargate setup, end to end. Repeatable, recoverable, debuggable — and a tenth of the operational surface area of doing the same on EKS.

*Need this architecture set up for your product? I've shipped this exact pattern across multiple SaaS platforms — [start a project](/#contact).*
