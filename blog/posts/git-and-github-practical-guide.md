---
title: "Git & GitHub for Working Engineers: The Workflow I Actually Use"
date: 2026-04-11
excerpt: "Not a Git tutorial — the workflow, the recovery moves, and the GitHub Actions patterns I run in production across a portfolio of NestJS and Next.js services."
tags: [git, github, devops, workflow, ci-cd]
---

Every developer has read the Git "what is a commit" tutorial. None of that helps when you've just rebased on the wrong branch at 11 pm and your week of work is "gone." This post is the Git workflow I actually use, the recovery moves I reach for when something goes wrong, and the GitHub Actions patterns I have running across NestJS and Next.js services on ECS and EKS.

## One-time setup

Whenever I'm on a new machine:

```bash
git config --global user.name "Rakesh Rajput"
git config --global user.email "developer.rakesh.rajput@gmail.com"
git config --global init.defaultBranch main
git config --global pull.rebase true            # don't make merge commits on pull
git config --global rebase.autoStash true       # auto-stash dirty changes during rebase
git config --global push.autoSetupRemote true   # save the -u origin <branch> dance
git config --global core.editor "code --wait"   # opens VS Code for commit messages

# Signed commits — GitHub puts a "Verified" badge on them
git config --global commit.gpgsign true
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
```

SSH-based commit signing is the easy modern path — no GPG keychain pain.

## My day-to-day loop

I work feature-branch-from-`main`, push, open a PR, squash-merge. Not because it's the "best" — because it's the simplest, leaves a clean `main` history, and works across every team I've shipped on.

```bash
git checkout main && git pull
git checkout -b feat/whatsapp-notifications

# ... work, commit small atomic chunks ...

git push                                         # autoSetupRemote handles -u
gh pr create --fill --base main                  # GitHub CLI — way faster than the UI
```

GitHub CLI (`gh`) is non-negotiable once you've used it. PR creation, review, merge — all from terminal:

```bash
gh pr list
gh pr checkout 42                                # checks out PR #42 locally
gh pr view --web                                 # open PR in browser
gh pr merge --squash --delete-branch             # merge and clean up
gh pr checks                                     # CI status without opening browser
```

## Stop typing `git status` and `git log` like that

Aliases. Put these in `~/.gitconfig`:

```ini
[alias]
  s = status -sb
  co = checkout
  ci = commit
  br = branch
  unstage = reset HEAD --
  lg = log --graph --abbrev-commit --decorate --format=format:'%C(yellow)%h%C(reset) - %C(white)%s%C(reset) %C(dim)— %an, %ar%C(reset)%C(auto)%d%C(reset)' --all
  amend = commit --amend --no-edit
  wip = !git add -A && git commit -m 'wip'
  undo = reset --soft HEAD~1
  recent = for-each-ref --sort=-committerdate --count=10 --format='%(refname:short)' refs/heads/
```

`git lg` is the one I use most. Try it once on a busy repo and you won't go back.

## Branches — what to keep, what to throw away

I keep these long-lived:

- `main` — always deployable, protected, requires PR + passing checks.
- `develop` — only when a team explicitly needs a staging integration branch. Most projects don't.

Everything else is short-lived: `feat/...`, `fix/...`, `chore/...`, `refactor/...`. Delete after merge. Branch hoarding makes `git branch` useless.

```bash
git branch --merged main | grep -v '^* main$' | xargs -n1 git branch -d   # nuke merged local branches
git remote prune origin                                                    # remove dead remote-tracking refs
```

I run those weekly.

## Rebase vs merge, settled

I rebase **feature branches onto main** to stay current, and **squash-merge PRs into main** so `main` is one commit per feature. Never merge `main` into a feature branch — that creates a merge commit you'll regret reading later.

```bash
git checkout feat/whatsapp
git fetch origin
git rebase origin/main             # replay my commits on top of the latest main
# resolve conflicts, then:
git push --force-with-lease        # NEVER --force, always --force-with-lease
```

`--force-with-lease` refuses the push if someone else pushed to your branch in the meantime. `--force` doesn't ask — it just nukes their work. Make `--force-with-lease` muscle memory.

## The recovery moves

This is the section that actually matters when something goes wrong.

### "I committed to the wrong branch"

```bash
git log -1                            # confirm the commit you want to move
git reset --soft HEAD~1               # uncommit, keep changes staged
git stash                             # park them
git checkout correct-branch
git stash pop
git commit -m "..."
```

### "I want my last commit's changes but not the commit"

```bash
git reset --soft HEAD~1               # uncommit, keep staged
git reset HEAD~1                      # uncommit, keep unstaged
git reset --hard HEAD~1               # uncommit, discard (dangerous)
```

### "I deleted a branch I needed"

`reflog` is your time machine. Every move HEAD makes is recorded:

```bash
git reflog                            # find the SHA of the lost commit
git checkout -b recovered-branch <sha>
```

Reflog entries last ~90 days by default. Almost nothing is truly lost in Git.

### "I rebased and trashed someone else's work on my branch"

```bash
git reflog                            # find your branch's SHA before the rebase
git reset --hard <pre-rebase-sha>
git push --force-with-lease
```

This is exactly why `--force-with-lease` and `reflog` exist together.

### "Merge conflict and I want to start the merge/rebase over"

```bash
git rebase --abort                    # bail out of a rebase
git merge --abort                     # bail out of a merge
git cherry-pick --abort               # bail out of a cherry-pick
```

### "I accidentally added secrets to a commit"

If you haven't pushed: amend the commit and remove the file.

```bash
git rm --cached .env
echo ".env" >> .gitignore
git commit --amend --no-edit
```

If you've pushed: the secret is compromised. Rotate it first, then scrub the history with `git filter-repo` (modern replacement for `git filter-branch`). I've written about [a real push-protection incident on this site](/#projects) — short version: GitHub's secret scanning blocked the push, and the right answer was always "rotate the key, then rewrite history."

## .gitignore that actually works

The single biggest source of committed secrets is a missing `.gitignore`. Mine starts with:

```gitignore
# OS
.DS_Store
Thumbs.db

# Editors
.vscode/
.idea/

# Node
node_modules/
dist/
build/
.next/
coverage/

# Env & secrets
.env
.env.*
!.env.example
*.pem
*.key
.aws/

# Logs
*.log
npm-debug.log*
```

Note `.env.*` followed by `!.env.example` — the negation lets you commit a documented example without leaking the real values.

## Hooks: small things that save weeks

Husky + lint-staged on the client side, plus a server-side pre-receive hook in CI:

```json
// package.json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged

# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

Result: nobody on the team can commit with broken formatting or a malformed message. The conversation about it stops happening because the tooling stops it.

## My GitHub Actions baseline

Every Node service I deploy has this skeleton in `.github/workflows/`:

```yaml
# .github/workflows/ci.yml
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
```

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]

permissions:
  id-token: write          # for OIDC auth to AWS — no static keys
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy
          aws-region: ap-south-1
      - name: Build and push to ECR
        run: |
          aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 123.dkr.ecr.ap-south-1.amazonaws.com
          docker build -t myapp:${{ github.sha }} .
          docker tag myapp:${{ github.sha }} 123.dkr.ecr.ap-south-1.amazonaws.com/myapp:${{ github.sha }}
          docker push 123.dkr.ecr.ap-south-1.amazonaws.com/myapp:${{ github.sha }}
      - name: Force ECS service to redeploy
        run: |
          aws ecs update-service --cluster prod --service myapp --force-new-deployment
```

The two non-obvious things here:

1. **OIDC over static keys.** `aws-actions/configure-aws-credentials@v4` with `role-to-assume` lets GitHub authenticate to AWS via short-lived tokens. No `AWS_ACCESS_KEY_ID` in secrets to leak. Set up the trust policy in IAM once, never touch keys again.

2. **`--force-new-deployment` after pushing a `:latest` tag** is a common ECS pattern when you don't want to update the task definition every deploy. Cleaner approach: tag with the commit SHA, register a new task definition, and update the service to it — but the one-liner above is fine for smaller teams.

## Protect main like it pays your rent

GitHub branch protection rules I set on `main` for every production repo:

- Require pull request before merging
- Require at least 1 approval (2 if the team is large enough)
- Dismiss stale approvals when new commits are pushed
- Require status checks to pass: `ci / test`, `ci / lint`
- Require branches to be up to date
- Require linear history (enforces squash or rebase)
- Require signed commits
- Restrict who can push (only admins, in emergency)
- **Block force pushes**
- **Block deletions**

Set this up on day one of every repo. It's the difference between "we have a process" and "Steve pushed straight to main on Friday afternoon."

---

That's the working workflow. There's no certificate, no Git "level 5" — just the moves you do enough times to internalise, plus the recovery moves you wish you knew before you needed them.

*Need help wiring CI/CD properly across a fleet of services? I architect deployment pipelines for production AWS workloads — [start a project](/#contact).*
