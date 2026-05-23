---
title: "Deploying NestJS and Next.js to AWS EC2 with Nginx, PM2, and Certbot"
date: 2026-05-09
excerpt: "End-to-end EC2 deployment for Node services — Ubuntu setup, Nginx reverse proxy with HTTP/2, PM2 process management, Let's Encrypt SSL, and the systemd hardening I actually use in production."
tags: [aws, ec2, nginx, certbot, pm2, nestjs, nextjs, deployment]
---

Before you reach for ECS or EKS, there's still a place for a single EC2 instance running your Node service behind Nginx. It's how I've run dozens of services — including HousingCart, iKey, and most of the Linux-managed services in my portfolio. Cheap, predictable, and easy to debug when something goes wrong at 2 am.

This post is the **exact** sequence I run when I provision a new EC2 box for a NestJS API or a Next.js app. Copy-paste ready.

## The stack

- **EC2** — Ubuntu 22.04 LTS, t3.small or t3.medium, 20 GB gp3 EBS.
- **Nginx** — reverse proxy, HTTP/2, gzip, SSL termination.
- **Certbot** — Let's Encrypt SSL with auto-renewal.
- **Node 20** via NodeSource.
- **PM2** — process manager + boot integration.
- **UFW** — firewall (or AWS Security Groups; usually both).
- **fail2ban** — brute-force protection on SSH.

I deploy systemd-native for new services now, but PM2 is still my default when handing the server to a junior team to operate.

## Provisioning the instance

Security Group rules:

- **22/tcp** from your IP only (or zero — use Systems Manager Session Manager and skip SSH altogether)
- **80/tcp** from `0.0.0.0/0`
- **443/tcp** from `0.0.0.0/0`

Never open 22 to the world. SSH key auth + non-default port helps; restricting source CIDR helps more.

EBS volume: gp3, 20 GB minimum. The default 8 GB will fill up the first time you `npm install` a Next.js app.

Elastic IP attached to the instance — so your DNS doesn't break when you stop/start the box.

Route 53 A record (`api.example.com`) → Elastic IP.

## First-boot hardening

SSH in (or use Session Manager) and run:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential unzip htop ncdu jq ufw fail2ban
sudo timedatectl set-timezone UTC

# Create a non-root user for the app
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

SSH hardening — edit `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
sudo systemctl restart ssh
```

UFW (firewall):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

UFW is "belt" — the Security Group is "braces." Both at once.

fail2ban with defaults catches SSH brute-force attempts. Just enable:

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd       # confirm it's watching
```

## Install Node 20 and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version

sudo npm install -g pm2
pm2 --version
```

PM2 boot integration so your app starts on reboot:

```bash
pm2 startup systemd -u deploy --hp /home/deploy
# Run the command pm2 prints — it sets up the systemd unit
```

## Install and configure Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

The site config for a NestJS API. `/etc/nginx/sites-available/api.example.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.example.com;

    # SSL certs (Certbot will fill these in)
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    # Body size — adjust for your file upload needs
    client_max_body_size 25m;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # Proxy to the Node app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # WebSocket support (Socket.IO, NestJS gateways)
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_connect_timeout 5s;
    }
}
```

Enable and test:

```bash
sudo ln -sf /etc/nginx/sites-available/api.example.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                          # ALWAYS test before reload
sudo systemctl reload nginx
```

For Next.js, the config is identical except `proxy_pass` points to whatever port `next start` listens on (usually 3000), and you may want to add caching for static assets:

```nginx
location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_cache_valid 200 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

## Let's Encrypt with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot

sudo certbot --nginx -d api.example.com \
    --non-interactive --agree-tos --email you@example.com \
    --redirect
```

Certbot edits your Nginx config to add the cert paths and the HTTPS redirect. It also installs a systemd timer that auto-renews. Verify:

```bash
sudo systemctl list-timers | grep certbot
sudo certbot renew --dry-run            # confirm renewal works
```

The cert renews itself every ~60 days. You set it once and forget.

## Deploy the app

```bash
sudo -iu deploy             # become the deploy user
cd ~
git clone git@github.com:devsrakesh/api.git
cd api

# Set up SSH deploy key in GitHub if private repo
ssh-keygen -t ed25519 -C "deploy@$(hostname)" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub        # add to GitHub repo → Deploy keys

npm ci --omit=dev               # production deps only
npm run build                    # produces dist/

# Create the env file
nano .env                        # paste production env vars
chmod 600 .env                   # only deploy user can read
```

Start with PM2:

```bash
pm2 start dist/main.js --name api --instances max --exec-mode cluster
pm2 save                         # persist across reboots
pm2 status
pm2 logs api
```

`--instances max` uses all CPU cores, `--exec-mode cluster` enables Node cluster mode (load-balanced workers behind one port). For a t3.small (2 vCPU), you'll get 2 workers.

## The deploy script

I drop this at `/home/deploy/api/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /home/deploy/api

echo "▸ Pulling latest..."
git fetch origin main
git reset --hard origin/main

echo "▸ Installing deps..."
npm ci --omit=dev

echo "▸ Building..."
npm run build

echo "▸ Reloading PM2..."
pm2 reload api --update-env

echo "✓ Deployed $(git rev-parse --short HEAD)"
```

```bash
chmod +x deploy.sh
./deploy.sh
```

`pm2 reload` (not restart) does a zero-downtime reload — it starts new workers, swaps them in, then stops the old workers. Connections never drop.

For full CI/CD, wire this into GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.EC2_HOST }}
          username: deploy
          key: ${{ secrets.EC2_SSH_KEY }}
          script: /home/deploy/api/deploy.sh
```

## Log management

PM2 writes logs to `~/.pm2/logs/` by default. Rotate them or fill the disk:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

For long-term retention, ship logs to CloudWatch with the CloudWatch agent or use Filebeat → Elasticsearch. Don't trust the EC2 disk for log history beyond a week.

## Monitoring

The 80/20 of EC2 monitoring:

- **CloudWatch agent** — push system metrics (memory, disk — CPU is collected by default)
- **CloudWatch alarms** — on CPU >80% for 10 min, disk free <10%, status check failed
- **PM2 plus** — free tier gives you a dashboard of your processes
- **Uptime monitor** — a service like UptimeRobot or BetterStack pinging `/health` from outside AWS. AWS noticing your instance is dead is no good if AWS itself is the problem.

CloudWatch agent install:

```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

The wizard generates a config in `/opt/aws/amazon-cloudwatch-agent/etc/`. Start the agent and metrics start appearing in CloudWatch within a minute.

## The systemd alternative to PM2

For new services, I increasingly skip PM2 and use systemd directly. Less abstraction, fewer moving parts.

```ini
# /etc/systemd/system/api.service
[Unit]
Description=Chat API
After=network.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/home/deploy/api
EnvironmentFile=/home/deploy/api/.env
ExecStart=/usr/bin/node /home/deploy/api/dist/main.js
Restart=on-failure
RestartSec=5s

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
ReadWritePaths=/home/deploy/api/uploads
StandardOutput=append:/var/log/api.log
StandardError=append:/var/log/api.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now api
sudo systemctl status api
sudo journalctl -u api -f
```

Restarts, log capture, boot integration — all native. No cluster mode out of the box (use Node's `cluster` module in code, or front Nginx with `upstream` blocks pointing to multiple ports).

## Snapshot before you touch anything

```bash
# from your laptop with AWS CLI
aws ec2 create-snapshot --volume-id vol-XXX --description "before nginx config change $(date +%F)"
```

Snapshot before any config change, any upgrade, any "I think this will work but..." Yes, you're using AMIs and Auto Scaling Groups eventually — for now, snapshots are 30-second insurance.

## When to leave EC2

I move services off plain EC2 to ECS/EKS when one of these is true:

- I need to run >3 instances of the same service (orchestration becomes painful manually)
- I need blue/green or canary deploys
- I need autoscaling on actual demand, not "I'll resize the instance manually"
- The team is large enough that "SSH into the box" is a security/audit problem

For a single service, single instance, low-to-medium traffic — EC2 + Nginx + PM2 + Certbot is still the cleanest setup. Don't overengineer it.

---

The recipe above has shipped well over a dozen production Node services for me. Boring, predictable, debuggable.

*Need a Node service on a real domain by Friday? I deploy production EC2 setups on a fixed-fee basis — [start a project](/#contact).*
