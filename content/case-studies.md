---
title: Architecture case studies
---

## EzChatting — realtime chat on AWS Kubernetes

### Problem

A Dubai-based client needed a realtime chat platform with low-latency message delivery, end-to-end secure WebSocket connections, and the ability to scale horizontally as user counts grew. They needed a true production Kubernetes setup — not a toy cluster.

### Solution

Designed and provisioned a 3-tier AWS EKS architecture from scratch. Terraform for the VPC and EKS control plane; eksctl for managed node groups; AWS Load Balancer Controller for ingress; ExternalDNS for Route 53; External Secrets Operator for secrets sourced from AWS Secrets Manager. Kubernetes manifests covered Deployments, Services, HPA, ConfigMaps, probes, and resource limits — checked into the same repo as the app.

### Tech

AWS EKS / Kubernetes / Terraform / eksctl / ALB Ingress / ExternalDNS / External Secrets / ECR / MongoDB / Redis / NestJS / Next.js / WebSockets / GitHub Actions

### Delivery details

- Zero-downtime rolling deployments via GitHub Actions + EKS

- Secrets externalised — no credentials checked into Git

### Lessons

External Secrets Operator paid for itself on day one — secrets rotation became a Secrets Manager change, not a redeploy. Multi-AZ node groups + Pod Disruption Budgets are what make "the cluster survives an AZ outage" actually true.

## MyBankSlip — accounting SaaS on ECS Fargate

### Problem

A Dubai accounting SaaS client needed production-grade infrastructure without the operational overhead of EKS. The platform handles financial data, so isolation, encryption, and audit trails were non-negotiable — but the team was small and couldn't justify a full Kubernetes operator on the payroll.

### Solution

A 3-tier ECS Fargate deployment: private VPC across 2 AZs, ALB in public subnets, Fargate tasks in private subnets, MongoDB Atlas peered into the VPC, ECR for images, Route 53 + ACM for TLS. Terraform for everything; GitHub Actions for blue-green-style task definition deploys with health checks. The same reference architecture was reused for Tally Cash Pro and Monday Report.

### Tech

ECS Fargate / ALB / ECR / RDS / MongoDB / Route 53 / ACM / Terraform / GitHub Actions / NestJS / Next.js / CloudWatch

### Delivery details

- Zero-downtime rolling task replacement with ALB health checks

### Lessons

For 90% of small-to-mid SaaS workloads, ECS Fargate is the right answer — not EKS. You don't pay the operator tax, but you keep containers, blue-green deploys, and IaC. Pick EKS only when you actually need control plane access.

## Monday Report — reporting platform with full observability

### Problem

The client's previous reporting system was a black box — when a report failed or was slow, nobody could explain why. They needed every API call, every database query, and every error traced and dashboarded so operations could spot regressions before customers complained.

### Solution

ECS Fargate service instrumented with Prometheus client libraries, scraped by a managed Prometheus deployment, visualised in Grafana. All container stdout shipped to CloudWatch Logs with structured JSON. Alarms wired to CloudWatch + Grafana alerting. Terraform built the cluster, the Prometheus stack, and the dashboards as code — observability lives in the repo, not in someone's head.

### Tech

ECS / Terraform / Prometheus / Grafana / CloudWatch / GitHub Actions / NestJS / Structured logging

### Delivery details

- Dashboards-as-code — version-controlled, reviewable, reproducible

### Lessons

Observability isn't a phase-2 add-on. Building dashboards alongside the app — same PR, same review — saves weeks of "we'll instrument it later" debt. Alert on user-facing signals (latency, errors, saturation), not on internal CPU.

## HousingCart — real-estate platform with realtime notifications

### Problem

The team needed a working real-estate marketplace with two non-trivial problems: ingesting messy property data from multiple third-party sources, and pushing realtime notifications to leads across both push and WhatsApp without dropping messages.

### Solution

Designed and built the backend admin platform and the customer-facing marketplace. Express + MongoDB on AWS EC2, Next.js frontend, S3 for media. A real-time notification pipeline integrated Firebase Cloud Messaging for in-app push and the WhatsApp Business API for outbound messaging, with fallback paths between channels. Custom JavaScript ETL utilities cleaned and normalised property data before ingestion.

### Tech

Next.js / Express / Node.js / MongoDB / AWS EC2 / AWS S3 / Firebase FCM / WhatsApp Business API / Nginx / PM2

### Lessons

Third-party data is always messier than the schema docs promise — invest in the ETL early. And: WhatsApp Business API has stricter template approval and rate limits than FCM, so design notification flows assuming one channel can be temporarily unavailable.

## Gift Factory — e-commerce platform on AWS ECS

### Problem

An e-commerce client needed a scalable platform with reliable transactional data, predictable cost as orders grew, and full Infrastructure-as-Code so the environment could be rebuilt or migrated without tribal knowledge.

### Solution

End-to-end system design on AWS ECS — private VPC across multiple subnets, ALB in public subnets, ECS service in private subnets, RDS PostgreSQL in isolated subnets with backups and Multi-AZ failover, Route 53 for DNS, ACM for TLS. Every resource provisioned via Terraform modules so the entire environment is reproducible.

### Tech

ECS / RDS PostgreSQL / ALB / Route 53 / ACM / Terraform / VPC / GitHub Actions / NestJS

### Delivery details

- RDS Multi-AZ failover for transactional resilience

### Lessons

For e-commerce, the relational model wins — RDS PostgreSQL beats document stores for inventory, orders, and refunds where you need joins and transactions. And keep RDS in an isolated subnet — never publicly reachable, even via the ALB.
