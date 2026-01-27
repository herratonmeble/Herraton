// API Proxy dla wFirma
// Ten plik obsługuje komunikację z API wFirma
// Klucze API są przechowywane w Vercel Environment Variables

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Tylko POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, data } = req.body;

    // Pobierz konfigurację ze zmiennych środowiskowych Vercel
    const accessKey = process.env.WFIRMA_ACCESS_KEY;
    const secretKey = process.env.WFIRMA_SECRET_KEY;
    const companyId = process.env.WFIRMA_COMPANY_ID;
    const apiUrl = 'https://api2.wfirma.pl';

    if (!accessKey || !secretKey || !companyId) {
      console.error('Brak zmiennych środowiskowych wFirma:', { 
        hasAccessKey: !!accessKey, 
        hasSecretKey: !!secretKey, 
        hasCompanyId: !!companyId 
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Brak konfiguracji wFirma. Sprawdź zmienne środowiskowe w Vercel: WFIRMA_ACCESS_KEY, WFIRMA_SECRET_KEY, WFIRMA_COMPANY_ID' 
      });
    }

    // Podstawowa autoryzacja dla wFirma API
    const authString = Buffer.from(`${accessKey}:${secretKey}`).toString('base64');

    if (action === 'createInvoice') {
      const invoiceData = data.invoice;
      
      // Przygotuj dane faktury w formacie wFirma API
      const invoiceBody = {
        api: {
          invoices: {
            invoice: {
              contractor: {
                name: invoiceData.contractor.name || 'Klient',
                altname: invoiceData.contractor.altname || invoiceData.contractor.name || '',
                street: invoiceData.contractor.street || '',
                city: invoiceData.contractor.city || '',
                zip: invoiceData.contractor.zip || '',
                country: invoiceData.contractor.country || 'PL',
                email: invoiceData.contractor.email || '',
                phone: invoiceData.contractor.phone || '',
                tax_id_type: 'none'
              },
              type: 'normal',
              date: invoiceData.date,
              paymentdate: invoiceData.paymentdate,
              paymentmethod: invoiceData.paymentmethod || 'transfer',
              description: invoiceData.description || '',
              invoicecontents: invoiceData.invoicecontents
            }
          }
        }
      };

      console.log('Wysyłam do wFirma:', JSON.stringify(invoiceBody, null, 2));

      const response = await fetch(`${apiUrl}/${companyId}/invoices/add`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(invoiceBody)
      });

      const responseText = await response.text();
      console.log('Odpowiedź wFirma:', responseText);
      
      // Spróbuj sparsować JSON
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error('Błąd parsowania odpowiedzi wFirma:', responseText);
        return res.status(500).json({ 
          success: false, 
          error: 'Błąd parsowania odpowiedzi z wFirma',
          details: responseText.substring(0, 500)
        });
      }

      // Sprawdź czy sukces
      if (result.status?.code === 'OK' || result.invoices?.invoice?.id) {
        const invoice = result.invoices?.invoice || {};
        return res.status(200).json({
          success: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.fullnumber || invoice.number,
          data: invoice
        });
      } else {
        // Błąd z wFirma
        const errorMsg = result.status?.message || result.errors?.error?.message || JSON.stringify(result.status || result);
        console.error('Błąd wFirma:', result);
        return res.status(400).json({
          success: false,
          error: errorMsg,
          details: result
        });
      }

    } else {
      return res.status(400).json({ success: false, error: 'Nieznana akcja' });
    }

  } catch (error) {
    console.error('Błąd API wFirma:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Błąd serwera'
    });
  }
}
