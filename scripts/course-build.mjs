import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const COURSES_OUT_DIR = path.join(ROOT, 'courses');

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

// ----------------- MOCK COURSE DATA -----------------
const MOCK_COURSES = [
  {
    id: 'nextjs',
    title: 'Production Next.js & AWS EKS Masterclass',
    subtitle: 'Learn to build server-side applications and deploy them at scale on AWS Kubernetes with Terraform.',
    description: 'A comprehensive guide to building real-world enterprise applications with Next.js 15, containerizing them with multi-stage Dockerfiles, and deploying them securely onto AWS EKS clusters with SSL and load balancers.',
    level: 'Intermediate to Advanced',
    duration: '8 Hours',
    tags: ['Next.js', 'AWS', 'Docker', 'Kubernetes'],
    chapters: [
      {
        slug: '1-introduction-to-nextjs-app-router',
        title: 'Introduction to Next.js & App Router Architecture',
        excerpt: 'Understand React Server Components, the philosophy of server-first rendering, and setting up routing in Next.js.',
        content: `
<h2>The Shift to Server-First Rendering</h2>
<p>Modern web development has moved towards server-side rendering (SSR) to improve SEO, reduce bundle size, and accelerate initial page loads. Next.js is at the forefront of this shift, introducing the React Server Components (RSC) architecture as a core feature of the App Router.</p>

<h3>React Server Components (RSC) vs. Client Components</h3>
<p>In Next.js, components inside the <code>app</code> directory are Server Components by default. This means they are executed on the server, and their rendering output is sent to the client as clean HTML. Client components, marked with the <code>"use client"</code> directive, are downloaded and hydrated in the browser, enabling interactivity.</p>

<blockquote>
  Server Components allow you to fetch data directly in the component, keep database credentials secure, and reduce the JavaScript sent to the client. Use Client Components only when you need state (useState), effects (useEffect), or browser-only APIs.
</blockquote>

<h3>Routing Layouts and Folders</h3>
<p>Next.js uses a file-system based router. Folders define the URL segments, and special files define the UI behavior:</p>
<ul>
  <li><code>page.js</code>: Represents the unique content of a route.</li>
  <li><code>layout.js</code>: Represents a shared UI template across multiple sub-pages (e.g., sidebar or header).</li>
  <li><code>loading.js</code>: Displays a fallback loading indicator using React Suspense.</li>
  <li><code>error.js</code>: Catches runtime exceptions and shows a fallback error UI.</li>
</ul>

<p>Here is an example layout file:</p>
<pre><code class="language-javascript">export default function DashboardLayout({ children }) {
  return (
    &lt;section class="dashboard"&gt;
      &lt;nav class="dashboard-side-nav"&gt;
        &lt;a href="/dashboard"&gt;Overview&lt;/a&gt;
        &lt;a href="/dashboard/settings"&gt;Settings&lt;/a&gt;
      &lt;/nav&gt;
      &lt;main class="dashboard-content"&gt;
        {children}
      &lt;/main&gt;
    &lt;/section&gt;
  );
}</code></pre>
`
      },
      {
        slug: '2-advanced-data-fetching-caching',
        title: 'Advanced Data Fetching & Caching Strategies',
        excerpt: 'Master Next.js fetch cache, server action patterns, and route-level revalidation.',
        content: `
<h2>Data Fetching in Next.js</h2>
<p>Fetching data in the App Router is built on top of the native <code>fetch</code> API, extended with caching, revalidation, and data-sharing features.</p>

<h3>The Four Next.js Caches</h3>
<p>To write high-performance applications, you must master the caching lifecycle in Next.js:</p>
<ol>
  <li><strong>Request Memoization</strong>: Prevents duplicate GET requests within a single render pass. If you fetch the same URL in two different components, Next.js executes the request only once.</li>
  <li><strong>Data Cache</strong>: Persists fetched data across user requests and deployments. You can control this using the <code>revalidate</code> option or the <code>cache: 'force-cache'</code> flag.</li>
  <li><strong>Full Route Cache</strong>: Automatically stores the rendered HTML and server component payload for static routes on the server during the build.</li>
  <li><strong>Router Cache</strong>: Stores the rendered pages in the browser's memory, allowing instant transitions on the client side.</li>
</ol>

<p>For example, to fetch data with tag-based revalidation, you can use:</p>
<pre><code class="language-javascript">async function getProfile() {
  const res = await fetch('https://api.example.com/user/profile', {
    next: { tags: ['user-profile'] }
  });
  return res.json();
}</code></pre>

<h3>Server Actions</h3>
<p>Server Actions are asynchronous functions executed directly on the server, triggered from forms or client actions without manual API routes. They automatically handle POST requests behind the scenes.</p>
<pre><code class="language-javascript">// app/actions.js
'use server'

import { revalidateTag } from 'next/cache';

export async function updateProfile(formData) {
  const name = formData.get('name');
  await db.updateUser({ name });
  revalidateTag('user-profile');
}</code></pre>
`
      },
      {
        slug: '3-containerization-docker',
        title: 'Containerizing Next.js for Production',
        excerpt: 'Write a highly-optimized, multi-stage Dockerfile designed for production deployments.',
        content: `
<h2>Production-Ready Containerization</h2>
<p>Containerizing Next.js requires optimizing image sizes to reduce cold start times and bandwidth usage in orchestrators like Kubernetes. We accomplish this using Docker multi-stage builds and the Next.js standalone output feature.</p>

<h3>Optimizing Next.js Standalone Build</h3>
<p>To enable the standalone build, update your <code>next.config.js</code> file:</p>
<pre><code class="language-javascript">module.exports = {
  output: 'standalone',
}</code></pre>
<p>This tells Next.js to package only the files needed for running the application, excluding development dependencies, reducing the bundle size from 500MB+ to under 80MB.</p>

<h3>Multi-Stage Dockerfile</h3>
<p>Here is an optimized Dockerfile for containerizing Next.js:</p>
<pre><code class="language-dockerfile"># 1. Install dependencies only when needed
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# 2. Rebuild the source code only when needed
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. Production runner
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]</code></pre>
`
      },
      {
        slug: '4-deployment-aws-eks',
        title: 'Deploying Next.js to AWS EKS (Kubernetes)',
        excerpt: 'Create Kubernetes deployment, service, ingress manifests and host Next.js on AWS EKS.',
        content: `
<h2>Deploying to AWS Elastic Kubernetes Service</h2>
<p>Now that your Next.js application is containerized, we will deploy it to an AWS EKS cluster. The deployment architecture leverages an Application Load Balancer (ALB), Route 53 domain mapping, and ACM for SSL certificates.</p>

<h3>AWS ECR (Elastic Container Registry)</h3>
<p>First, authenticate and push your Docker image to AWS ECR:</p>
<pre><code class="language-bash">aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker build -t nextjs-app .
docker tag nextjs-app:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/nextjs-app:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/nextjs-app:latest</code></pre>

<h3>Kubernetes Deployment Manifest</h3>
<p>Save the following as <code>deployment.yaml</code> to orchestrate your pods:</p>
<pre><code class="language-yaml">apiVersion: apps/v1
kind: Deployment
metadata:
  name: nextjs-deployment
  labels:
    app: nextjs-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nextjs-app
  template:
    metadata:
      labels:
        app: nextjs-app
    spec:
      containers:
      - name: nextjs-container
        image: 123456789.dkr.ecr.us-east-1.amazonaws.com/nextjs-app:latest
        ports:
        - containerPort: 3000
        resources:
          limits:
            cpu: "500m"
            memory: "512Mi"
          requests:
            cpu: "250m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 15
          periodSeconds: 20
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: nextjs-service
spec:
  type: ClusterIP
  selector:
    app: nextjs-app
  ports:
  - port: 80
    targetPort: 3000</code></pre>
`
      }
    ]
  }
];

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
      const caption = renderRichText(block.image.caption) || 'Course image';
      html.push(`<img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" />`);
    }
  }

  if (inList === 'ul') html.push('</ul>');
  if (inList === 'ol') html.push('</ol>');

  return html.join('\n');
}

async function fetchFromNotion(apiKey, pageId) {
  console.log('📡 Notion key detected. Attempting to fetch content from Notion API...');
  const { Client } = await import('@notionhq/client');
  const notion = new Client({ auth: apiKey });

  // 1. Get the parent page details to use as course details
  const page = await notion.pages.retrieve({ page_id: pageId });
  const title = page.properties.title?.title[0]?.plain_text || 'Sync Course from Notion';

  // 2. Fetch children of this page to find child page blocks (chapters)
  const children = await notion.blocks.children.list({ block_id: pageId });
  const childPages = children.results.filter(block => block.type === 'child_page');

  if (childPages.length === 0) {
    throw new Error('No child pages (chapters) found inside the Notion course page.');
  }

  const chapters = [];
  let index = 1;

  for (const childPage of childPages) {
    const childId = childPage.id;
    const childTitle = childPage.child_page.title;
    const slug = `${index}-${childTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

    console.log('  • Fetching Chapter ' + index + ': "' + childTitle + '"...');

    // Fetch blocks for the child page
    const blockList = await notion.blocks.children.list({ block_id: childId });
    const contentHtml = notionBlocksToHtml(blockList.results);
    
    // Create simple excerpt from the first few text nodes
    let excerpt = 'Learn about ' + childTitle + ' in this comprehensive chapter.';
    const firstParagraph = blockList.results.find(b => b.type === 'paragraph');
    if (firstParagraph && firstParagraph.paragraph.rich_text.length > 0) {
      excerpt = firstParagraph.paragraph.rich_text.map(t => t.plain_text).join('').slice(0, 140) + '...';
    }

    chapters.push({
      slug,
      title: childTitle,
      excerpt,
      content: contentHtml
    });
    index++;
  }

  return [
    {
      id: 'nextjs',
      title,
      subtitle: 'Dynamic Course synchronized directly from Notion.',
      description: 'Automatically built and parsed from the provided Notion parent page blocks.',
      level: 'General',
      duration: `${chapters.length * 2} Hours`,
      tags: ['Notion Sync', 'Cloud', 'Engineering'],
      chapters
    }
  ];
}

// ----------------- MAIN BUILD LOOP -----------------
async function main() {
  const notionKey = process.env.NOTION_API_KEY;
  const notionPageId = process.env.NOTION_COURSE_PAGE_ID;

  let courses = MOCK_COURSES;

  if (notionKey && notionPageId) {
    try {
      courses = await fetchFromNotion(notionKey, notionPageId);
      console.log('✓ Successfully synchronized course from Notion API!');
    } catch (err) {
      console.error('⚠️ Notion API sync failed. Error details:', err.message);
      console.log('⚡ Falling back to local high-fidelity Mock Course data.');
    }
  } else {
    console.log('ℹ️ Notion environment variables not set. Using local Mock Course.');
  }

  // Load Templates
  const catalogTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'courses-catalog.html'), 'utf8');
  const indexTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'course-index.html'), 'utf8');
  const chapterTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'course-chapter.html'), 'utf8');

  // Ensure directories exist
  if (!fs.existsSync(COURSES_OUT_DIR)) {
    fs.mkdirSync(COURSES_OUT_DIR, { recursive: true });
  }

  const coursesListHtml = [];

  for (const course of courses) {
    const courseDir = path.join(COURSES_OUT_DIR, course.id);
    const chaptersDir = path.join(courseDir, 'chapters');

    if (!fs.existsSync(chaptersDir)) {
      fs.mkdirSync(chaptersDir, { recursive: true });
    }

    // Prepare tags metadata
    const tagsHtml = course.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const badgesHtml = `
      <span class="course-badge">${escapeHtml(course.level)}</span>
      <span class="course-badge">${escapeHtml(course.duration)}</span>
    `;

    // Catalog item entry
    coursesListHtml.push(`
      <article class="course-card">
        <div class="course-card-meta">
          ${badgesHtml}
        </div>
        <h2 class="course-card-title">
          <a href="/courses/${course.id}/">${escapeHtml(course.title)}</a>
        </h2>
        <p class="course-card-desc">${escapeHtml(course.subtitle)}</p>
        <div class="course-card-tags">
          ${tagsHtml}
        </div>
        <a href="/courses/${course.id}/" class="course-card-btn">Explore Syllabus &rarr;</a>
      </article>
    `);

    // Compile Syllabus Chapters list
    const syllabusListHtml = course.chapters.map((ch, idx) => `
      <div class="chapter-item">
        <div class="chapter-item-number">0${idx + 1}</div>
        <div>
          <h3 class="chapter-item-title">
            <a href="/courses/${course.id}/chapters/${ch.slug}.html">${escapeHtml(ch.title)}</a>
          </h3>
          <p class="chapter-item-excerpt">${escapeHtml(ch.excerpt)}</p>
          <a href="/courses/${course.id}/chapters/${ch.slug}.html" class="chapter-item-btn">Start Reading &rarr;</a>
        </div>
      </div>
    `).join('\n');

    // Write Course Syllabus Index File
    const courseIndexOut = indexTemplate
      .replace(/\{\{COURSE_ID\}\}/g, escapeHtml(course.id))
      .replace(/\{\{COURSE_TITLE\}\}/g, escapeHtml(course.title))
      .replace(/\{\{COURSE_SUBTITLE\}\}/g, escapeHtml(course.subtitle))
      .replace(/\{\{COURSE_DESCRIPTION\}\}/g, escapeHtml(course.description))
      .replace(/\{\{COURSE_LEVEL\}\}/g, escapeHtml(course.level))
      .replace(/\{\{COURSE_DURATION\}\}/g, escapeHtml(course.duration))
      .replace(/\{\{COURSE_TAGS\}\}/g, tagsHtml)
      .replace(/\{\{CHAPTERS_LIST\}\}/g, syllabusListHtml);

    fs.writeFileSync(path.join(courseDir, 'index.html'), courseIndexOut);
    console.log(`✓ Built syllabus index: courses/${course.id}/index.html`);

    // Clean orphan HTML files in the chapters directory (e.g. from previous runs or fallback builds)
    if (fs.existsSync(chaptersDir)) {
      const activeSlugs = new Set(course.chapters.map(ch => `${ch.slug}.html`));
      for (const f of fs.readdirSync(chaptersDir)) {
        if (f.endsWith('.html') && !activeSlugs.has(f)) {
          console.log(`  • Cleaning orphan chapter file: ${f}`);
          fs.unlinkSync(path.join(chaptersDir, f));
        }
      }
    }

    // Write each chapter page
    for (let idx = 0; idx < course.chapters.length; idx++) {
      const ch = course.chapters[idx];

      const prevChapter = course.chapters[idx - 1];
      const nextChapter = course.chapters[idx + 1];

      const prevLinkHtml = prevChapter ? `
        <a href="/courses/${course.id}/chapters/${prevChapter.slug}.html" class="chapter-nav-btn prev-btn">
          <span class="chapter-nav-label">&larr; Previous</span>
          <span class="chapter-nav-title">${escapeHtml(prevChapter.title)}</span>
        </a>
      ` : '';

      const nextLinkHtml = nextChapter ? `
        <a href="/courses/${course.id}/chapters/${nextChapter.slug}.html" class="chapter-nav-btn next-btn">
          <span class="chapter-nav-label">Next &rarr;</span>
          <span class="chapter-nav-title">${escapeHtml(nextChapter.title)}</span>
        </a>
      ` : '';

      const chapterOut = chapterTemplate
        .replace(/\{\{COURSE_ID\}\}/g, escapeHtml(course.id))
        .replace(/\{\{COURSE_TITLE\}\}/g, escapeHtml(course.title))
        .replace(/\{\{CHAPTER_SLUG\}\}/g, escapeHtml(ch.slug))
        .replace(/\{\{CHAPTER_NUMBER\}\}/g, String(idx + 1))
        .replace(/\{\{CHAPTER_TITLE\}\}/g, escapeHtml(ch.title))
        .replace(/\{\{CHAPTER_EXCERPT\}\}/g, escapeHtml(ch.excerpt))
        .replace(/\{\{CHAPTER_CONTENT\}\}/g, ch.content)
        .replace(/\{\{PREV_CHAPTER_LINK\}\}/g, prevLinkHtml)
        .replace(/\{\{NEXT_CHAPTER_LINK\}\}/g, nextLinkHtml);

      fs.writeFileSync(path.join(chaptersDir, `${ch.slug}.html`), chapterOut);
      console.log(`  • Built chapter: courses/${course.id}/chapters/${ch.slug}.html`);
    }
  }

  // Write catalog index file
  const catalogOut = catalogTemplate.replace(/\{\{COURSES_LIST\}\}/g, coursesListHtml.join('\n'));
  fs.writeFileSync(path.join(COURSES_OUT_DIR, 'index.html'), catalogOut);
  console.log(`✓ Built courses list catalog: courses/index.html`);
}

main().catch(err => {
  console.error('❌ Build crashed:', err);
  process.exit(1);
});
