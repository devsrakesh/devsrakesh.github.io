// Build blog HTML from version-controlled Markdown: npm run build:blog

import { renderTemplate, readCollection, validateDate, jsonForHtml } from './content.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
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

// Compile published Markdown documents only; source files live in content/blog.
async function main() {
  const sourcePosts = readCollection(path.join(ROOT, 'content', 'blog'), ['title', 'date', 'excerpt', 'category']);
  const posts = [];
  for (const post of sourcePosts) validateDate(post.date, post.slug);
  const markdownPosts = sourcePosts.map(p => ({ ...p, contentHtml: p.html }));

  // Compile each Markdown post
  for (const p of markdownPosts) {
    const out = renderTemplate(postTemplate, {
      TITLE: escapeHtml(p.title),
      TITLE_JSON: jsonForHtml(p.title),
      EXCERPT: escapeHtml(p.excerpt),
      EXCERPT_JSON: jsonForHtml(p.excerpt),
      DATE: escapeHtml(p.date),
      MODIFIED: escapeHtml(p.updated || p.date),
      DATE_FORMATTED: escapeHtml(formatDate(p.date)),
      TAGS_INLINE: chips(p.tags),
      ARTICLE_TAGS_OG: articleTagsOg(p.tags),
      TAGS_JSON: jsonForHtml(p.tags.join(', ')),
      SLUG: p.slug,
      CONTENT: p.contentHtml,
    });

    fs.writeFileSync(path.join(POSTS_DIR, `${p.slug}.html`), out);
    posts.push({ slug: p.slug, title: p.title, excerpt: p.excerpt, date: p.date, category: p.category, tags: p.tags });
  }

  // Remove outputs for deleted or draft posts.
  const activeSlugs = new Set(posts.map(p => `${p.slug}.html`));
  for (const f of fs.readdirSync(POSTS_DIR)) {
    if (f.endsWith('.html') && !activeSlugs.has(f)) {
      console.log(`  • Cleaning orphan post file: ${f}`);
      fs.unlinkSync(path.join(POSTS_DIR, f));
    }
  }

  console.log(`✓ Built ${posts.length} Markdown posts.`);

  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Build category list (ordered by post count, ties broken alphabetically)
  const categoryCounts = Object.create(null);
  for (const p of posts) categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  const categoryList = Object.keys(categoryCounts).sort((a, b) => {
    const diff = categoryCounts[b] - categoryCounts[a];
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const categorySlug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const filterHtml = [
    `<button class="cat-chip is-active" data-category="all" type="button">All <span class="cat-count">${posts.length}</span></button>`,
    ...categoryList.map((c) => `<button class="cat-chip" data-category="${categorySlug(c)}" type="button">${escapeHtml(c)} <span class="cat-count">${categoryCounts[c]}</span></button>`),
  ].join('\n      ');

  const listHtml = posts.map((p) => `
      <article class="post-item" data-category="${categorySlug(p.category)}">
        <div class="post-date">${escapeHtml(formatDate(p.date))}</div>
        <div>
          <div class="post-category">${escapeHtml(p.category)}</div>
          <a class="post-title-link" href="posts/${p.slug}.html">${escapeHtml(p.title)}</a>
          <p class="post-excerpt">${escapeHtml(p.excerpt)}</p>
          ${p.tags.length ? `<div class="post-tags">${chips(p.tags)}</div>` : ''}
        </div>
      </article>`).join('\n');

  const indexOut = renderTemplate(indexTemplate, {
      CATEGORIES: filterHtml,
      POSTS: listHtml,
    });
  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexOut);

  console.log(`✓ Built blog/index.html`);
  for (const p of posts) console.log(`  • ${p.slug}.html  ${p.date}  ${p.title}`);
}

main().catch(err => {
  console.error('❌ Build crashed:', err);
  process.exit(1);
});
