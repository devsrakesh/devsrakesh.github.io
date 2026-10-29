# Rakesh Rajput — Portfolio

A static portfolio for a Senior DevOps Engineer at EZ Global Technologies Pvt Ltd working on the Ourshopee project, with a local Markdown blog and learning notes. Content builds require no API credentials or external content service.

## Develop and preview

Use Node.js 22 or newer and Python 3 for the preview server.

```sh
npm ci
npm test
npm run build
npm run preview
```

Open [the local preview](http://127.0.0.1:4173). `npm run build` generates the public HTML, checks internal links and SEO metadata, and packages only public assets into `dist/`.

## Update the portfolio

Edit `content/profile.md` for your title, summary, biography, full experience history, and all project entries. Ourshopee’s Kubernetes, delivery, and logging work is combined into one project. All projects share one searchable portfolio section. No employment start date or performance metrics were invented. Earlier experience and project descriptions are preserved in that Markdown file. The website displays only the `workedWith` company list, without employment dates or roles.

Run `npm run build` after changes. `index.html`, `blog/`, `courses/`, and `sitemap.xml` are generated files; edit their sources rather than their output. Portfolio layout lives in `scripts/templates/home.html` and the other page templates live beside it.

## Add or edit a blog post

Create `content/blog/my-post-slug.md`. Its filename becomes the existing-style public URL `/blog/posts/my-post-slug.html`. Use lower-case letters, numbers, and hyphens.

```markdown
---
title: "An article title"
date: "2026-10-29"
updated: "2026-10-29"
excerpt: "A concise description of what the reader will learn."
category: DevOps
tags: [AWS, Kubernetes]
draft: false
---

## Start here

Write the article using Markdown. Nested lists, fenced code blocks, links,
images, and tables are supported.
```

Quote dates and use `YYYY-MM-DD`. `updated` is optional and must not precede `date`. Draft posts are excluded from the blog and sitemap. Deleting a source or marking it as a draft removes its generated post on the next build. Every post gets a title, description, canonical URL, social metadata, and BlogPosting structured data.

The existing Git/GitHub post and Next.js chapter were migrated from their checked-in HTML because the original remote content was not available locally. The Git article's incomplete exported bullets were filled in. Existing URLs are preserved. Only repository collaborators should author content: raw HTML in Markdown is trusted and rendered as written.

## Maintain learning content

Each course uses this structure:

```text
content/courses/nextjs/
  index.md
  chapters/
    1-next-js-course-index.md
```

The course `index.md` front matter needs `title`, `subtitle`, `description`, `level`, `duration`, and optional `tags`/`draft`. Its Markdown body is rendered above the chapter list. Each chapter needs `title`, `excerpt`, and a positive integer `order`. Navigation follows `order`, with filename as the tie-breaker. Set `draft: true` to hide a course or chapter. Deleted or draft content is removed from generated output. Course and chapter folders under `courses/` are generator-owned.

The Next.js content is presented as learning notes and an outline, rather than a completed premium course.

## Checks and publishing

`npm test` verifies Markdown parsing, nested lists, tables, code escaping, draft filtering, metadata validation, and safe template interpolation. `npm run check` validates the built HTML's links, fragments, canonical URLs, descriptions, headings, sitemap coverage, and JSON-LD.

## Deploy to devsrakesh.github.io

Use the repository named **`devsrakesh.github.io`** in your `devsrakesh` account. The links, assets, canonical URLs, robots file, and sitemap target this root-level user site; no repository path prefix is needed.

1. Push these source files and `package-lock.json` to the repository’s `main` branch.
2. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. The **Build and deploy GitHub Pages** workflow runs tests, renders the Markdown and social preview, checks the output, and deploys only `dist/`.
4. After the deployment succeeds, visit [your portfolio](https://devsrakesh.github.io/).

Pull requests only run checks; they never deploy. Subsequent content changes deploy automatically when pushed to `main`. No Notion token, email API key, or custom deployment secret is required. `.nojekyll` is included in the artifact. You do not need to commit `dist/`; it is generated in Actions. The root-level generated HTML remains available for review.

This follows [GitHub’s custom Pages workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Deployment was prepared locally; no push or live deployment was performed in this chat.

The contact section uses a direct email link that opens the visitor’s email app. It makes no network request to an email API. Direct email and WhatsApp links also work on static hosting. The earlier `api/contact.js` is retained as optional legacy serverless source, excluded from `dist/`, and is no longer called by the site. Contact submission was not tested by sending a message.

`.env` is ignored, never read by the content builders, and never copied into `dist/`. Old Notion secrets are no longer needed. Do not commit credentials. The canonical origin remains `https://devsrakesh.github.io`; if you later change domains, update `scripts/content.mjs`, the templates, and `robots.txt`, then rebuild.

Markdown tooling: [Marked documentation](https://marked.js.org/using_advanced) and [gray-matter](https://github.com/jonschlinkert/gray-matter).

## Design and experience counter

The cream and forest-green visual system lives in `assets/site.css`; `assets/editorial.css` adapts the same system to writing and learning pages. Both desktop and mobile navigation work without hiding content behind JavaScript-only animations. All projects appear once in a single visible grid with optional client-side search. Earlier architecture notes are retained in `content/case-studies.md` as source material and are not displayed on the website.

`content/profile.md` defines `careerStartYear: 2020`. The build renders an initial experience count, and `assets/experience.mjs` updates it using the visitor’s current calendar year. It refreshes on load, when a tab becomes visible again, and hourly while open. With only a start year supplied, this is a year-based count labelled “since 2020”; it does not imply a verified month or day. Tests cover the year rollover. The public “Worked with” section does not display employment dates, roles, or employment types.

The edited portrait is `assets/rakesh-portrait.jpg`. It was prepared with the built-in image generation tool, then encoded as a web-sized JPEG. The original supplied photo is unchanged. The edit prompt and asset provenance are in `docs/portrait-edit.md`. `scripts/og-build.mjs` creates the sharing preview from the current profile and portrait, using the stable “building since 2020” caption.

The full portfolio is grouped by deployment platform: EKS/Kubernetes, ECS, EC2, then other projects. Order within each group follows the Markdown source. HappyFirst is recorded as an ECS deployment.

## Client-facing positioning

The homepage presents end-to-end full-stack development, AWS deployment and CI/CD, monitoring and logging, and production troubleshooting. The employer strip and dated timeline were replaced with a neutral “Worked with” company list, without role, current-employer, or employment-type labels. Application builds and container deployment projects share one portfolio grid, ordered by deployment platform. The project-brief email link asks clients for goals, stack, timeline, budget range, and time zone without adding a server dependency. It does not promise response times or around-the-clock support.

## Personal brand assets

The header and footer use `assets/logo.svg`: a custom RR monogram with a two-line Rakesh Rajput wordmark. `assets/brandmark.svg` is the standalone icon, also used for the favicon and portrait badge. The social preview reuses the same SVG logo. These are editable vector assets and remain sharp at different sizes.

The “Worked with” section uses a responsive company-card grid, generated from `workedWith` in `content/profile.md`. Initials are decorative identifiers, not official company logos. It does not display dates, roles, or employment types. Its dedicated `assets/companies.css` stylesheet is referenced with a content-based version query so CSS changes receive a new asset URL on the next build.

The delivery-process section uses four numbered cards: Scope, Build, Launch, and Handover. Its dedicated `assets/process.css` stylesheet is content-versioned in the generated homepage, like the company-card stylesheet.
