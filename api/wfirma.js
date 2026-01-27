// API Proxy dla wFirma
// Ten plik obsługuje komunikację z API wFirma
// Klucze API są przechowywane w Vercel Environment Variables

export default async function handler(req, res) {
  // Tylko POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { action, data } = req.body;

    // Pobierz konfigurację ze zmiennych środowiskowych Vercel
    const accessKey = process.env.WFIRMA_ACCESS_KEY;
    const secretKey = process.env.WFIRMA_SECRET_KEY;
    const companyId = process.env.WFIRMA_COMPANY_ID;
    const apiUrl = 'https://api2.wfirma.pl';

    if (!accessKey || !secretKey || !companyId) {
      console.error('Brak zmiennych środowiskowych wFirma');
      return res.status(500).json({ 
        success: false, 
        error: 'Brak konfiguracji wFirma. Dodaj zmienne środowiskowe: WFIRMA_ACCESS_KEY, WFIRMA_SECRET_KEY, WFIRMA_COMPANY_ID' 
      });
    }

    // Podstawowa autoryzacja dla wFirma API
    const authString = Buffer.from(`${accessKey}:${secretKey}`).toString('base64');

    if (action === 'createInvoice') {
      // Tworzenie faktury
      const requestBody = {
        api: data
      };

      console.log('Wysyłam do wFirma:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${apiUrl}/${companyId}/invoices/add`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
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
      if (result.status && result.status.code === 'OK') {
        // Sukces
        const invoice = result.invoices?.invoice || {};
        return res.status(200).json({
          success: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.fullnumber || invoice.number,
          data: invoice
        });
      } else if (result.api?.invoices?.invoice) {
        // Alternatywna struktura sukcesu
        const invoice = result.api.invoices.invoice;
        return res.status(200).json({
          success: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.fullnumber || invoice.number,
          data: invoice
        });
      } else {
        // Błąd z wFirma
        const errorMsg = result.status?.message || result.error || JSON.stringify(result);
        console.error('Błąd wFirma:', result);
        return res.status(400).json({
          success: false,
          error: errorMsg,
          details: result
        });
      }

    } else if (action === 'getContractors') {
      // Pobieranie listy kontrahentów
      const response = await fetch(`${apiUrl}/${companyId}/contractors/find`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ api: {} })
      });

      const result = await response.json();
      return res.status(200).json(result);

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
