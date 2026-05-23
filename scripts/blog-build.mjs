// Build script for the Markdown blog.
//
// Run:  npm install && npm run build:blog
//
// Reads blog/posts/*.md → writes blog/posts/*.html + blog/index.html
// Each .md file is expected to start with frontmatter:
//
// ---
// title: My post title
// date: 2026-05-23
// excerpt: A short one-line summary used in the listing and meta description.
// tags: [git, github, workflow]
// ---
//
// Markdown body follows.
//
// To delete a post, delete its .md — the corresponding .html is cleaned up automatically.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'blog', 'posts');
const BLOG_DIR = path.join(ROOT, 'blog');
const TEMPLATE_DIR = path.join(__dirname, 'templates');

if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

const postTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'post.html'), 'utf8');
const indexTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf8');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    meta[key] = val;
  }
  return { meta, body: match[2] };
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function chips(tags, cls = 'tag') {
  if (!tags || !tags.length) return '';
  return tags.map((t) => `<span class="${cls}">${escapeHtml(t)}</span>`).join('');
}

function articleTagsOg(tags) {
  if (!tags || !tags.length) return '';
  return tags.map((t) => `<meta property="article:tag" content="${escapeHtml(t)}" />`).join('\n');
}

// Clean orphan HTML (when a .md is deleted)
for (const f of fs.readdirSync(POSTS_DIR)) {
  if (f.endsWith('.html')) {
    const slug = f.replace(/\.html$/, '');
    if (!fs.existsSync(path.join(POSTS_DIR, `${slug}.md`))) {
      fs.unlinkSync(path.join(POSTS_DIR, f));
    }
  }
}

const mdFiles = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
const posts = [];

for (const file of mdFiles) {
  const slug = file.replace(/\.md$/, '');
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const title = meta.title || slug;
  const excerpt = meta.excerpt || '';
  const date = meta.date || '';
  const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [];

  const html = marked.parse(body);

  const out = postTemplate
    .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
    .replace(/\{\{TITLE_JSON\}\}/g, JSON.stringify(title))
    .replace(/\{\{EXCERPT\}\}/g, escapeHtml(excerpt))
    .replace(/\{\{EXCERPT_JSON\}\}/g, JSON.stringify(excerpt))
    .replace(/\{\{DATE\}\}/g, escapeHtml(date))
    .replace(/\{\{DATE_FORMATTED\}\}/g, escapeHtml(formatDate(date)))
    .replace(/\{\{TAGS_INLINE\}\}/g, chips(tags))
    .replace(/\{\{ARTICLE_TAGS_OG\}\}/g, articleTagsOg(tags))
    .replace(/\{\{TAGS_JSON\}\}/g, JSON.stringify(tags.join(', ')))
    .replace(/\{\{SLUG\}\}/g, slug)
    .replace(/\{\{CONTENT\}\}/g, html);

  fs.writeFileSync(path.join(POSTS_DIR, `${slug}.html`), out);
  posts.push({ slug, title, excerpt, date, tags });
}

posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const listHtml = posts.map((p) => `
      <article class="post-item">
        <div class="post-date">${escapeHtml(formatDate(p.date))}</div>
        <div>
          <a class="post-title-link" href="posts/${p.slug}.html">${escapeHtml(p.title)}</a>
          <p class="post-excerpt">${escapeHtml(p.excerpt)}</p>
          ${p.tags.length ? `<div class="post-tags">${chips(p.tags)}</div>` : ''}
        </div>
      </article>`).join('\n');

const indexOut = indexTemplate.replace(/\{\{POSTS\}\}/g, listHtml);
fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexOut);

console.log(`✓ Built ${posts.length} post${posts.length === 1 ? '' : 's'} + blog/index.html`);
for (const p of posts) console.log(`  • ${p.slug}.html  ${p.date}  ${p.title}`);
