import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDocument, readCollection, validateDate, jsonForHtml, renderTemplate } from './content.mjs';

test('Markdown preserves nested lists, fenced code, tables and escaped metadata', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-content-'));
  try {
    const file = path.join(directory, 'article.md');
    fs.writeFileSync(file, '---\ntitle: "Deploy & observe"\ndate: "2026-10-29"\ntags: [AWS, Helm]\n---\n\n- Deploy\n  - Observe\n\n```sh\necho "<ready>"\n```\n\n| Service | State |\n| --- | --- |\n| API | Ready |');
    const doc = readDocument(file, ['title', 'date']);
    assert.equal(doc.title, 'Deploy & observe');
    assert.match(doc.html, /<table>/);
    assert.match(doc.html, /&lt;ready&gt;/);
    assert.match(doc.html, /<li>Deploy[\s\S]*<ul>/);
    fs.writeFileSync(path.join(directory, 'draft.md'), '---\ntitle: Hidden\ndraft: true\n---\nDraft content');
    assert.deepEqual(readCollection(directory, ['title']).map(doc => doc.slug), ['article']);
    fs.writeFileSync(file, '---\ntitle: Missing date\n---\nContent');
    assert.throws(() => readDocument(file, ['title', 'date']), /missing date/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('date and metadata failures stop builds instead of silently inventing content', () => {
  for (const date of ['2026-02-30', 'tomorrow', new Date(), '2026-13-01']) assert.throws(() => validateDate(date, 'test'));
  assert.doesNotThrow(() => validateDate('2024-02-29', 'test'));
  assert(!jsonForHtml('</script>').includes('<'));
  assert.equal(renderTemplate('{{CONTENT}}', { CONTENT: '$& {{TITLE}}' }), '$& {{TITLE}}');
  assert.throws(() => renderTemplate('{{MISSING}}', {}), /Missing template value/);
});

test('experience advances at the calendar year boundary without changing content', async () => {
  const { experienceYears, refreshExperience } = await import('../assets/experience.mjs');
  assert.equal(experienceYears(2020, new Date(2026, 11, 31, 23, 59, 59)), 6);
  assert.equal(experienceYears(2020, new Date(2027, 0, 1, 0, 0, 0)), 7);
  assert.equal(experienceYears(2020, new Date(2020, 6, 1)), 0);
  assert.equal(experienceYears(2020, new Date(2019, 6, 1)), 0);
  for (const invalid of [2020.5, '2020', NaN, -1]) assert.throws(() => experienceYears(invalid));
  assert.throws(() => experienceYears(2020, new Date('invalid')));
  const counts = [{dataset:{careerStart:'2020'}},{dataset:{careerStart:'2020'}}];
  const footer = {};
  const page = {querySelectorAll:selector=>selector==='[data-career-start]' ? counts : [footer]};
  refreshExperience(page,new Date(2026,11,31));
  assert.deepEqual(counts.map(element=>element.textContent),['6+','6+']);
  refreshExperience(page,new Date(2027,0,1));
  assert.deepEqual(counts.map(element=>element.textContent),['7+','7+']);
  assert.equal(footer.textContent,'2027');
});

test('inquiries use the server endpoint and only accept confirmed delivery', async () => {
  const { sendInquiry } = await import('../assets/contact.mjs');
  const payload = { name: 'Test client', email: 'client@example.com', message: 'A project brief' };
  await sendInquiry('https://example.com/api/contact', payload, async (url, options) => {
    assert.equal(url, 'https://example.com/api/contact');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(options.headers['Content-Type'], 'application/json');
    return {ok:true,json:async()=>({ok:true})};
  });
  for (const response of [
    {ok:false,json:async()=>({error:'Email provider unavailable'})},
    {ok:true,json:async()=>({})},
    {ok:true,json:async()=>{throw new Error('Invalid response');}},
  ]) await assert.rejects(sendInquiry('https://example.com/api/contact', payload, async()=>response));
  await assert.rejects(sendInquiry('https://example.com/api/contact', payload, async()=>{throw new Error('Offline');}));
});
