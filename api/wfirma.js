// API Proxy dla wFirma
// Zgodne z formatem API wFirma używanym w module PrestaShop
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
    const appKey = 'a049b58f106cf0c177b32615739db965'; // Stały klucz aplikacji z modułu

    if (!accessKey || !secretKey || !companyId) {
      console.error('Brak zmiennych środowiskowych wFirma');
      return res.status(400).json({ 
        success: false, 
        error: 'Brak konfiguracji wFirma. Sprawdź zmienne środowiskowe.' 
      });
    }

    const baseUrl = 'https://api2.wfirma.pl';
    const extParams = `?inputFormat=json&outputFormat=json&company_id=${companyId}`;

    if (action === 'createInvoice') {
      const invoiceData = data.invoice;
      
      // Przygotuj dane faktury w formacie wFirma (zgodnie z modułem PrestaShop)
      const invoiceBody = {
        invoices: [{
          invoice: {
            contractor: {
              name: invoiceData.contractor.name || 'Klient',
              street: invoiceData.contractor.street || '',
              zip: invoiceData.contractor.zip || '',
              city: invoiceData.contractor.city || '',
              country: invoiceData.contractor.country || 'PL',
              email: invoiceData.contractor.email || '',
              phone: invoiceData.contractor.phone || '',
              tax_id_type: 'none'
            },
            type: 'normal',
            date: invoiceData.date,
            paymentdate: invoiceData.paymentdate,
            disposaldate: invoiceData.date, // data sprzedaży = data wystawienia
            paymentmethod: invoiceData.paymentmethod || 'transfer',
            price_type: 'brutto', // ceny brutto
            currency: invoiceData.currency || 'PLN',
            description: invoiceData.description || '',
            alreadypaid_initial: invoiceData.alreadypaid || 0,
            invoicecontents: invoiceData.invoicecontents.map(item => ({
              invoicecontent: {
                name: item.invoicecontent.name,
                unit: item.invoicecontent.unit || 'szt.',
                count: item.invoicecontent.count || 1,
                price: item.invoicecontent.price,
                vat: item.invoicecontent.vat || '23'
              }
            }))
          }
        }]
      };

      console.log('Wysyłam do wFirma:', JSON.stringify(invoiceBody, null, 2));

      const url = `${baseUrl}/invoices/add${extParams}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'accessKey': accessKey,
          'secretKey': secretKey,
          'appKey': appKey
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
      if (result.status?.code === 'OK') {
        const invoice = result.invoices?.[0]?.invoice || {};
        return res.status(200).json({
          success: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.fullnumber || invoice.number,
          data: invoice
        });
      } else {
        // Błąd z wFirma
        const errorMsg = result.status?.message || 'Nieznany błąd';
        console.error('Błąd wFirma:', JSON.stringify(result, null, 2));
        return res.status(400).json({
          success: false,
          error: `wFirma: ${errorMsg}`,
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
