// API Proxy dla wFirma
// Ten plik obsługuje komunikację z API wFirma

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
    const { action, data, config } = req.body;

    if (!config || !config.accessKey || !config.secretKey || !config.companyId) {
      return res.status(400).json({ success: false, error: 'Brak konfiguracji wFirma' });
    }

    const { accessKey, secretKey, companyId, apiUrl } = config;

    // Podstawowa autoryzacja dla wFirma API
    const authString = Buffer.from(`${accessKey}:${secretKey}`).toString('base64');

    if (action === 'createInvoice') {
      // Tworzenie faktury
      const response = await fetch(`${apiUrl}/${companyId}/invoices/add`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const responseText = await response.text();
      
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
        const invoice = result.invoices?.invoice || result.api?.invoices?.invoice;
        return res.status(200).json({
          success: true,
          invoiceId: invoice?.id,
          invoiceNumber: invoice?.fullnumber || invoice?.number,
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
        const errorMsg = result.status?.message || result.error || 'Nieznany błąd wFirma';
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
