// api/invoice/[id].js
// Strona wyświetlająca fakturę/proformę dla klienta

export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).send('Brak ID dokumentu');
  }

  // Pobierz dane faktury z wFirma
  const accessKey = process.env.WFIRMA_ACCESS_KEY;
  const secretKey = process.env.WFIRMA_SECRET_KEY;
  const companyId = process.env.WFIRMA_COMPANY_ID;
  const appKey = 'a049b58f106cf0c177b32615739db965';

  if (!accessKey || !secretKey || !companyId) {
    return res.status(500).send('Brak konfiguracji wFirma');
  }

  try {
    const baseUrl = 'https://api2.wfirma.pl';
    
    console.log('Pobieranie faktury ID:', id);
    
    // Pobierz dane faktury - wFirma wymaga parametrów w URL i odpowiednich headerów
    const url = `${baseUrl}/invoices/get/${id}?company_id=${companyId}&inputFormat=json&outputFormat=json`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'accessKey': accessKey,
        'secretKey': secretKey,
        'appKey': appKey
      },
      body: '{}'
    });

    const responseText = await response.text();
    console.log('Odpowiedź wFirma (status:', response.status, '):', responseText.substring(0, 500));

    // Sprawdź czy odpowiedź to XML (błąd)
    if (responseText.startsWith('<?xml')) {
      console.error('wFirma zwróciła XML zamiast JSON:', responseText);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>Błąd</title>
        <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#F1F5F9;}
        .error{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
        h1{color:#EF4444;}</style></head>
        <body><div class="error"><h1>❌ Błąd komunikacji</h1><p>Problem z połączeniem do systemu faktur.</p></div></body></html>
      `);
    }

    if (!response.ok) {
      console.error('Błąd HTTP:', response.status, responseText);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>Błąd</title>
        <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#F1F5F9;}
        .error{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
        h1{color:#EF4444;}</style></head>
        <body><div class="error"><h1>❌ Dokument nie znaleziony</h1><p>Nie udało się pobrać dokumentu z systemu wFirma.</p><p style="color:#94A3B8;font-size:12px;">ID: ${id} | Status: ${response.status}</p></div></body></html>
      `);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Błąd parsowania JSON:', e, 'Response:', responseText.substring(0, 200));
      return res.status(500).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>Błąd</title>
        <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#F1F5F9;}
        .error{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
        h1{color:#EF4444;}</style></head>
        <body><div class="error"><h1>❌ Błąd systemu</h1><p>Nie udało się odczytać danych dokumentu.</p></div></body></html>
      `);
    }

    console.log('Status wFirma:', data.status);

    // Sprawdź czy jest błąd
    if (data.status?.code !== 'OK') {
      console.error('Błąd wFirma:', data.status);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>Błąd</title>
        <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#F1F5F9;}
        .error{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
        h1{color:#EF4444;}</style></head>
        <body><div class="error"><h1>❌ Dokument nie znaleziony</h1><p>${data.status?.message || 'Nieznany błąd'}</p><p style="color:#94A3B8;font-size:12px;">ID: ${id}</p></div></body></html>
      `);
    }

    const invoice = data.invoices?.[0]?.invoice;

    if (!invoice) {
      console.error('Brak faktury w odpowiedzi:', JSON.stringify(data, null, 2));
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>Błąd</title>
        <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#F1F5F9;}
        .error{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
        h1{color:#EF4444;}</style></head>
        <body><div class="error"><h1>❌ Dokument nie znaleziony</h1><p>Dokument nie istnieje lub został usunięty.</p></div></body></html>
      `);
    }

    // Pobierz pozycje faktury
    const contentsResponse = await fetch(`${baseUrl}/invoicecontents/find${extParams}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'accessKey': accessKey,
        'secretKey': secretKey,
        'appKey': appKey
      },
      body: JSON.stringify({
        conditions: [
          { field: 'invoice', operator: 'eq', value: id }
        ]
      })
    });

    let invoiceContents = [];
    if (contentsResponse.ok) {
      const contentsData = await contentsResponse.json();
      invoiceContents = contentsData.invoicecontents?.map(ic => ic.invoicecontent) || [];
    }

    const isProforma = invoice.type === 'proforma';
    const docType = isProforma ? 'Proforma' : 'Faktura VAT';

    // Generuj stronę HTML
    const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docType} ${invoice.fullnumber || invoice.number || ''} - Herraton</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: ${isProforma ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'linear-gradient(135deg, #10B981, #059669)'};
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 28px;
      margin-bottom: 10px;
    }
    .header .doc-number {
      font-size: 18px;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 14px;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #E2E8F0;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 600px) {
      .info-grid {
        grid-template-columns: 1fr;
      }
    }
    .info-box {
      background: #F8FAFC;
      padding: 16px;
      border-radius: 10px;
    }
    .info-box label {
      font-size: 12px;
      color: #64748B;
      display: block;
      margin-bottom: 4px;
    }
    .info-box value {
      font-size: 16px;
      color: #1E293B;
      font-weight: 500;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .items-table th {
      background: #F1F5F9;
      padding: 12px;
      text-align: left;
      font-size: 12px;
      color: #64748B;
      text-transform: uppercase;
    }
    .items-table td {
      padding: 14px 12px;
      border-bottom: 1px solid #E2E8F0;
      color: #334155;
    }
    .items-table tr:last-child td {
      border-bottom: none;
    }
    .total-row {
      background: #F0FDF4;
    }
    .total-row td {
      font-weight: 600;
      color: #059669;
      font-size: 18px;
    }
    .summary {
      background: linear-gradient(135deg, #EEF2FF, #E0E7FF);
      padding: 24px;
      border-radius: 12px;
      text-align: center;
    }
    .summary-amount {
      font-size: 36px;
      font-weight: 700;
      color: #4F46E5;
      margin-bottom: 8px;
    }
    .summary-label {
      color: #6366F1;
      font-size: 14px;
    }
    .payment-info {
      background: #FFFBEB;
      border: 2px solid #FCD34D;
      padding: 20px;
      border-radius: 12px;
      margin-top: 20px;
    }
    .payment-info h3 {
      color: #B45309;
      margin-bottom: 12px;
      font-size: 16px;
    }
    .payment-info p {
      color: #92400E;
      font-size: 14px;
      margin: 6px 0;
    }
    .btn-download {
      display: inline-block;
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      color: white;
      padding: 16px 32px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      margin-top: 20px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-download:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
    }
    .btn-print {
      display: inline-block;
      background: #64748B;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
      margin-left: 10px;
      cursor: pointer;
      border: none;
    }
    .actions {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #E2E8F0;
    }
    .footer {
      text-align: center;
      padding: 20px;
      background: #F8FAFC;
      color: #94A3B8;
      font-size: 13px;
    }
    .logo {
      font-size: 24px;
      margin-bottom: 5px;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .container {
        box-shadow: none;
      }
      .actions, .btn-download, .btn-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🏢</div>
      <h1>${docType}</h1>
      <div class="doc-number">${invoice.fullnumber || invoice.number || 'Brak numeru'}</div>
    </div>
    
    <div class="content">
      <div class="section">
        <div class="info-grid">
          <div class="info-box">
            <label>Data wystawienia</label>
            <value>${invoice.date || '—'}</value>
          </div>
          <div class="info-box">
            <label>Termin płatności</label>
            <value>${invoice.paymentdate || '—'}</value>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Nabywca</div>
        <div class="info-grid">
          <div class="info-box">
            <label>Nazwa</label>
            <value>${invoice.contractor_name || invoice.contractor?.name || '—'}</value>
          </div>
          <div class="info-box">
            <label>Adres</label>
            <value>${[invoice.contractor_street, invoice.contractor_zip, invoice.contractor_city].filter(Boolean).join(', ') || '—'}</value>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Pozycje</div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Nazwa</th>
              <th>Ilość</th>
              <th>Cena</th>
              <th>VAT</th>
              <th>Wartość</th>
            </tr>
          </thead>
          <tbody>
            ${invoiceContents.length > 0 ? invoiceContents.map(item => `
              <tr>
                <td>${item.name || '—'}</td>
                <td>${item.count || 1} ${item.unit || 'szt.'}</td>
                <td>${parseFloat(item.price || 0).toFixed(2)} ${invoice.currency || 'PLN'}</td>
                <td>${item.vat || '23'}%</td>
                <td>${parseFloat(item.total || item.price || 0).toFixed(2)} ${invoice.currency || 'PLN'}</td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="5" style="text-align: center; color: #94A3B8;">Brak pozycji</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>

      <div class="summary">
        <div class="summary-amount">${parseFloat(invoice.total || invoice.netto || 0).toFixed(2)} ${invoice.currency || 'PLN'}</div>
        <div class="summary-label">Do zapłaty${invoice.alreadypaid > 0 ? ` (zapłacono: ${parseFloat(invoice.alreadypaid).toFixed(2)} ${invoice.currency || 'PLN'})` : ''}</div>
      </div>

      ${isProforma ? `
      <div class="payment-info">
        <h3>💳 Informacja o płatności</h3>
        <p>To jest proforma - dokument nie jest fakturą VAT.</p>
        <p>Po zaksięgowaniu płatności otrzymasz fakturę VAT.</p>
      </div>
      ` : ''}

      <div class="actions">
        <button class="btn-print" onclick="window.print()">🖨️ Drukuj</button>
      </div>
    </div>

    <div class="footer">
      Wygenerowano przez system Herraton<br>
      ${new Date().toLocaleDateString('pl-PL')}
    </div>
  </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Error fetching invoice:', error);
    return res.status(500).send('Błąd pobierania dokumentu');
  }
}
