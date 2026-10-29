import { refreshExperience } from './experience.mjs';
document.documentElement.classList.add('js');
refreshExperience(document);
// Refresh after a suspended tab is restored and across a year boundary.
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshExperience(document); });
setInterval(() => refreshExperience(document), 60 * 60 * 1000);
const toggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#site-navigation');
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('is-open', open);
});
navigation?.addEventListener('click', event => {
  if (event.target.closest('a')) { toggle?.setAttribute('aria-expanded', 'false'); navigation.classList.remove('is-open'); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { toggle.setAttribute('aria-expanded', 'false'); navigation.classList.remove('is-open'); toggle.focus(); }
});
const search = document.querySelector('#project-search');
search?.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase();
  let count = 0;
  document.querySelectorAll('[data-project]').forEach(card => {
    card.hidden = !card.textContent.toLowerCase().includes(query);
    if (!card.hidden) count++;
  });
  document.querySelector('#project-status').textContent = `${count} ${count === 1 ? 'project' : 'projects'} found`;
});
