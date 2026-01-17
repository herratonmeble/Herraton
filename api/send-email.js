// api/send-email.js
// Vercel Serverless Function dla wysyłania emaili przez MailerSend
// Obsługuje załączniki (PDF, zdjęcia)

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Tylko metoda POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    toEmail, 
    toName, 
    subject, 
    textContent, 
    htmlContent,
    attachments // Array of { filename, content (base64), type }
  } = req.body;

  if (!toEmail || !subject || !textContent) {
    return res.status(400).json({ error: 'Missing required fields: toEmail, subject, textContent' });
  }

  const MAILERSEND_API_TOKEN = 'mlsn.ce3bf924d0ed92f4921bd786dde0c1b8e36fcd7beb983a9e2f91fd3cd5c56cd0';
  const SENDER_EMAIL = 'noreply@test-z0vklo6jm07l7qrx.mlsender.net';
  const SENDER_NAME = 'Herraton - Zamówienia';

  try {
    // Przygotuj payload
    const emailPayload = {
      from: {
        email: SENDER_EMAIL,
        name: SENDER_NAME
      },
      to: [{
        email: toEmail,
        name: toName || 'Klient'
      }],
      subject: subject,
      text: textContent,
      html: htmlContent || textContent.replace(/\n/g, '<br>')
    };

    // Dodaj załączniki jeśli są
    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments.map(att => ({
        filename: att.filename,
        content: att.content, // base64
        disposition: 'attachment'
      }));
    }

    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MAILERSEND_API_TOKEN}`
      },
      body: JSON.stringify(emailPayload)
    });

    if (response.ok || response.status === 202) {
      return res.status(200).json({ success: true, message: 'Email sent successfully' });
    } else {
      const error = await response.json();
      console.error('MailerSend error:', error);
      return res.status(response.status).json({ success: false, error });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
