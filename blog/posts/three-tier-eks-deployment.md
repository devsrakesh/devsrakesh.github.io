---
title: "A 3-Tier EKS Deployment: How I Built EzChatting on AWS Kubernetes"
date: 2026-05-16
excerpt: "End-to-end walkthrough of a production EKS 3-tier deployment — VPC, EKS, ALB Ingress, ExternalDNS, ECR, MongoDB on EBS, secrets via ESO. Provisioned with Terraform and eksctl from scratch."
tags: [eks, kubernetes, aws, terraform, eksctl, ingress, 3-tier, architecture]
---

EzChatting was a realtime chat platform for a Dubai-based client. I designed and provisioned its AWS EKS architecture from scratch — every line of Terraform, every eksctl config, every Kubernetes manifest. This post is the architecture and the implementation, end-to-end.

The shape is the classic 3-tier — **frontend** (Next.js) → **backend** (NestJS API + WebSocket gateway) → **data** (MongoDB on EBS, Redis on ElastiCache). What makes it interesting is everything in between: how requests get from `api.ezchat.example.com` to a specific Pod, how secrets stop being a checked-in YAML problem, how nodes scale to match demand, how the cluster doesn't die when one AZ does.

## The architecture

<div class="diagram">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="EKS 3-tier architecture diagram">
  <style>
    .box { fill: #ffffff; stroke: #222222; stroke-width: 1; }
    .vpc { fill: #f8f8f8; stroke: #222222; stroke-width: 1; stroke-dasharray: 4 3; }
    .az { fill: #ffffff; stroke: #c4c4c4; stroke-width: 1; stroke-dasharray: 2 2; }
    .pod-fe { fill: #e8f0ff; stroke: #4a7dd3; stroke-width: 1; }
    .pod-be { fill: #fff1e8; stroke: #c97a30; stroke-width: 1; }
    .pod-db { fill: #ebf6ec; stroke: #4a8a52; stroke-width: 1; }
    .external { fill: #222222; stroke: #222222; }
    .label { font-family: 'Inter', sans-serif; font-size: 12px; fill: #222222; }
    .label-small { font-family: 'JetBrains Mono', monospace; font-size: 10px; fill: #7B7B7B; letter-spacing: 0.05em; }
    .label-white { font-family: 'Inter', sans-serif; font-size: 12px; fill: #ffffff; }
    .label-title { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; fill: #222222; }
    .arrow { stroke: #222222; stroke-width: 1.2; fill: none; }
  </style>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#222222"/>
    </marker>
  </defs>

  <!-- Internet -->
  <rect class="external" x="280" y="14" width="160" height="36" rx="4"/>
  <text class="label-white" x="360" y="37" text-anchor="middle">Internet</text>

  <!-- Route 53 -->
  <rect class="box" x="280" y="68" width="160" height="32" rx="4"/>
  <text class="label-title" x="360" y="80" text-anchor="middle">Route 53</text>
  <text class="label-small" x="360" y="93" text-anchor="middle">api.ezchat.example.com</text>

  <!-- ALB -->
  <rect class="box" x="260" y="116" width="200" height="34" rx="4"/>
  <text class="label-title" x="360" y="129" text-anchor="middle">Application Load Balancer</text>
  <text class="label-small" x="360" y="142" text-anchor="middle">ACM cert · target-type=ip</text>

  <!-- VPC -->
  <rect class="vpc" x="40" y="174" width="640" height="338" rx="8"/>
  <text class="label-small" x="56" y="192">VPC  10.0.0.0/16</text>

  <!-- AZ A -->
  <rect class="az" x="60" y="206" width="290" height="220" rx="6"/>
  <text class="label-small" x="74" y="222">AZ  ap-south-1a</text>

  <!-- AZ B -->
  <rect class="az" x="370" y="206" width="290" height="220" rx="6"/>
  <text class="label-small" x="384" y="222">AZ  ap-south-1b</text>

  <!-- Tier 1 — Frontend pods -->
  <rect class="pod-fe" x="78" y="240" width="120" height="44" rx="4"/>
  <text class="label-title" x="138" y="255" text-anchor="middle">Frontend Pod</text>
  <text class="label-small" x="138" y="270" text-anchor="middle">Next.js · standalone</text>

  <rect class="pod-fe" x="212" y="240" width="120" height="44" rx="4"/>
  <text class="label-title" x="272" y="255" text-anchor="middle">Frontend Pod</text>
  <text class="label-small" x="272" y="270" text-anchor="middle">Next.js · standalone</text>

  <rect class="pod-fe" x="388" y="240" width="120" height="44" rx="4"/>
  <text class="label-title" x="448" y="255" text-anchor="middle">Frontend Pod</text>
  <text class="label-small" x="448" y="270" text-anchor="middle">Next.js · standalone</text>

  <rect class="pod-fe" x="522" y="240" width="120" height="44" rx="4"/>
  <text class="label-title" x="582" y="255" text-anchor="middle">Frontend Pod</text>
  <text class="label-small" x="582" y="270" text-anchor="middle">Next.js · standalone</text>

  <!-- Tier 2 — Backend pods -->
  <rect class="pod-be" x="78" y="302" width="120" height="44" rx="4"/>
  <text class="label-title" x="138" y="317" text-anchor="middle">Backend Pod</text>
  <text class="label-small" x="138" y="332" text-anchor="middle">NestJS · API + WS</text>

  <rect class="pod-be" x="212" y="302" width="120" height="44" rx="4"/>
  <text class="label-title" x="272" y="317" text-anchor="middle">Backend Pod</text>
  <text class="label-small" x="272" y="332" text-anchor="middle">NestJS · API + WS</text>

  <rect class="pod-be" x="388" y="302" width="120" height="44" rx="4"/>
  <text class="label-title" x="448" y="317" text-anchor="middle">Backend Pod</text>
  <text class="label-small" x="448" y="332" text-anchor="middle">NestJS · API + WS</text>

  <rect class="pod-be" x="522" y="302" width="120" height="44" rx="4"/>
  <text class="label-title" x="582" y="317" text-anchor="middle">Backend Pod</text>
  <text class="label-small" x="582" y="332" text-anchor="middle">NestJS · API + WS</text>

  <!-- Tier 3 — Data -->
  <rect class="pod-db" x="78" y="364" width="254" height="44" rx="4"/>
  <text class="label-title" x="205" y="379" text-anchor="middle">MongoDB Pod (StatefulSet)</text>
  <text class="label-small" x="205" y="394" text-anchor="middle">EBS gp3 · 100GB · primary</text>

  <rect class="pod-db" x="388" y="364" width="254" height="44" rx="4"/>
  <text class="label-title" x="515" y="379" text-anchor="middle">MongoDB Pod (StatefulSet)</text>
  <text class="label-small" x="515" y="394" text-anchor="middle">EBS gp3 · 100GB · secondary</text>

  <!-- ElastiCache (outside VPC visualisation simplified) -->
  <rect class="box" x="240" y="438" width="240" height="32" rx="4"/>
  <text class="label-title" x="360" y="451" text-anchor="middle">ElastiCache Redis (cluster mode)</text>
  <text class="label-small" x="360" y="464" text-anchor="middle">pub/sub + session store</text>

  <!-- Add-ons strip -->
  <rect class="box" x="60" y="490" width="600" height="34" rx="4"/>
  <text class="label-small" x="68" y="510">ECR · External DNS · External Secrets Operator · ALB Controller · Karpenter · Prometheus · Grafana · CloudWatch</text>

  <!-- Arrows -->
  <path class="arrow" d="M 360 50 V 68" marker-end="url(#arrow)"/>
  <path class="arrow" d="M 360 100 V 116" marker-end="url(#arrow)"/>
  <path class="arrow" d="M 360 150 V 174" marker-end="url(#arrow)"/>
</svg>
</div>

A few non-obvious things in this diagram:

- **Target-type IP on the ALB.** Pods are addressed directly, not via NodePort. Lower latency, simpler routing, no surprise from `kube-proxy`.
- **MongoDB on a StatefulSet with EBS** — not RDS, because the client wanted Mongo and AWS DocumentDB has too many quirks. Each replica has its own EBS volume.
- **ElastiCache Redis cluster** for pub/sub between API replicas — required for Socket.IO sticky sessions to work across pods.
- **No NAT gateway in this diagram for clarity** — there's one per AZ in reality, for pods to reach the internet (ECR, secrets manager, etc).

## The VPC (Terraform)

I provision the VPC with the official AWS VPC module — battle-tested, fewer foot-guns:

```hcl
# terraform/vpc.tf
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "ezchat-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false       # one per AZ — production grade
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Tags required by AWS Load Balancer Controller for subnet discovery
  public_subnet_tags = {
    "kubernetes.io/role/elb"           = "1"
    "kubernetes.io/cluster/ezchat-eks" = "shared"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"  = "1"
    "kubernetes.io/cluster/ezchat-eks" = "shared"
  }
}
```

Three AZs, three private subnets (for nodes + pods), three public subnets (for the ALB and NAT). The subnet tags matter — without them the AWS Load Balancer Controller can't discover where to put load balancers.

For staging environments, `single_nat_gateway = true` cuts the NAT cost by 66%. For production, keep one per AZ — a NAT outage in one AZ shouldn't take down pods in the other two.

## The cluster (eksctl)

I use **eksctl** for the cluster itself (faster iteration, decent defaults) and Terraform for everything around it (VPC, IAM, ECR, RDS).

```yaml
# eksctl/cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: ezchat-eks
  region: ap-south-1
  version: "1.30"

vpc:
  id: vpc-XXX                     # from Terraform output
  subnets:
    private:
      ap-south-1a: { id: subnet-aaa }
      ap-south-1b: { id: subnet-bbb }
      ap-south-1c: { id: subnet-ccc }
    public:
      ap-south-1a: { id: subnet-ddd }
      ap-south-1b: { id: subnet-eee }
      ap-south-1c: { id: subnet-fff }

iam:
  withOIDC: true                   # required for IRSA (IAM roles for service accounts)

managedNodeGroups:
  - name: workers-2a
    instanceType: t3.large
    minSize: 1
    maxSize: 4
    desiredCapacity: 2
    privateNetworking: true
    availabilityZones: ["ap-south-1a"]
    labels: { role: worker }
    iam:
      withAddonPolicies:
        cloudWatch: true
        ebs: true
        autoScaler: true

  - name: workers-2b
    instanceType: t3.large
    minSize: 1
    maxSize: 4
    desiredCapacity: 2
    privateNetworking: true
    availabilityZones: ["ap-south-1b"]
    labels: { role: worker }
    iam:
      withAddonPolicies:
        cloudWatch: true
        ebs: true
        autoScaler: true

addons:
  - name: vpc-cni
  - name: coredns
  - name: kube-proxy
  - name: aws-ebs-csi-driver

cloudWatch:
  clusterLogging:
    enableTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"]
```

```bash
eksctl create cluster -f eksctl/cluster.yaml
```

15 minutes later you have a working EKS cluster across three AZs with logging, EBS support, and the right IAM scaffolding.

The split node groups (one per AZ) is deliberate. Karpenter or Cluster Autoscaler can later scale these independently. If `ap-south-1a` has a regional issue, the `workers-2b` and `workers-2c` groups keep running.

## The add-ons (Helm)

After the cluster exists, install the in-cluster tooling:

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns
helm repo add external-secrets https://charts.external-secrets.io
helm repo add karpenter oci://public.ecr.aws/karpenter
helm repo update

# AWS Load Balancer Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=ezchat-eks \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller

# External DNS
helm install external-dns external-dns/external-dns \
  -n kube-system \
  --set provider=aws \
  --set txtOwnerId=ezchat-eks \
  --set domainFilters[0]=ezchat.example.com

# External Secrets Operator
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace

# Karpenter (or Cluster Autoscaler)
helm install karpenter oci://public.ecr.aws/karpenter/karpenter \
  -n karpenter --create-namespace \
  --set settings.clusterName=ezchat-eks
```

Each needs an IAM role via IRSA — I'm skipping the IAM YAML for brevity but it's standard policy attachment for ALB Controller, route53 record write for ExternalDNS, secretsmanager:GetSecretValue for ESO, etc.

## The application namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: chat
  labels:
    app.kubernetes.io/name: ezchat
```

Everything app-related goes in `chat`. Add-ons stay in `kube-system` / `external-secrets` / `karpenter`. Don't mix.

## Tier 1 — Frontend (Next.js)

```yaml
# k8s/frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: frontend, namespace: chat }
spec:
  replicas: 2
  strategy: { type: RollingUpdate, rollingUpdate: { maxSurge: 1, maxUnavailable: 0 } }
  selector: { matchLabels: { app: frontend } }
  template:
    metadata: { labels: { app: frontend } }
    spec:
      serviceAccountName: frontend
      containers:
        - name: web
          image: 123.dkr.ecr.ap-south-1.amazonaws.com/ezchat-web:v1.42.0
          ports: [{ containerPort: 3000, name: http }]
          env:
            - { name: NEXT_PUBLIC_API_URL, value: https://api.ezchat.example.com }
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits:   { cpu: 500m, memory: 512Mi }
          readinessProbe: { httpGet: { path: /api/health, port: http }, periodSeconds: 5 }
          livenessProbe:  { httpGet: { path: /api/health, port: http }, periodSeconds: 30 }
---
apiVersion: v1
kind: Service
metadata: { name: frontend, namespace: chat }
spec:
  selector: { app: frontend }
  ports: [{ port: 80, targetPort: http }]
```

## Tier 2 — Backend (NestJS + WebSocket)

The backend is two endpoints baked into one image — REST API and Socket.IO gateway. Same Deployment, same Service:

```yaml
# k8s/backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: chat }
spec:
  replicas: 3
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      serviceAccountName: api
      containers:
        - name: api
          image: 123.dkr.ecr.ap-south-1.amazonaws.com/ezchat-api:v1.42.0
          ports: [{ containerPort: 3000, name: http }]
          env:
            - { name: NODE_ENV, value: production }
            - { name: MONGO_URI,  value: "mongodb://mongo-0.mongo.chat.svc.cluster.local:27017,mongo-1.mongo.chat.svc.cluster.local:27017/chat?replicaSet=rs0" }
            - { name: REDIS_HOST, value: "ezchat-redis.xxxx.cache.amazonaws.com" }
          envFrom:
            - { secretRef: { name: api-secrets } }
          resources:
            requests: { cpu: 200m, memory: 512Mi }
            limits:   { cpu: 1000m, memory: 1Gi }
          readinessProbe: { httpGet: { path: /health/ready, port: http } }
          livenessProbe:  { httpGet: { path: /health/live,  port: http } }
```

NestJS's WebSocket gateway (using Socket.IO Redis adapter) shares Pub/Sub state across Pods via ElastiCache — that's how a message from a user on Pod A reaches a user on Pod B.

## Tier 3 — MongoDB (StatefulSet)

```yaml
# k8s/data/mongo.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: mongo, namespace: chat }
spec:
  serviceName: mongo
  replicas: 3
  selector: { matchLabels: { app: mongo } }
  template:
    metadata: { labels: { app: mongo } }
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: mongo
          image: mongo:7
          command:
            - mongod
            - --replSet=rs0
            - --bind_ip_all
          ports: [{ containerPort: 27017 }]
          volumeMounts: [{ name: data, mountPath: /data/db }]
          resources:
            requests: { cpu: 500m, memory: 2Gi }
            limits:   { cpu: 2,    memory: 4Gi }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: ebs-gp3
        resources: { requests: { storage: 100Gi } }
---
apiVersion: v1
kind: Service
metadata: { name: mongo, namespace: chat }
spec:
  clusterIP: None                  # headless service — required for StatefulSet
  selector: { app: mongo }
  ports: [{ port: 27017 }]
```

Each Pod gets a stable DNS name (`mongo-0.mongo.chat.svc.cluster.local`) and its own 100 GB EBS volume. Replica set initialization is a one-time job:

```bash
kubectl exec -n chat mongo-0 -- mongosh --eval '
  rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongo-0.mongo.chat.svc.cluster.local:27017" },
      { _id: 1, host: "mongo-1.mongo.chat.svc.cluster.local:27017" },
      { _id: 2, host: "mongo-2.mongo.chat.svc.cluster.local:27017" }
    ]
  })'
```

For production, I now lean toward **DocumentDB** if Mongo-on-StatefulSet starts being operational overhead the team can't carry. Pick your tradeoffs.

## The Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ezchat
  namespace: chat
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/ssl-redirect: '443'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-1:123:certificate/xxx
    alb.ingress.kubernetes.io/healthcheck-path: /api/health
    external-dns.alpha.kubernetes.io/hostname: api.ezchat.example.com,app.ezchat.example.com
spec:
  rules:
    - host: api.ezchat.example.com
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: api, port: { number: 80 } } } }
    - host: app.ezchat.example.com
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: frontend, port: { number: 80 } } } }
```

One ALB, two hostnames, two services. ExternalDNS sees the `external-dns.alpha.kubernetes.io/hostname` annotation and creates the Route 53 records automatically.

## What I'd do differently next time

Honest list:

- **Use Karpenter from day one**, not Cluster Autoscaler. Karpenter is dramatically faster at provisioning capacity for spiky workloads.
- **Use ArgoCD for app deployment**. We deployed via `kubectl apply -k` from CI. Works, but ArgoCD gives you free drift detection and a sane rollback UX.
- **Skip MongoDB on StatefulSet** unless the client requires it. The operational overhead of running a stateful database in Kubernetes — backup, restore, replica set surgery — is more than most teams can absorb. DocumentDB or Atlas externalises that.
- **Put cert-manager in even if you have ACM.** ACM only works for ALBs and CloudFront. cert-manager covers internal services, dev environments, anywhere you want auto-renewing certificates without touching ACM.

That's the system. ~30 YAML files, ~600 lines of Terraform, ~150 lines of eksctl config. Repeatable, recoverable, debuggable.

*Designing a Kubernetes platform for your team? This is exactly the kind of work I do — [start a project](/#contact).*
