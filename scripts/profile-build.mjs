import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readDocument, readCollection, escapeHtml as e, jsonForHtml, renderTemplate } from './content.mjs';
import { experienceYears } from '../assets/experience.mjs';
const profile = readDocument(path.join(ROOT, 'content/profile.md'), ['name', 'role', 'company', 'headline', 'summary', 'description']);
const years = experienceYears(profile.careerStartYear);
const tags = list => list.map(tag => `<span class="tag">${e(tag)}</span>`).join('');
const projectLink = project => project.url ? `<a class="text-link" href="${e(project.url)}" target="_blank" rel="noopener noreferrer">Visit ${e(new URL(project.url).hostname)} <span aria-hidden="true">↗</span></a>` : '';
const visuals = [
  '<div class="architecture" aria-label="Ourshopee deployment tooling"><span>Helm</span><b aria-hidden="true">→</b><span>Argo CD</span><b aria-hidden="true">→</b><span>Kubernetes</span></div><div class="diagram-caption">DEPLOYMENT OPERATIONS / OURSHOPEE</div>',
  '<div class="ecs-mark" aria-hidden="true"><i></i><i></i><i></i></div><div class="diagram-caption">CONTAINERS / AWS ECS</div>',
  '<div class="log-lines" aria-hidden="true"><span><i></i>build · deliver · observe</span><span><i></i>GitHub Actions / ELK</span><span><i></i>application logs / troubleshooting</span></div>',
];
const featured = profile.projects.slice(0,3).map((project,index) => `<article class="featured-project feature-${index}">
  <div class="project-visual">${visuals[index]}</div>
  <div class="feature-content"><div class="eyebrow">0${index+1} / ${e(project.category)}</div>
  <h3>${e(project.name)}</h3><p>${e(project.description)}</p><div class="project-tags">${tags(project.tags)}</div>${projectLink(project)}</div>
</article>`).join('\n');
const cards = profile.projects.map((project,index) => `<article class="project" data-project>
  <div class="project-number">${String(index+1).padStart(2,'0')} <span>${e(project.category)}</span></div>
  <h3>${e(project.name)}</h3><p>${e(project.description)}</p>
  <div class="project-tags">${tags(project.tags)}</div>${projectLink(project)}</article>`).join('\n');
const experience = profile.experience.map((item,index) => `<article class="timeline-item${index===0?' current':''}">
  <div class="timeline-date">${e(item.period)}</div><div class="timeline-content">
  <p class="timeline-company">${e(item.company)}${index===0?'<span class="current-badge">Current</span>':''}</p><h3>${e(item.role)}</h3>
  <p>${e(item.description)}</p><div class="timeline-stack">${e(item.stack.join(' / '))}</div></div></article>`).join('\n');
const posts = readCollection(path.join(ROOT,'content/blog'),['title','date','excerpt','category']).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
const writing = posts.map(post=>`<a class="writing-row" href="/blog/posts/${post.slug}.html"><div><span class="eyebrow">${e(post.category)} / ${e(post.date)}</span><h3>${e(post.title)}</h3><p>${e(post.excerpt)}</p></div><span class="round-arrow" aria-hidden="true">↗</span></a>`).join('\n');
const schema = {'@context':'https://schema.org','@type':'Person',name:profile.name,url:'https://devsrakesh.github.io/',image:`https://devsrakesh.github.io${profile.portrait}`,jobTitle:profile.role,description:profile.description,worksFor:{'@type':'Organization',name:profile.company},sameAs:[profile.linkedin,'https://github.com/devsrakesh'],knowsAbout:['Kubernetes','Helm','Argo CD','AWS','ECS','ELK','Cloudflare','GitHub Actions','MERN']};
const template = fs.readFileSync(path.join(ROOT, 'scripts/templates/home.html'), 'utf8');
const output = renderTemplate(template, {
  PROJECT_COUNT:profile.projects.length, EXPERIENCE_YEARS:years, START_YEAR:profile.careerStartYear, CURRENT_YEAR:new Date().getUTCFullYear(),
  ROLE:e(profile.role), NAME:e(profile.name), SUMMARY:e(profile.summary), DESCRIPTION:e(profile.description), COMPANY:e(profile.company),
  CASE_STUDIES:readDocument(path.join(ROOT, "content/case-studies.md")).html, ABOUT:profile.html, CURRENT_EXPERIENCE:experience, PROJECTS:cards, FEATURED_PROJECTS:featured, WRITING:writing,
  LINKEDIN:e(profile.linkedin), PORTRAIT:e(profile.portrait), PERSON_SCHEMA:jsonForHtml(schema),
});
fs.writeFileSync(path.join(ROOT, 'index.html'), output);
console.log('✓ Built redesigned portfolio from Markdown');
