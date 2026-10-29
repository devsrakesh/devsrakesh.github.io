import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './content.mjs';
for (const script of ['og-build', 'profile-build', 'blog-build', 'course-build', 'seo-build', 'check-site']) {
  execFileSync(process.execPath, [path.join(ROOT, `scripts/${script}.mjs`)], { cwd: ROOT, stdio: 'inherit' });
}
const output = path.join(ROOT, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
// Explicit public allowlist keeps source, API code, dependencies, and secrets out of static hosting.
for (const file of ['assets', 'index.html', 'blog', 'courses', 'og-image.png', 'og-image.svg', 'robots.txt', 'sitemap.xml']) {
  fs.cpSync(path.join(ROOT, file), path.join(output, file), { recursive: true });
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('✓ Static site ready in dist/');
