import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE_URL, escapeHtml } from './content.mjs';
const pages = ['index.html'];
function collect(directory) {
  for (const entry of fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collect(file);
    else if (entry.name.endsWith('.html')) pages.push(file);
  }
}
collect('blog'); collect('courses');
const urls = pages.sort().map(file => {
  const url = `${SITE_URL}/${file.replace(/(^|\/)index\.html$/, '$1')}`;
  return `  <url><loc>${escapeHtml(url)}</loc></url>`;
});
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
console.log(`✓ Built sitemap with ${pages.length} real pages`);
