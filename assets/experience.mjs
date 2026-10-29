// The start month is unknown: use a clearly labelled calendar-year count.
export function experienceYears(startYear, now = new Date()) {
  if (!Number.isInteger(startYear) || startYear < 1900 || startYear > 9999) throw new Error('Career start year must be a four-digit year');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('A valid current date is required');
  return Math.max(0, now.getFullYear() - startYear);
}
export function refreshExperience(document, now = new Date()) {
  for (const element of document.querySelectorAll('[data-career-start]')) {
    element.textContent = `${experienceYears(Number(element.dataset.careerStart), now)}+`;
  }
  for (const element of document.querySelectorAll('[data-current-year]')) element.textContent = String(now.getFullYear());
}
