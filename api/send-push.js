// api/send-push.js
// Vercel Serverless Function do wysyłania powiadomień push przez Firebase Cloud Messaging v1 API

const crypto = require('crypto');

// Generowanie JWT tokenu dla Service Account
function createJWT(clientEmail, privateKey) {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signatureInput = `${base64Header}.${base64Payload}`;
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');
  
  return `${signatureInput}.${signature}`;
}

// Pobierz access token z Google OAuth
async function getAccessToken(clientEmail, privateKey) {
  const jwt = createJWT(clientEmail, privateKey);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

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
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Firebase credentials not configured');
    return res.status(500).json({ error: 'Server not configured for push notifications' });
  }

  try {
    const accessToken = await getAccessToken(clientEmail, privateKey);
    
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
                badge: '/icons/icon-192.png'
              }
            },
            data: data ? Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)])
            ) : {}
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
