// API Proxy dla QuickBooks
// Klucze API są przechowywane w Vercel Environment Variables

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

  try {
    const { action, data } = req.body;

    const clientId = process.env.QUICKBOOKS_CLIENT_ID;
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
    const realmId = process.env.QUICKBOOKS_REALM_ID;
    const refreshToken = process.env.QUICKBOOKS_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !realmId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Brak konfiguracji QuickBooks. Sprawdź zmienne środowiskowe.' 
      });
    }

    // QuickBooks używa OAuth2 - potrzebujemy access token
    // Najpierw odśwież token
    const baseUrl = 'https://quickbooks.api.intuit.com'; // Production
    // const baseUrl = 'https://sandbox-quickbooks.api.intuit.com'; // Sandbox

    // Funkcja do odświeżania tokenu
    const getAccessToken = async () => {
      if (!refreshToken) {
        return null;
      }

      const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}`
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.access_token) {
        // TODO: Zapisz nowy refresh_token jeśli się zmienił
        return tokenData.access_token;
      }
      
      return null;
    };

    if (action === 'createInvoice') {
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Brak autoryzacji QuickBooks. Wymagana ponowna autoryzacja OAuth2.',
          needsAuth: true
        });
      }

      const invoiceData = data.invoice;

      // Najpierw sprawdź/utwórz klienta
      let customerId = null;

      // Szukaj klienta po emailu lub nazwie
      const customerQuery = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${invoiceData.customer.name.replace(/'/g, "\\'")}'`);
      
      const searchResponse = await fetch(
        `${baseUrl}/v3/company/${realmId}/query?query=${customerQuery}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      const searchResult = await searchResponse.json();
      
      if (searchResult.QueryResponse?.Customer?.[0]) {
        customerId = searchResult.QueryResponse.Customer[0].Id;
      } else {
        // Utwórz nowego klienta
        const customerBody = {
          DisplayName: invoiceData.customer.name,
          PrimaryEmailAddr: invoiceData.customer.email ? { Address: invoiceData.customer.email } : undefined,
          PrimaryPhone: invoiceData.customer.phone ? { FreeFormNumber: invoiceData.customer.phone } : undefined,
          BillAddr: {
            Line1: invoiceData.customer.street || '',
            City: invoiceData.customer.city || '',
            PostalCode: invoiceData.customer.zip || '',
            Country: invoiceData.customer.country || 'PL'
          }
        };

        const createCustomerResponse = await fetch(
          `${baseUrl}/v3/company/${realmId}/customer`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(customerBody)
          }
        );

        const customerResult = await createCustomerResponse.json();
        
        if (customerResult.Customer?.Id) {
          customerId = customerResult.Customer.Id;
        } else {
          console.error('Błąd tworzenia klienta:', customerResult);
          return res.status(400).json({
            success: false,
            error: 'Nie udało się utworzyć klienta w QuickBooks',
            details: customerResult
          });
        }
      }

      // Utwórz fakturę
      const qbInvoice = {
        CustomerRef: {
          value: customerId
        },
        Line: invoiceData.items.map((item, idx) => ({
          DetailType: 'SalesItemLineDetail',
          Amount: item.amount,
          Description: item.name,
          SalesItemLineDetail: {
            Qty: item.quantity || 1,
            UnitPrice: item.price,
            TaxCodeRef: {
              value: 'TAX' // lub 'NON' dla bez VAT
            }
          }
        })),
        TxnDate: invoiceData.date,
        DueDate: invoiceData.dueDate,
        PrivateNote: invoiceData.description || '',
        CurrencyRef: {
          value: invoiceData.currency || 'PLN'
        },
        Deposit: invoiceData.alreadyPaid || 0
      };

      console.log('Tworzę fakturę QuickBooks:', JSON.stringify(qbInvoice, null, 2));

      const invoiceResponse = await fetch(
        `${baseUrl}/v3/company/${realmId}/invoice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(qbInvoice)
        }
      );

      const invoiceResult = await invoiceResponse.json();

      if (invoiceResult.Invoice?.Id) {
        return res.status(200).json({
          success: true,
          invoiceId: invoiceResult.Invoice.Id,
          invoiceNumber: invoiceResult.Invoice.DocNumber,
          data: invoiceResult.Invoice
        });
      } else {
        console.error('Błąd tworzenia faktury:', invoiceResult);
        return res.status(400).json({
          success: false,
          error: invoiceResult.Fault?.Error?.[0]?.Message || 'Błąd tworzenia faktury',
          details: invoiceResult
        });
      }

    } else if (action === 'getAuthUrl') {
      // Generuj URL do autoryzacji OAuth2
      const redirectUri = encodeURIComponent(data.redirectUri || `${req.headers.origin}/api/quickbooks-callback`);
      const scope = encodeURIComponent('com.intuit.quickbooks.accounting');
      const state = Math.random().toString(36).substring(7);
      
      const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
      
      return res.status(200).json({
        success: true,
        authUrl: authUrl
      });

    } else {
      return res.status(400).json({ success: false, error: 'Nieznana akcja' });
    }

  } catch (error) {
    console.error('Błąd API QuickBooks:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Błąd serwera'
    });
  }
}
