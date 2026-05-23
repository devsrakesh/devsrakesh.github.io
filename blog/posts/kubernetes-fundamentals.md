---
title: "Kubernetes for Working Engineers: The Manifests I Actually Ship"
date: 2026-05-02
excerpt: "Real production Kubernetes — Deployments, Services, Ingress, HPA, ConfigMaps, Secrets, probes, resource limits — explained through the manifests I run on EKS for a Dubai-based realtime chat platform."
tags: [kubernetes, k8s, eks, devops, helm, production]
---

I provisioned the AWS EKS cluster behind a realtime chat platform (EzChatting) from scratch — Terraform for the VPC and cluster, eksctl for node groups, ALB Controller for ingress, ECR for images, manifests checked into the same repo as the app. This post is the *manifest layer* of that work: what I actually deploy, in what order, with what guard-rails.

Skip this post if you've never run `kubectl`. Read it if you've got the basics down and want to see what a real production setup looks like.

## The mental model

Kubernetes objects fall into a few layers:

- **Workloads** — `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, `CronJob`. These run your code.
- **Networking** — `Service`, `Ingress`, `NetworkPolicy`. These expose / restrict your code.
- **Config** — `ConfigMap`, `Secret`. These configure your code.
- **Scaling** — `HorizontalPodAutoscaler`, `PodDisruptionBudget`. These keep your code resilient.

Everything else (Operators, CRDs, ServiceMesh, etc.) is built on these primitives.

## The base Deployment

```yaml
# k8s/api/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: chat
  labels:
    app: api
    tier: backend
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
        tier: backend
    spec:
      serviceAccountName: api
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: api
          image: 123456789012.dkr.ecr.ap-south-1.amazonaws.com/chat-api:v1.42.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "3000"
          envFrom:
            - configMapRef:
                name: api-config
            - secretRef:
                name: api-secrets
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: api
```

Every line in there earns its place. Let me unpack the non-obvious ones.

### `maxSurge: 1, maxUnavailable: 0`

During a rolling update, allow one extra pod above replicas (= 4 running briefly), but never go below `replicas` available. Zero-downtime deploys at the cost of a bit of headroom.

### Liveness vs. readiness — they're different things

- **Readiness** — "Can I receive traffic right now?" If no, the Service stops routing to me. Fails frequently and recovers (e.g. a brief DB blip).
- **Liveness** — "Am I deadlocked / broken?" If yes, kill me and restart. Fails rarely and should be a real "this pod is hosed" signal.

Common mistake: using the same endpoint for both. Don't. A slow DB shouldn't cause Kubernetes to kill your pods — that just amplifies the outage. Readiness should check "can I serve traffic" (DB reachable, cache warm). Liveness should be a simple "the process is alive and responsive."

### `requests` vs. `limits`

- **Requests** — what the scheduler reserves. Determines which node you land on.
- **Limits** — the hard cap. CPU gets throttled, memory gets OOM-killed.

The judgement call:

- **Memory**: set `request == limit`. Memory is incompressible — a pod above limit gets killed. You want predictable.
- **CPU**: set `request` based on steady-state, `limit` higher (or omit) so bursts work. CPU is compressible — throttling slows you down but doesn't kill you.

Setting `request: cpu: 100m, limit: cpu: 1000m` lets the pod use up to 1 vCPU when available but only reserves 0.1 vCPU on the node.

### `readOnlyRootFilesystem: true`

Belongs in security. If your app gets compromised, the attacker can't write to the filesystem. For apps that need temp dirs, mount an `emptyDir` volume:

```yaml
volumeMounts:
  - name: tmp
    mountPath: /tmp
volumes:
  - name: tmp
    emptyDir: {}
```

### `topologySpreadConstraints`

Spread pods across availability zones. Without this, the scheduler can pile all 3 pods into one zone. When that zone has an outage, you have zero pods running.

## The Service

```yaml
# k8s/api/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: chat
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
```

`ClusterIP` is the default and the right choice 95% of the time. Services in the same cluster reach this via `http://api.chat.svc.cluster.local:80` (or just `http://api` from the same namespace).

`LoadBalancer` and `NodePort` are for direct internet exposure — don't use them. Use Ingress.

## Ingress (AWS Load Balancer Controller)

On EKS, I run the [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/) which provisions an ALB per Ingress:

```yaml
# k8s/api/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  namespace: chat
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/ssl-redirect: '443'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-1:123:certificate/abcd
    alb.ingress.kubernetes.io/healthcheck-path: /health/ready
spec:
  rules:
    - host: api.ezchat.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

`target-type: ip` is critical — it lets the ALB target Pod IPs directly, skipping the NodePort hop. Lower latency, simpler routing.

The ACM certificate ARN points to a cert in the same region. Route 53 record for `api.ezchat.example.com` is an alias to the ALB's DNS name — managed by ExternalDNS or Terraform.

## ConfigMaps and Secrets

```yaml
# k8s/api/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
  namespace: chat
data:
  LOG_LEVEL: info
  CORS_ORIGIN: https://app.ezchat.example.com
  MONGO_URI: mongodb://mongo.chat.svc.cluster.local:27017/chat
```

Reference via `envFrom: configMapRef:` in the Deployment, as shown above.

For Secrets, I use **External Secrets Operator** synced to AWS Secrets Manager. Manifest:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: api-secrets
  namespace: chat
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: api-secrets
  data:
    - secretKey: JWT_SECRET
      remoteRef:
        key: chat/prod/jwt-secret
    - secretKey: STRIPE_KEY
      remoteRef:
        key: chat/prod/stripe-key
```

The actual secret values live in AWS Secrets Manager (or HashiCorp Vault, or whatever). The Kubernetes Secret is just a synced cache. Rotating in Secrets Manager → automatic refresh in cluster.

Never check `kind: Secret` manifests with plain `data:` into Git. Even base64-encoded, they're effectively plaintext.

## HPA — autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
  namespace: chat
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300    # don't scale down impulsively
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0      # scale up immediately
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
```

Default behavior is fine, but tuning `stabilizationWindowSeconds` matters. Default 5 min scale-down avoids thrashing on bursty workloads. Scaling up should be aggressive — the cost of an extra pod for 5 minutes is way less than the cost of a queue backing up.

For HTTP-bound services, scale on RPS via the Prometheus adapter or KEDA, not CPU. CPU is a lagging indicator.

## PDB — protect against involuntary disruption

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
  namespace: chat
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api
```

When a node drains (cluster upgrade, autoscaler scale-down, manual `kubectl drain`), Kubernetes respects the PDB. Without one, all 3 pods could be evicted simultaneously and your service goes dark. With `minAvailable: 2`, at most one pod is gone at a time.

## NetworkPolicies (the security thing nobody enables)

By default, every pod can talk to every other pod in the cluster. NetworkPolicies restrict that:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow
  namespace: chat
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
        - namespaceSelector:
            matchLabels:
              name: chat-ingress
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: mongo
      ports:
        - protocol: TCP
          port: 27017
    - to:                              # allow DNS
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

This API pod can only be reached by frontend pods or ingress, and can only call MongoDB and DNS. If the API is compromised, the blast radius is contained.

EKS needs the AWS VPC CNI with NetworkPolicy support enabled, or Calico. Worth it.

## Helm? Kustomize? Plain YAML?

I use **Kustomize** for almost everything now. Plain YAML for tiny single-environment projects, Helm only when I need to package something for distribution.

Kustomize layout:

```
k8s/
├── base/
│   ├── api/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   ├── hpa.yaml
│   │   ├── pdb.yaml
│   │   └── kustomization.yaml
│   └── kustomization.yaml
└── overlays/
    ├── staging/
    │   ├── kustomization.yaml         # patches: lower replicas, staging configmap
    │   └── replicas-patch.yaml
    └── prod/
        ├── kustomization.yaml
        └── replicas-patch.yaml
```

```yaml
# overlays/prod/kustomization.yaml
resources:
  - ../../base
patches:
  - path: replicas-patch.yaml
images:
  - name: chat-api
    newTag: v1.42.0
```

Deploy: `kubectl apply -k k8s/overlays/prod`. One command, full environment.

Helm shines when you're maintaining a chart for someone else (a database operator, a third-party tool you publish). For internal apps, Kustomize is less ceremony.

## The kubectl moves I use daily

```bash
kubectl get pods -n chat -o wide        # which nodes are pods on?
kubectl describe pod api-xyz -n chat    # full event log, restart reason
kubectl logs -f api-xyz -n chat         # tail logs
kubectl logs -p api-xyz -n chat         # previous container (crashed pod)
kubectl exec -it api-xyz -n chat -- sh  # shell into pod
kubectl port-forward svc/api 8080:80 -n chat   # tunnel a service locally

# debug a service that should be reachable but isn't
kubectl run debug --rm -it --image=alpine -- sh
# from inside: wget -qO- http://api.chat.svc.cluster.local

# rollout management
kubectl rollout status deployment/api -n chat
kubectl rollout history deployment/api -n chat
kubectl rollout undo deployment/api -n chat                # roll back last deploy
kubectl rollout undo deployment/api --to-revision=42 -n chat

# resource pressure
kubectl top nodes
kubectl top pods -n chat --sort-by=memory
```

Alias `k=kubectl` in your shell. `kubectl` is the most-typed command on any cluster.

## Operational checklist for any new service

Before I declare a service "production-ready" on EKS:

- ✅ Liveness AND readiness probes, with different endpoints
- ✅ Resource requests AND limits set
- ✅ `runAsNonRoot: true`, `readOnlyRootFilesystem: true`
- ✅ HPA with sensible min/max
- ✅ PDB with `minAvailable: 1` or higher
- ✅ `topologySpreadConstraints` across zones
- ✅ ConfigMap for non-secrets, ExternalSecret for secrets
- ✅ NetworkPolicy restricting ingress and egress
- ✅ ServiceAccount with the minimum IAM role via IRSA
- ✅ ALB Ingress with HTTPS, ACM cert, healthcheck path
- ✅ Prometheus ServiceMonitor or annotation for metrics scraping
- ✅ CloudWatch Container Insights enabled at cluster level

Skipping any one of these is fine for an MVP. Skipping all of them is how you get a 3 am page about a single-zone outage.

## What I run alongside the app

A production EKS cluster isn't just your app pods. Mine usually has:

- **AWS Load Balancer Controller** — for ALB/NLB-backed Ingress
- **External DNS** — auto-manages Route 53 records from Ingress hosts
- **External Secrets Operator** — syncs Secrets Manager into k8s Secrets
- **Cluster Autoscaler** or **Karpenter** — scales nodes to match pod demand
- **Metrics Server** — required for HPA
- **Prometheus** + **Grafana** (or AMP/AMG) — metrics
- **Loki** or **CloudWatch Logs** — logs
- **cert-manager** — only if you're not using ACM (rare on EKS)

Each gets its own Helm chart, its own values, its own upgrade discipline. Treat the cluster's add-ons like infrastructure code — Terraform or Argo CD, not `helm install` by hand.

---

This is what production Kubernetes looks like once you've made all the mistakes. There's no "K8s level 10" — just the discipline of putting every guard-rail in place and keeping the manifests boring.

*Architecting a Kubernetes platform from scratch? I designed and provisioned the EKS cluster behind a Dubai-based realtime chat platform with Terraform and eksctl — [start a project](/#contact).*
