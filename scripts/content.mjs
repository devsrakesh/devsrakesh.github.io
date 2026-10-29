// Content is reviewed, trusted repository Markdown, never visitor-supplied input.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const SITE_URL = 'https://devsrakesh.github.io';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c');
export const renderTemplate = (template, values) => template.replace(/\{\{([A-Z_]+)\}\}/g, (token, key) => {
  if (!(key in values)) throw new Error(`Missing template value: ${key}`);
  return String(values[key]);
});
export function validateDate(date, label) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error(`${label}: dates must be quoted YYYY-MM-DD strings`);
  }
}
export function readDocument(file, required = []) {
  const { data, content } = matter(fs.readFileSync(file, 'utf8'));
  for (const key of required) {
    if (data[key] === undefined || data[key] === null || data[key] === '') throw new Error(`${file}: missing ${key}`);
    if (key !== 'order' && typeof data[key] !== 'string') throw new Error(`${file}: ${key} must be text`);
  }
  if (data.order !== undefined && (!Number.isInteger(data.order) || data.order < 1)) throw new Error(`${file}: order must be a positive integer`);
  if (data.draft !== undefined && typeof data.draft !== 'boolean') throw new Error(`${file}: draft must be true or false`);
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some(tag => typeof tag !== 'string'))) throw new Error(`${file}: tags must be a list of text`);
  if (data.date) validateDate(data.date, file);
  if (data.updated) { validateDate(data.updated, file); if (data.updated < data.date) throw new Error(`${file}: updated predates publication`); }
  return { ...data, tags: data.tags || [], content, html: marked.parse(content) };
}
export function readCollection(directory, required = []) {
  return fs.readdirSync(directory).filter(file => file.endsWith('.md')).sort().map(file => {
    const slug = path.basename(file, '.md');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid content slug: ${file}`);
    return { ...readDocument(path.join(directory, file), required), slug };
  }).filter(doc => !doc.draft);
}
