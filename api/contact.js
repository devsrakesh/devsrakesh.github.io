// Serverless endpoint for sending contact form via Brevo
// Deploy this on Vercel/Netlify (Vercel: place file under /api/contact.js).
// Set the environment variable BREVO_API_KEY to your Brevo API key in the deployment settings.

export default async function handler(req, res) {
  // Basic CORS handling so this endpoint can be called from other origins (e.g., GitHub Pages)
  const CORS_ORIGIN = '*'; // change to your site's origin in production for tighter security
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, company, type, budget, timeline, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ error: 'Missing required fields' });

    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) return res.status(500).json({ error: 'Server not configured with Brevo API key' });

    const subject = `Project inquiry — ${type || 'General'} from ${name}`;
    const htmlContent = `
      <h3>${subject}</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      ${company ? `<p><strong>Company:</strong> ${company}</p>` : ''}
      <p><strong>Project Type:</strong> ${type}</p>
      <p><strong>Budget:</strong> ${budget}</p>
      <p><strong>Timeline:</strong> ${timeline}</p>
      <hr/>
      <h4>Message</h4>
      <p>${(message || '').replace(/\n/g, '<br/>')}</p>
    `;

    const payload = {
      // Use your verified sender address so Brevo accepts the message.
      sender: { name: 'Startupfreak', email: 'startupfreak01@gmail.com' },
      to: [{ email: 'trsrajput1@gmail.com' }],
      subject,
      htmlContent,
      replyTo: { email, name }
    };

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      return res.status(resp.status).json(data || { error: 'Brevo error' });
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error('Contact API error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
