import { renderTemplate, readCollection, readDocument } from './content.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const COURSES_OUT_DIR = path.join(ROOT, 'courses');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function main() {
  const source = path.join(ROOT, 'content', 'courses');
  const courses = fs.readdirSync(source, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => {
      const metadata = readDocument(path.join(source, entry.name, 'index.md'), ['title', 'subtitle', 'description', 'level', 'duration']);
      const chapters = readCollection(path.join(source, entry.name, 'chapters'), ['title', 'excerpt', 'order'])
        .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
        .map(chapter => ({ ...chapter, content: chapter.html }));
      return { ...metadata, id: entry.name, chapters };
    }).filter(course => !course.draft);

  fs.mkdirSync(COURSES_OUT_DIR, { recursive: true });
  const activeCourses = new Set(courses.map(course => course.id));
  for (const entry of fs.readdirSync(COURSES_OUT_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && !activeCourses.has(entry.name)) fs.rmSync(path.join(COURSES_OUT_DIR, entry.name), { recursive: true });
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
    const courseIndexOut = renderTemplate(indexTemplate, {
      COURSE_ID: escapeHtml(course.id),
      COURSE_TITLE: escapeHtml(course.title),
      COURSE_SUBTITLE: escapeHtml(course.subtitle),
      COURSE_DESCRIPTION: escapeHtml(course.description),
      COURSE_CONTENT: course.html,
      COURSE_LEVEL: escapeHtml(course.level),
      COURSE_DURATION: escapeHtml(course.duration),
      COURSE_TAGS: tagsHtml,
      CHAPTERS_LIST: syllabusListHtml,
    });

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

      const chapterOut = renderTemplate(chapterTemplate, {
      COURSE_ID: escapeHtml(course.id),
      COURSE_TITLE: escapeHtml(course.title),
      CHAPTER_SLUG: escapeHtml(ch.slug),
      CHAPTER_NUMBER: String(idx + 1),
      CHAPTER_TITLE: escapeHtml(ch.title),
      CHAPTER_EXCERPT: escapeHtml(ch.excerpt),
      CHAPTER_CONTENT: ch.content,
      PREV_CHAPTER_LINK: prevLinkHtml,
      NEXT_CHAPTER_LINK: nextLinkHtml,
    });

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
