// Build script for the Notion-based blog.
//
// Run:  npm run build:blog
//
// Fetches blog posts from Notion API → writes blog/posts/*.html + blog/index.html
//
// To delete a post: delete/unpublish the child page in Notion — the corresponding .html is cleaned up automatically.

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

// Load environment variables manually
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnv();

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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

// ----------------- NOTION API PARSING -----------------
function renderRichText(richText) {
  if (!richText || !richText.length) return '';
  return richText.map(t => {
    let text = escapeHtml(t.plain_text);
    if (t.annotations.bold) text = `<strong>${text}</strong>`;
    if (t.annotations.italic) text = `<em>${text}</em>`;
    if (t.annotations.strikethrough) text = `<del>${text}</del>`;
    if (t.annotations.underline) text = `<u>${text}</u>`;
    if (t.annotations.code) text = `<code>${text}</code>`;
    if (t.href) text = `<a href="${escapeHtml(t.href)}" target="_blank">${text}</a>`;
    return text;
  }).join('');
}

function notionBlocksToHtml(blocks) {
  let html = [];
  let inList = null;

  for (const block of blocks) {
    const type = block.type;
    
    if (inList === 'ul' && type !== 'bulleted_list_item') {
      html.push('</ul>');
      inList = null;
    } else if (inList === 'ol' && type !== 'numbered_list_item') {
      html.push('</ol>');
      inList = null;
    }

    if (type === 'paragraph') {
      html.push(`<p>${renderRichText(block.paragraph.rich_text)}</p>`);
    } else if (type === 'heading_1') {
      html.push(`<h2>${renderRichText(block.heading_1.rich_text)}</h2>`);
    } else if (type === 'heading_2') {
      html.push(`<h2>${renderRichText(block.heading_2.rich_text)}</h2>`);
    } else if (type === 'heading_3') {
      html.push(`<h3>${renderRichText(block.heading_3.rich_text)}</h3>`);
    } else if (type === 'bulleted_list_item') {
      if (!inList) {
        html.push('<ul>');
        inList = 'ul';
      }
      html.push(`<li>${renderRichText(block.bulleted_list_item.rich_text)}</li>`);
    } else if (type === 'numbered_list_item') {
      if (!inList) {
        html.push('<ol>');
        inList = 'ol';
      }
      html.push(`<li>${renderRichText(block.numbered_list_item.rich_text)}</li>`);
    } else if (type === 'code') {
      const codeText = block.code.rich_text.map(t => t.plain_text).join('');
      const lang = block.code.language || '';
      html.push(`<pre><code class="language-${lang}">${escapeHtml(codeText)}</code></pre>`);
    } else if (type === 'quote') {
      html.push(`<blockquote>${renderRichText(block.quote.rich_text)}</blockquote>`);
    } else if (type === 'divider') {
      html.push('<hr />');
    } else if (type === 'image') {
      const url = block.image.type === 'external' ? block.image.external.url : block.image.file.url;
      const caption = renderRichText(block.image.caption) || 'Blog image';
      html.push(`<img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" />`);
    }
  }

  if (inList === 'ul') html.push('</ul>');
  if (inList === 'ol') html.push('</ol>');

  return html.join('\n');
}

function extractNotionMetadata(blocks) {
  let meta = {
    category: 'Uncategorised',
    tags: [],
    excerpt: ''
  };

  if (blocks.length === 0) return { meta, bodyBlocks: blocks };

  const firstBlock = blocks[0];
  let metaText = '';
  let metadataIndex = -1;

  if (firstBlock.type === 'code') {
    metaText = firstBlock.code.rich_text.map(t => t.plain_text).join('');
    metadataIndex = 0;
  } else if (firstBlock.type === 'paragraph') {
    const text = firstBlock.paragraph.rich_text.map(t => t.plain_text).join('');
    if (text.startsWith('---') || text.includes('category:') || text.includes('tags:')) {
      metaText = text;
      metadataIndex = 0;
    }
  }

  if (metaText) {
    const lines = metaText.split('\n');
    let hasKeys = false;
    for (const line of lines) {
      const trimmed = line.trim().replace(/^---|---$/g, '');
      if (!trimmed) continue;
      const colon = trimmed.indexOf(':');
      if (colon === -1) continue;
      const key = trimmed.slice(0, colon).trim().toLowerCase();
      let val = trimmed.slice(colon + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key === 'category') {
        meta.category = val;
        hasKeys = true;
      } else if (key === 'tags') {
        if (val.startsWith('[') && val.endsWith(']')) {
          meta.tags = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        } else {
          meta.tags = val.split(',').map(s => s.trim()).filter(Boolean);
        }
        hasKeys = true;
      } else if (key === 'excerpt') {
        meta.excerpt = val;
        hasKeys = true;
      }
    }

    if (hasKeys && metadataIndex !== -1) {
      return { meta, bodyBlocks: blocks.slice(metadataIndex + 1) };
    }
  }

  // Fallback excerpt from the first paragraph block
  const firstP = blocks.find(b => b.type === 'paragraph');
  if (firstP && firstP.paragraph.rich_text.length > 0) {
    meta.excerpt = firstP.paragraph.rich_text.map(t => t.plain_text).join('').slice(0, 140) + '...';
  }

  return { meta, bodyBlocks: blocks };
}

async function fetchBlogFromNotion(apiKey, pageId) {
  console.log('📡 Fetching blog posts from Notion API...');
  const { Client } = await import('@notionhq/client');
  const notion = new Client({ auth: apiKey });

  const children = await notion.blocks.children.list({ block_id: pageId });
  const childPages = children.results.filter(block => block.type === 'child_page');

  if (childPages.length === 0) {
    throw new Error('No child pages (posts) found inside the Notion blog page.');
  }

  const posts = [];

  for (const childPage of childPages) {
    const childId = childPage.id;
    const childTitle = childPage.child_page.title;
    
    // Retrieve page to get created_time
    const page = await notion.pages.retrieve({ page_id: childId });
    const date = page.created_time.split('T')[0]; // Format: YYYY-MM-DD
    const slug = childTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    console.log(`  • Fetching Post: "${childTitle}" (${date})...`);

    const blockList = await notion.blocks.children.list({ block_id: childId });
    const { meta, bodyBlocks } = extractNotionMetadata(blockList.results);
    const contentHtml = notionBlocksToHtml(bodyBlocks);

    posts.push({
      slug,
      title: childTitle,
      date,
      category: meta.category,
      tags: meta.tags,
      excerpt: meta.excerpt,
      contentHtml
    });
  }

  return posts;
}

// ----------------- MAIN BUILD LOOP -----------------
async function main() {
  const notionKey = process.env.NOTION_API_KEY;
  const notionBlogPageId = process.env.NOTION_BLOG_PAGE_ID;

  if (!notionKey || !notionBlogPageId) {
    console.error('❌ Error: Notion environment variables NOTION_API_KEY or NOTION_BLOG_PAGE_ID are not set.');
    console.error('   Please configure them in your .env file or GitHub Secrets.');
    process.exit(1);
  }

  const posts = [];
  const notionPosts = await fetchBlogFromNotion(notionKey, notionBlogPageId);

  // Compile each post HTML from Notion
  for (const p of notionPosts) {
    const out = postTemplate
      .replace(/\{\{TITLE\}\}/g, escapeHtml(p.title))
      .replace(/\{\{TITLE_JSON\}\}/g, JSON.stringify(p.title))
      .replace(/\{\{EXCERPT\}\}/g, escapeHtml(p.excerpt))
      .replace(/\{\{EXCERPT_JSON\}\}/g, JSON.stringify(p.excerpt))
      .replace(/\{\{DATE\}\}/g, escapeHtml(p.date))
      .replace(/\{\{DATE_FORMATTED\}\}/g, escapeHtml(formatDate(p.date)))
      .replace(/\{\{TAGS_INLINE\}\}/g, chips(p.tags))
      .replace(/\{\{ARTICLE_TAGS_OG\}\}/g, articleTagsOg(p.tags))
      .replace(/\{\{TAGS_JSON\}\}/g, JSON.stringify(p.tags.join(', ')))
      .replace(/\{\{SLUG\}\}/g, p.slug)
      .replace(/\{\{CONTENT\}\}/g, p.contentHtml);

    fs.writeFileSync(path.join(POSTS_DIR, `${p.slug}.html`), out);
    posts.push({ slug: p.slug, title: p.title, excerpt: p.excerpt, date: p.date, category: p.category, tags: p.tags });
  }

  // Clean orphan HTML files in the posts directory for Notion sync
  const activeSlugs = new Set(posts.map(p => `${p.slug}.html`));
  for (const f of fs.readdirSync(POSTS_DIR)) {
    if (f.endsWith('.html') && !activeSlugs.has(f)) {
      console.log(`  • Cleaning orphan post file: ${f}`);
      fs.unlinkSync(path.join(POSTS_DIR, f));
    }
  }

  console.log(`✓ Synchronized and built ${posts.length} posts from Notion API.`);

  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Build category list (ordered by post count, ties broken alphabetically)
  const categoryCounts = {};
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

  const indexOut = indexTemplate
    .replace(/\{\{CATEGORIES\}\}/g, filterHtml)
    .replace(/\{\{POSTS\}\}/g, listHtml);
  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexOut);

  console.log(`✓ Built blog/index.html`);
  for (const p of posts) console.log(`  • ${p.slug}.html  ${p.date}  ${p.title}`);
}

main().catch(err => {
  console.error('❌ Build crashed:', err);
  process.exit(1);
});
