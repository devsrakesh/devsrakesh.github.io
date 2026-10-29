import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT, readDocument, readCollection, escapeHtml as e, jsonForHtml, renderTemplate } from './content.mjs';
import { experienceYears } from '../assets/experience.mjs';
const profile = readDocument(path.join(ROOT, 'content/profile.md'), ['name', 'role', 'company', 'headline', 'summary', 'description']);
const years = experienceYears(profile.careerStartYear);
const tags = list => list.map(tag => `<span class="tag">${e(tag)}</span>`).join('');
const projectLink = project => project.url ? `<a class="text-link" href="${e(project.url)}" target="_blank" rel="noopener noreferrer">Visit ${e(new URL(project.url).hostname)} <span aria-hidden="true">↗</span></a>` : '';
// Keep the complete library grouped by deployment platform; preserve source order within each group.
function deploymentPriority(project) {
  const technology = [...project.tags, project.category, project.description].join(' ');
  if (/\b(?:EKS|Kubernetes)\b/i.test(technology)) return 0;
  if (/\bECS\b/i.test(technology)) return 1;
  if (/\bEC2\b/i.test(technology)) return 2;
  return 3;
}
const portfolioProjects = [...profile.projects].sort((a,b) => deploymentPriority(a) - deploymentPriority(b));
const cards = portfolioProjects.map((project,index) => `<article class="project" data-project>
  <div class="project-number">${String(index+1).padStart(2,'0')} <span>${e(project.category)}</span></div>
  <h3>${e(project.name)}</h3><p>${e(project.description)}</p>
  <div class="project-tags">${tags(project.tags)}</div>${projectLink(project)}</article>`).join('\n');
const companyInitials = {
  'EZ Global Technologies Pvt Ltd': 'EZ', 'Good Old Delight': 'GO', 'iKey.in': 'iK',
  'Housing Cart': 'HC', 'CricStox': 'CS', 'HotWax Systems': 'HW', 'Digitalshakha': 'DS',
  'Technolitics': 'T', 'Vidwan Institute': 'VI',
};
const workedWith = profile.workedWith.map(company => `<li class="company-card"><span class="company-initials" aria-hidden="true">${e(companyInitials[company] || company.slice(0,2).toUpperCase())}</span><h3>${e(company)}</h3></li>`).join('\n');
const companyStylesVersion = createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'assets/companies.css'))).digest('hex').slice(0,12);
const posts = readCollection(path.join(ROOT,'content/blog'),['title','date','excerpt','category']).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
const writing = posts.map(post=>`<a class="writing-row" href="/blog/posts/${post.slug}.html"><div><span class="eyebrow">${e(post.category)} / ${e(post.date)}</span><h3>${e(post.title)}</h3><p>${e(post.excerpt)}</p></div><span class="round-arrow" aria-hidden="true">↗</span></a>`).join('\n');
const schema = {'@context':'https://schema.org','@type':'Person',name:profile.name,url:'https://devsrakesh.github.io/',image:`https://devsrakesh.github.io${profile.portrait}`,jobTitle:profile.role,description:profile.description,sameAs:[profile.linkedin,'https://github.com/devsrakesh'],knowsAbout:['Kubernetes','Helm','Argo CD','AWS','ECS','ELK','Cloudflare','GitHub Actions','MERN','React','Next.js','NestJS','TypeScript','MongoDB','PostgreSQL','Prometheus','Grafana','CloudWatch']};
const processStylesVersion = createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'assets/process.css'))).digest('hex').slice(0,12);
const template = fs.readFileSync(path.join(ROOT, 'scripts/templates/home.html'), 'utf8');
const output = renderTemplate(template, {
  PROJECT_COUNT:profile.projects.length, EXPERIENCE_YEARS:years, START_YEAR:profile.careerStartYear, CURRENT_YEAR:new Date().getUTCFullYear(),
  ROLE:e(profile.role), NAME:e(profile.name), SUMMARY:e(profile.summary), DESCRIPTION:e(profile.description), COMPANY:e(profile.company),
  ABOUT:profile.html, WORKED_WITH:workedWith, COMPANY_STYLES_VERSION:companyStylesVersion, PROCESS_STYLES_VERSION:processStylesVersion, PROJECTS:cards, WRITING:writing,
  LINKEDIN:e(profile.linkedin), PORTRAIT:e(profile.portrait), PERSON_SCHEMA:jsonForHtml(schema),
});
fs.writeFileSync(path.join(ROOT, 'index.html'), output);
console.log('✓ Built redesigned portfolio from Markdown');
