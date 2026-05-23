---
title: "Commit Like a Pro: The Habits That Make Your Git History Worth Reading"
date: 2026-04-18
excerpt: "Conventional Commits, atomic changes, and the 50/72 rule — the commit discipline I enforce across NestJS and Next.js services so 'git blame' actually helps the next person debug."
tags: [git, commits, code-quality, conventional-commits, workflow]
---

A year from now you'll be reading `git blame` at 2 am, trying to figure out why a line of code exists. The commit message is the only context you have. If it says `"fix"`, you lose. If it says `"fix(auth): reject expired refresh tokens — handles the OAuth provider returning HTTP 200 with expired flag instead of 401"`, you win.

This is the commit discipline I enforce across every project I lead — what the rules are, why they exist, and how I make tooling enforce them so nobody has to remember.

## The two rules under everything

1. **One commit = one logical change.** If the message needs the word "and," you've got two commits crammed into one.
2. **Write for the person reading `git blame` in two years.** That person is usually you, and you'll have forgotten everything.

If you internalise these, the rest is mechanics.

## Conventional Commits in 60 seconds

[Conventional Commits](https://www.conventionalcommits.org/) is the format I use on every repo:

```
<type>(<scope>): <subject>

<body>

<footer>
```

The types that matter:

| Type | When to use |
|---|---|
| `feat` | A user-visible new feature |
| `fix` | A user-visible bug fix |
| `refactor` | Code change that's neither a feature nor a fix (no behavior change) |
| `perf` | A performance improvement |
| `test` | Adding or fixing tests |
| `docs` | Documentation only |
| `chore` | Tooling, build config, deps, etc. |
| `ci` | CI pipeline changes |
| `style` | Formatting only (no logic) |
| `build` | Build system changes (Webpack, Docker, etc.) |
| `revert` | Reverting a previous commit |

`BREAKING CHANGE:` in the body marks a major-version bump for semantic-release tooling. Use it sparingly and intentionally.

## Real examples from production

Bad → good, all from refactors I've actually shipped.

**Bad:**
```
fix stuff
```
**Good:**
```
fix(notifications): retry FCM sends on 503 instead of bubbling the error

The Firebase Cloud Messaging gateway occasionally returns 503 under load.
Previously we treated that as a hard failure and dropped the notification.
Now we retry up to 3 times with exponential backoff (250ms, 500ms, 1s)
and only surface the error if all retries fail.

Closes #142
```

**Bad:**
```
update stuff
```
**Good:**
```
refactor(auth): extract JWT verification into AuthGuard

Move the duplicate verifyAccessToken() logic out of three controllers
and into a single NestJS guard. No behaviour change — verified by
existing integration tests and a manual run against staging.
```

**Bad:**
```
WIP
```
**Good:**
Squash it before merging. WIP commits should never reach `main`.

## The 50/72 rule

- **Subject line: max 50 characters**, imperative mood ("add" not "added"), no trailing period.
- **Blank line between subject and body.**
- **Body: wrap at 72 characters**, explain *why* (not what — the diff shows what).

The 50/72 numbers aren't arbitrary — they're what fits cleanly in `git log --oneline` and GitHub's PR UI without truncation. Once you've trained yourself, it's automatic.

## Subject line — imperative mood

The trick: complete the sentence "If applied, this commit will ___."

✅ "add WhatsApp opt-in flow" — *If applied, this commit will add WhatsApp opt-in flow.* Reads correctly.
❌ "added WhatsApp opt-in flow" — reads wrong in completion.
❌ "Adding WhatsApp opt-in flow" — also reads wrong.
❌ "WhatsApp opt-in" — too terse, not a verb.

Git's own commit messages use the imperative. So do the Linux kernel's. It's not bikeshedding — it's the consistent grammar for "this is a change."

## Atomic commits — the "git bisect" test

Atomic = each commit is a self-contained, independently-revertable, independently-cherry-pickable change.

The test: could you cleanly revert this commit alone and have the codebase still build and tests still pass? If no, it's not atomic.

Why it matters: when production breaks and you need to `git bisect` to find the offending commit, atomic commits give you fast, useful bisects. Mega-commits give you "the bug is somewhere in 2,400 lines."

**Example of un-atomic:** "add feature X and refactor Y and fix typo in Z" → split into 3 commits.

**Example of atomic but trivially split unnecessarily:** "add type for User" + "add type for Order" + "add type for Product" — fine to combine if they're a single logical concept ("add user/order/product types for the new admin panel").

The judgment call: would a reviewer want to see these together or separately? Optimise for the reviewer.

## Body content — explain WHY

The diff already shows *what changed*. The commit body is for *why it changed*. Things to put there:

- The problem you were solving (link an issue if applicable)
- Why you chose this approach over an alternative
- Any side effects reviewers should know about
- Migration steps if data schema changes
- Performance numbers if it's a perf commit
- Links to relevant docs or discussion

Things NOT to put:

- A rewording of the diff
- Marketing fluff ("This awesome new feature...")
- The phrase "various changes" (just no)
- Multiple unrelated changes (split the commit)

## Squash, merge, or rebase?

My defaults:

- **Squash-merge PRs into `main`** — `main` becomes one commit per feature. Easy to revert, easy to read, easy to cherry-pick to release branches.
- **Rebase your feature branch onto main** to stay current — keeps history linear.
- **Merge commits** — only when you're integrating two long-lived branches (e.g. `release/v2` into `main`).

The fights over this are mostly cultural. Pick a default for your team and write it down so it doesn't get re-argued every quarter.

## Enforce it with tools, not pleading

Humans forget. Tools don't.

**commitlint** + **husky** in every repo:

```bash
npm i -D @commitlint/cli @commitlint/config-conventional husky
npx husky init
```

```json
// commitlint.config.cjs
module.exports = { extends: ['@commitlint/config-conventional'] };
```

```bash
# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

Now a commit like `"fix stuff"` is rejected at commit time. The team doesn't have to remember the rules — the tool enforces them.

**CI check** (so it works even for contributors without husky):

```yaml
# .github/workflows/commitlint.yml
name: commitlint
on: [pull_request]
jobs:
  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: wagoid/commitlint-github-action@v6
```

## The PR title is a commit title

When you squash-merge, GitHub uses the PR title as the squashed commit message. Treat PR titles like commit subjects — same 50-char limit, same imperative mood, same Conventional Commits format.

I've watched teams enforce commit conventions on every commit, then merge PRs titled `"PR for feature stuff"`. Pointless. The squash-merge commit *is* the only commit `main` sees — that's the one that has to be clean.

## What I do with `--amend`

`git commit --amend --no-edit` is for two things:

1. Adding a file you forgot to stage to your most recent commit.
2. Fixing a typo in your most recent commit's message.

Never amend a commit that's been pushed to a shared branch — you'll force-push someone else's work into the void. Only amend on your own un-pushed work.

For older commits, use `git rebase -i HEAD~5` and `reword` (edit message) or `edit` (change content). Interactive rebase is the cleanup tool.

## The semantic-release loop

Once Conventional Commits is enforced, you can wire `semantic-release` to:

- Bump version automatically (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major)
- Generate a CHANGELOG from commit messages
- Tag the release
- Publish to npm / push a Docker tag

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Free release notes forever. Worth the setup cost.

## What I don't bother enforcing

- **Capitalisation of subject line.** Lowercase is fine; mine usually is.
- **Bullet points vs. paragraphs in the body.** Whatever's clearer.
- **Co-authored-by trailers.** Nice when relevant, not worth a hook.

Pick fights worth winning. The format rules above are; the bikeshed-able preferences aren't.

---

That's it. Convention + tooling = consistent history. Six months from now, when you're hunting why a regression slipped into prod, you'll thank yourself for the discipline.

*Building a team's engineering practices from the ground up? I do this kind of process work alongside production delivery — [start a project](/#contact).*
