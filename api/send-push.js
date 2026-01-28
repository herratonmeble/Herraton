// api/send-push.js
// Vercel Serverless Function do wysyłania powiadomień push przez Firebase Cloud Messaging v1 API

const { google } = require('googleapis');

// Service Account credentials (z Environment Variables w Vercel)
const getAccessToken = async () => {
  const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    token_uri: 'https://oauth2.googleapis.com/token',
  };

  const jwtClient = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );

  const tokens = await jwtClient.authorize();
  return tokens.access_token;
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tokens, title, body, data, icon } = req.body;

  if (!tokens || tokens.length === 0) {
    return res.status(400).json({ error: 'No tokens provided' });
  }

  // Sprawdź czy credentials są skonfigurowane
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
    console.error('Firebase credentials not configured');
    return res.status(500).json({ error: 'Server not configured for push notifications' });
  }

  try {
    const accessToken = await getAccessToken();
    const projectId = process.env.FIREBASE_PROJECT_ID;
    
    const results = [];
    const errors = [];

    // Wyślij do każdego tokenu
    for (const token of tokens) {
      try {
        const message = {
          message: {
            token: token,
            notification: {
              title: title || 'Herraton',
              body: body || 'Masz nowe powiadomienie'
            },
            webpush: {
              fcm_options: {
                link: data?.url || '/'
              },
              notification: {
                icon: icon || '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                vibrate: [200, 100, 200]
              }
            },
            data: {
              ...data,
              timestamp: new Date().toISOString()
            }
          }
        };

        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
          }
        );

        if (response.ok) {
          const result = await response.json();
          results.push({ token: token.substring(0, 20) + '...', success: true, messageId: result.name });
        } else {
          const errorData = await response.json();
          errors.push({ 
            token: token.substring(0, 20) + '...', 
            error: errorData.error?.message || 'Unknown error',
            code: errorData.error?.code
          });
        }
      } catch (error) {
        errors.push({ token: token.substring(0, 20) + '...', error: error.message });
      }
    }

    return res.status(200).json({
      success: errors.length === 0,
      sent: results.length,
      failed: errors.length,
      results,
      errors
    });
    
  } catch (error) {
    console.error('Error sending push:', error);
    return res.status(500).json({ error: error.message });
  }
}
