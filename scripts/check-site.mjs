import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, SITE_URL } from './content.mjs';
const pages = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'scripts', 'content', 'dist', '.github'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (entry.name.endsWith('.html')) pages.push(file);
  }
}
collect(ROOT);
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
assert.equal(new Set(urls).size, pages.length, 'Sitemap must contain each public page exactly once');
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  assert(!/\{\{[A-Z_]+\}\}/.test(html), `${file}: unresolved template`);
  assert(!/cs-placeholder|\bNotion\b/.test(html), `${file}: stale content`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file}: expected one h1`);
  assert(/<title>[^<]+<\/title>/.test(html), `${file}: missing title`);
  assert(/<meta name="description" content="[^"]+"/.test(html), `${file}: missing description`);
  const expected = `${SITE_URL}/${path.relative(ROOT, file).replace(/(^|\/)index\.html$/, '$1')}`;
  assert(html.includes(`<link rel="canonical" href="${expected}"`), `${file}: wrong canonical URL`);
  assert(urls.includes(expected), `${file}: missing from sitemap`);
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1].replace(/&amp;/g, '&');
    if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) continue;
    const url = new URL(href, expected);
    let target = path.join(ROOT, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) target = path.join(target, 'index.html');
    assert(fs.existsSync(target), `${file}: broken local link ${href}`);
    if (url.hash && target.endsWith('.html')) {
      const fragment = decodeURIComponent(url.hash.slice(1));
      const targetHtml = fs.readFileSync(target, 'utf8');
      assert(targetHtml.includes(`id="${fragment}"`), `${file}: missing fragment ${href}`);
    }
  }
}
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert(home.includes('Senior DevOps Engineer') && home.includes('EZ Global Technologies Pvt Ltd') && home.includes('Ourshopee') && home.includes('cashincashout.me'));
assert(!home.includes('dcc.godaddy.com'), 'Public portfolio must link to the project domain');
console.log(`✓ Checked ${pages.length} pages: local links, metadata, sitemap, structured data, and profile`);
