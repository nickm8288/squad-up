// Vercel serverless function to send email notifications when someone
// joins a squad.  This function expects a POST request with a JSON
// body containing `email`, `subject`, and `message` fields.  It
// sends an email via the Resend API using an API key stored in
// the `RESEND_API_KEY` environment variable.  See README for
// instructions on configuring this key.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const { email, subject, message } = req.body || {};
  if (!email) {
    res.status(400).json({ message: 'Missing email' });
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ message: 'RESEND_API_KEY is not configured' });
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Use Resend's default onboarding address until a custom domain is verified
        from: 'Squad Up <onboarding@resend.dev>',
        to: email,
        subject: subject || 'Squad Up notification',
        // Send the message as plain text; you can replace with `html` for HTML content
        text: message || '',
      }),
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to send email' });
  }
}