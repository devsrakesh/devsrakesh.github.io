---
{
  "title": "Git & GitHub Best Practices",
  "date": "2026-06-10",
  "excerpt": "Repository setup, branching, code review, protected branches, and reproducible releases for engineering teams.",
  "category": "Engineering",
  "tags": [
    "Git",
    "GitHub",
    "CI/CD"
  ]
}
---

## 1) Repository setup

- Add a clear **README** with purpose, quick start, and links to docs.
- Include a **LICENSE** (MIT, Apache-2.0, or your organization’s standard).
- Maintain a **.gitignore** (use GitHub templates for your stack).
- Prefer a **single source of truth** for documentation: either `/docs` or the wiki, not both.

## 2) Branching strategy (keep it simple)

Pick one strategy and document it in the README.

- **Trunk-based:** Keep branches short-lived and merge reviewed changes into the main branch frequently.
- **GitFlow:** Use separate development and release branches when your release process needs that structure.

**Best practice:** Use short-lived branches named consistently:

- `feature/add-search`
- `fix/login-timeout`
- `chore/update-deps`

## 3) Commit hygiene

- Make commits **small and focused**: one logical change per commit.
- Write **meaningful messages**, such as `fix: handle login timeout` or `feat: add search filters`.
- Avoid committing generated files, secrets, or large binaries.

![Git and GitHub development workflow](https://images.unsplash.com/photo-1654277041218-84424c78f0ae?ixlib=rb-4.1.0&q=85&fm=jpg&crop=entropy&cs=srgb)

## 4) Pull requests that reviewers love

- Keep PRs **small** (ideally under a few hundred lines).
- Use a PR template with the problem, implementation, validation, and relevant screenshots.
- Ask for review once the change is complete, the diff has been checked, and required CI checks pass.

## 5) Code review norms

- Review the *code* and the *design intent*.
- Prefer suggestions and questions over commands.
- Look for correctness, readable code, useful tests, access controls, and clear error handling.

## 6) Protect `main`

In GitHub settings, enable branch protections:

- Require PRs before merge
- Require status checks (CI)
- Require review approvals (1–2)
- Dismiss stale approvals when new commits are pushed
- Restrict force pushes

## 7) CI/CD basics

- Run fast checks on every PR: formatting, linting, unit tests, and a build.
- Add integration and end-to-end checks where they cover important behavior.

**Best practice:** Keep builds reproducible with lockfiles and pinned tool versions.

## 8) Rebase vs merge (team consistency matters)

- Rebase a short-lived feature branch onto the main branch to keep its history linear.
- Use merge commits when preserving the branch history helps your team.

**Rule:** Whatever you choose, document it and apply it consistently.

## 9) Handling conflicts and history safely

- Resolve conflicts early by pulling frequently.
- Avoid rewriting published history on shared branches.
- If you must rewrite history (rare): coordinate, communicate, and use force-with-lease:

```bash
git push --force-with-lease
```

## 10) Tags, releases, and changelogs

- Use **semantic versioning** when applicable: `v1.2.3`.
- Create GitHub Releases with a summary, upgrade notes, and links to the relevant changes.
- Automate changelogs if possible (Conventional Commits helps).

## 11) Security best practices

- Never commit secrets. Use environment variables and secret managers.
- Enable secret scanning and dependency alerts where available.
- Use least-privilege access for collaborators and tokens.

## 12) Useful Git commands (quick reference)

```bash
# Update your branch safely
git fetch origin
git rebase origin/main

# Review merged branches before deleting individual local branches
git branch --merged
git branch -d feature/completed-work

# See what changed in a readable way
git diff --word-diff
```
