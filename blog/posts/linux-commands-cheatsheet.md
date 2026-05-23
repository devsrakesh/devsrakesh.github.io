---
title: "Must-Know Linux Commands & File System for Developers and DevOps"
date: 2026-04-04
excerpt: "The Linux toolkit every working developer and DevOps engineer should have in their muscle memory — navigation, files, processes, networking, permissions, and pipelines."
tags: [linux, devops, shell, bash, fundamentals]
---

If you can't drive a Linux box from the command line, you can't do DevOps. You can't reliably debug a production incident, can't tail a log, can't trace why your Node process is eating 12 GB of RAM. This post is the toolkit I expect every developer I work with to have in their muscle memory.

I won't dump every flag of every command — `man` does that better than I can. Instead I'll cover the **30 commands you'll actually use every week**, grouped by what you're trying to accomplish.

## The file system in 90 seconds

Linux organises everything under `/` (the root). A few directories you should recognise on sight:

- `/etc/` — config files. Nginx, systemd, SSH, fstab, hosts.
- `/var/log/` — log files. Almost every long-running service writes here.
- `/usr/local/bin/` — binaries you installed manually (vs. `/usr/bin/` for the package manager's).
- `/home/<user>/` — your user's home. `~` is shorthand for this.
- `/tmp/` — scratch space, wiped on reboot.
- `/opt/` — third-party application installs (Node from a tarball, JetBrains tooling, etc.).
- `/proc/` and `/sys/` — virtual filesystems that expose kernel and process state as files. `cat /proc/cpuinfo` is real.

The rule that catches juniors: **paths are case-sensitive** and **everything is a file** — sockets, devices, even running processes. Internalise that and the rest gets easier.

## Navigation

```bash
pwd                  # where am I?
cd /var/log          # go there
cd -                 # go back to where I just was
cd                   # go to ~
ls -lah              # long, all (incl. dotfiles), human-readable sizes
tree -L 2            # directory tree, 2 levels deep
```

`ls -lah` is the alias I use 50 times a day. Make it muscle memory.

## Reading files

```bash
cat app.log                       # whole file — fine for small files only
less app.log                      # paged viewer (q to quit, / to search)
head -n 50 app.log                # first 50 lines
tail -n 100 app.log               # last 100 lines
tail -f app.log                   # follow the file as it grows
tail -F app.log                   # follow even through log rotation
```

`tail -F` over `tail -f` is the move once you've been burned by a logrotate cutting your follow off mid-incident.

## Searching with grep, find, fzf

```bash
grep -rn "TODO" src/              # recursive, with line numbers
grep -v "^#" config.yaml          # exclude lines starting with #
grep -E "error|warn" app.log      # extended regex (or use -P for Perl regex)

find . -name "*.env" -type f      # find files by name
find . -mtime -1                  # files modified in the last day
find . -size +100M                # files larger than 100MB

# Combine for power moves:
find . -name "*.log" -exec grep -l "ECONNREFUSED" {} \;
```

If you don't already have **ripgrep** (`rg`) installed, install it. It's grep but 10x faster and respects `.gitignore` by default:

```bash
rg "ECONNREFUSED" --type js       # blazing fast, smart defaults
```

## File operations

```bash
cp -rv src/ dest/                 # recursive, verbose
mv old.txt new.txt                # rename or move
rm -rf node_modules/              # the nuclear option — be CERTAIN
mkdir -p a/b/c                    # create nested dirs in one go
touch new-file.txt                # create empty file (or update mtime)
ln -s /opt/myapp/current /usr/local/bin/myapp   # symlink
```

The `rm -rf` warning is real. There's no trash bin. I once watched a junior `rm -rf /` on a customer's production box because their script had `rm -rf $UNSET_VAR/`. Always quote your variables and `set -u` in scripts.

## Permissions: the chmod model

Linux permissions are three triplets — `owner` / `group` / `everyone` — each carrying `r` (read = 4), `w` (write = 2), `x` (execute = 1). Add them up:

- `755` = owner: rwx (7), others: rx (5) — typical for executables and directories
- `644` = owner: rw (6), others: r (4) — typical for regular files
- `600` = owner: rw, no one else — for secrets and private keys

```bash
chmod 600 ~/.ssh/id_ed25519       # SSH will refuse the key otherwise
chmod +x deploy.sh                # make a script executable
chown -R deploy:deploy /opt/app   # set owner + group recursively
```

`ls -l` shows permissions as `-rwxr-xr-x` — translate it to `755` in your head until it's instant.

## Processes

```bash
ps aux | grep node                # who is running my Node process?
ps -ef --forest                   # process tree
top                               # live process viewer
htop                              # nicer top (install it)
kill <pid>                        # polite stop (SIGTERM)
kill -9 <pid>                     # rude stop (SIGKILL) — last resort
pkill -f "node server.js"         # kill by command pattern
```

The signal hierarchy:
- `SIGHUP` (1) — reload config without restart (Nginx loves this)
- `SIGINT` (2) — Ctrl-C
- `SIGTERM` (15) — please clean up and exit (the polite default)
- `SIGKILL` (9) — die now, no cleanup, no graceful shutdown

If `SIGTERM` doesn't work, your app is ignoring it. Fix the app — don't reach for `-9` as a habit.

## Background jobs

```bash
long-command &                    # run in background
jobs                              # list backgrounded jobs
fg %1                             # bring job 1 to foreground
bg %1                             # resume in background
disown -h %1                      # detach so it survives logout

nohup ./worker > worker.log 2>&1 &   # immune to hangup, output to file

# Better: just use tmux
tmux new -s work                  # named session
# Ctrl-b d to detach
tmux attach -t work               # reattach later
```

For anything long-running, use `tmux` or `screen` — not nohup. You get scrolling, splits, and your terminal can drop without killing your work.

## Pipes, redirects, and the Unix philosophy

This is the part juniors underuse. Tiny commands compose into power tools:

```bash
# Find the 5 largest files in /var
du -ah /var | sort -rh | head -5

# Count unique IPs in an access log
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head

# Find processes hogging RAM
ps aux --sort=-%mem | head -10

# Tail logs through grep, save to file, watch live
tail -F app.log | grep -E "error|fatal" | tee errors.log
```

The operators:
- `|` — stdout of A becomes stdin of B
- `>` — overwrite file with stdout
- `>>` — append
- `2>` — redirect stderr
- `2>&1` — merge stderr into stdout (then you can pipe both)
- `<` — feed file into stdin
- `tee` — both write to file AND pass through

## Networking

```bash
curl -sS https://httpbin.org/get                       # quick HTTP request
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"r"}' https://api.example.com/v1/users   # POST with JSON
curl -I https://example.com                            # just headers
curl -L https://example.com                            # follow redirects

wget https://example.com/file.tar.gz                   # downloads to disk

ssh user@host                                           # remote login
ssh -i ~/.ssh/key.pem ubuntu@1.2.3.4                   # with specific key
scp file.txt ubuntu@host:/tmp/                         # copy file to remote
rsync -avzP ./build/ ubuntu@host:/var/www/             # smart sync (preferred)

ss -tulpn                                              # listening ports + PIDs (modern netstat)
dig example.com                                        # DNS lookup
dig +short example.com                                 # just the IPs
nslookup example.com 8.8.8.8                           # query a specific resolver
```

`ss` replaced `netstat` years ago — learn it.

`rsync -avzP` is one of the most underused commands. It only transfers what changed, compresses on the wire, shows progress, and is idempotent. Use it instead of `scp` for anything bigger than a single file.

## Disk and system

```bash
df -h                             # disk usage, mountpoints
du -sh ./                         # size of current dir
du -sh */ | sort -h               # size per subdir, sorted

free -h                           # memory usage
uptime                            # load average + uptime
uname -a                          # kernel, host, architecture
lsblk                             # block devices (partitions, mounts)
mount                             # what's mounted where
```

Production debugging starts with `df -h`. A surprising number of "the API is down" tickets are "the disk is full and Postgres can't write."

## systemd: managing services

On any modern Linux, services are systemd units:

```bash
sudo systemctl status nginx       # is it running? when did it last restart?
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx       # SIGHUP — re-read config without restart
sudo systemctl enable nginx       # auto-start on boot
sudo systemctl disable nginx

journalctl -u nginx -n 100        # last 100 lines of nginx logs
journalctl -u nginx -f            # follow live
journalctl -u nginx --since "1 hour ago"
```

For your own Node services, write a systemd unit instead of using PM2 — it's more native and handles restarts properly. (PM2 is fine; systemd is just one less abstraction.)

## Text manipulation: sed, awk, jq

You'll use these in scripts and one-liners more than you think:

```bash
# sed: replace text in place
sed -i 's/oldhost/newhost/g' config.yaml
sed -n '10,20p' file.log          # print lines 10-20

# awk: extract columns
awk '{print $2, $5}' access.log   # print 2nd and 5th columns

# jq: parse JSON
curl -s https://api.github.com/users/devsrakesh | jq '.public_repos'
kubectl get pods -o json | jq '.items[].metadata.name'
```

`jq` is essential the moment you start working with APIs. Install it.

## Shell rc files and aliases

Open `~/.zshrc` (or `~/.bashrc`) and put your aliases there:

```bash
alias ll='ls -lah'
alias gs='git status'
alias k='kubectl'
alias tf='terraform'
alias ports='ss -tulpn'

# Functions are aliases that take arguments
mkcd() { mkdir -p "$1" && cd "$1"; }
```

Reload: `source ~/.zshrc`.

## The mindset shift

The reason senior engineers move so fast on a Linux box isn't that they remember more flags. It's that they:

1. **Compose small commands** instead of looking for a "do everything" tool.
2. **Don't trust state they didn't verify** — they `ls` after `mv`, `ps` after `kill`, `curl` to confirm DNS.
3. **Read the manual** — `man <cmd>` or `<cmd> --help`. Two minutes of `man rsync` saves an hour of stack overflow.
4. **Script repeated work** — the third time you type something, it goes in a script.

Get the basics into your hands and the rest accrues naturally. I still learn new flags on tools I've used for a decade.

---

*Working on a Linux server I might recognise? I'm available for cloud architecture and DevOps engagements — [start a project](/#contact).*
