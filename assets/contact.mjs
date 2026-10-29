// The existing serverless endpoint keeps the email provider key off GitHub Pages.
export async function sendInquiry(endpoint, payload, request = fetch) {
  const response = await request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error('Inquiry was not confirmed');
}

export function setupInquiry(form, status, request = fetch) {
  const button = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    const payload = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value).trim()]));
    if (!payload.name || !payload.email || !payload.message) {
      status.dataset.state = 'error';
      status.textContent = 'Please enter your name, email, and project details.';
      status.focus();
      return;
    }
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.dataset.state = 'sending';
    status.textContent = 'Sending your inquiry…';
    try {
      await sendInquiry(form.action, payload, request);
      form.reset();
      status.dataset.state = 'success';
      status.textContent = 'Your inquiry has been sent. Thank you for sharing your project.';
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'Your inquiry could not be sent. Your details are still here — please try again or use the email or WhatsApp link.';
    } finally {
      button.disabled = false;
      form.removeAttribute('aria-busy');
      status.focus();
    }
  });
}
if (typeof document !== 'undefined') {
  const form = document.querySelector('#contact-form');
  if (form) setupInquiry(form, document.querySelector('#form-status'));
}
