import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ROOT, readDocument, escapeHtml as e } from './content.mjs';
const profile=readDocument(path.join(ROOT,'content/profile.md'));
const image=fs.readFileSync(path.join(ROOT,profile.portrait));
const logo=fs.readFileSync(path.join(ROOT, "assets/logo.svg"), "utf8").replace("<svg ", '<svg x="60" y="35" ');
const source=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><clipPath id="portrait"><rect x="802" y="40" width="358" height="550" rx="14"/></clipPath></defs>
<rect width="1200" height="630" fill="#f6f5ef"/><rect x="760" width="440" height="630" fill="#153d32"/>
${logo}
<text x="60" y="170" fill="#58675e" font-family="Arial,sans-serif" font-size="13" letter-spacing="3">FULL-STACK DEVELOPMENT / DEVOPS</text>
<text x="55" y="270" fill="#173b31" font-family="Arial,sans-serif" font-size="82" letter-spacing="-4">${e(profile.name)}</text>
<text x="60" y="350" fill="#507345" font-family="Georgia,serif" font-size="48" font-style="italic">From code to cloud.</text>
<line x1="60" y1="405" x2="695" y2="405" stroke="#daddcf"/>
<text x="60" y="453" fill="#173b31" font-family="Arial,sans-serif" font-size="17">Kubernetes / AWS / Helm / Argo CD / GitHub Actions</text>
<text x="60" y="491" fill="#58675e" font-family="Arial,sans-serif" font-size="14">Web applications · AWS deployments · Monitoring</text>
<text x="60" y="570" fill="#58675e" font-family="Arial,sans-serif" font-size="12" letter-spacing="2">BUILDING SINCE ${profile.careerStartYear} · devsrakesh.github.io</text>
<image href="data:image/jpeg;base64,${image.toString('base64')}" x="802" y="40" width="358" height="550" preserveAspectRatio="xMidYMid slice" clip-path="url(#portrait)"/>
</svg>`;
const rendered=new Resvg(source,{font:{loadSystemFonts:true,defaultFontFamily:'Arial'}}).render();
if(rendered.width!==1200||rendered.height!==630)throw new Error('Social preview must be 1200 × 630');
fs.writeFileSync(path.join(ROOT,'og-image.svg'),source);
fs.writeFileSync(path.join(ROOT,'og-image.png'),rendered.asPng());
console.log('✓ Rendered portrait social preview');
