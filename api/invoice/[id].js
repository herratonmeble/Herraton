// api/invoice/[id].js
// Strona wyświetlająca fakturę/proformę dla klienta - styl wFirma

export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).send('Brak ID dokumentu');
  }

  const accessKey = process.env.WFIRMA_ACCESS_KEY;
  const secretKey = process.env.WFIRMA_SECRET_KEY;
  const companyId = process.env.WFIRMA_COMPANY_ID;
  const appKey = 'a049b58f106cf0c177b32615739db965';

  if (!accessKey || !secretKey || !companyId) {
    return res.status(500).send('Brak konfiguracji wFirma');
  }

  try {
    const baseUrl = 'https://api2.wfirma.pl';
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

    if (responseText.startsWith('<?xml') || !response.ok) {
      return res.status(404).send(errorPage('Nie znaleziono dokumentu', id));
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).send(errorPage('Błąd odczytu dokumentu', id));
    }

    if (data.status?.code !== 'OK') {
      return res.status(404).send(errorPage(data.status?.message || 'Dokument nie znaleziony', id));
    }

    // Parsuj dane faktury
    let invoice = null;
    if (data.invoices) {
      if (Array.isArray(data.invoices)) {
        invoice = data.invoices[0]?.invoice;
      } else if (data.invoices["0"]) {
        invoice = data.invoices["0"].invoice;
      } else {
        invoice = Object.values(data.invoices)[0]?.invoice;
      }
    }

    if (!invoice) {
      return res.status(404).send(errorPage('Dokument nie istnieje', id));
    }

    // Pozycje faktury
    let items = [];
    if (invoice.invoicecontents) {
      if (Array.isArray(invoice.invoicecontents)) {
        items = invoice.invoicecontents.map(ic => ic.invoicecontent);
      } else {
        items = Object.values(invoice.invoicecontents).map(ic => ic.invoicecontent);
      }
    }

    // Dane
    const company = invoice.company_detail || {};
    const contractor = invoice.contractor_detail || {};
    const isProforma = invoice.type === 'proforma';
    const docType = isProforma ? 'PROFORMA' : 'FAKTURA VAT';
    const docNumber = invoice.fullnumber || invoice.number || '';

    // Generuj HTML faktury
    const html = generateInvoiceHTML({
      docType,
      docNumber,
      invoice,
      company,
      contractor,
      items,
      isProforma
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).send(errorPage('Błąd serwera', id));
  }
}

function errorPage(message, id) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Błąd</title>
<style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;margin:0;}
.error{background:white;padding:60px;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
h1{color:#c00;margin-bottom:10px;font-size:24px;}p{color:#666;}</style></head>
<body><div class="error"><h1>❌ ${message}</h1><p>ID dokumentu: ${id}</p></div></body></html>`;
}

function generateInvoiceHTML({ docType, docNumber, invoice, company, contractor, items, isProforma }) {
  const currency = invoice.currency || 'PLN';
  const total = parseFloat(invoice.total || 0).toFixed(2);
  const netto = parseFloat(invoice.netto || 0).toFixed(2);
  const tax = parseFloat(invoice.tax || 0).toFixed(2);
  const alreadyPaid = parseFloat(invoice.alreadypaid || 0).toFixed(2);
  const remaining = parseFloat(invoice.remaining || invoice.total || 0).toFixed(2);

  // Słownie kwota (uproszczone)
  const totalWords = numberToWords(parseFloat(total));

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docType} ${docNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      font-size: 11px; 
      line-height: 1.4;
      color: #333;
      background: #f0f0f0;
      padding: 20px;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      box-shadow: 0 0 20px rgba(0,0,0,0.15);
    }
    .invoice-page {
      padding: 40px;
      min-height: 1100px;
      position: relative;
    }
    
    /* Nagłówek */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #2c5aa0;
    }
    .company-logo {
      font-size: 24px;
      font-weight: bold;
      color: #2c5aa0;
    }
    .doc-title {
      text-align: right;
    }
    .doc-title h1 {
      font-size: 28px;
      color: #2c5aa0;
      margin-bottom: 5px;
      font-weight: 600;
    }
    .doc-title .doc-number {
      font-size: 16px;
      color: #666;
    }
    
    /* Daty */
    .dates-row {
      display: flex;
      justify-content: flex-end;
      gap: 30px;
      margin-bottom: 25px;
      font-size: 11px;
    }
    .date-item {
      text-align: right;
    }
    .date-label {
      color: #888;
      font-size: 10px;
      text-transform: uppercase;
    }
    .date-value {
      font-weight: 600;
      color: #333;
    }
    
    /* Strony - sprzedawca/nabywca */
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 30px;
    }
    .party-box {
      padding: 15px;
      background: #f8f9fa;
      border-left: 3px solid #2c5aa0;
    }
    .party-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }
    .party-name {
      font-size: 14px;
      font-weight: 600;
      color: #222;
      margin-bottom: 5px;
    }
    .party-details {
      font-size: 11px;
      color: #555;
      line-height: 1.6;
    }
    .party-nip {
      margin-top: 8px;
      font-weight: 600;
    }
    
    /* Tabela pozycji */
    .items-section {
      margin-bottom: 25px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .items-table th {
      background: #2c5aa0;
      color: white;
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 9px;
    }
    .items-table th.right { text-align: right; }
    .items-table th.center { text-align: center; }
    .items-table td {
      padding: 10px 8px;
      border-bottom: 1px solid #e0e0e0;
      vertical-align: top;
    }
    .items-table td.right { text-align: right; }
    .items-table td.center { text-align: center; }
    .items-table tr:nth-child(even) { background: #f9f9f9; }
    .items-table .item-name { font-weight: 500; }
    
    /* Podsumowanie */
    .summary-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 25px;
    }
    .summary-table {
      width: 320px;
      font-size: 11px;
    }
    .summary-table tr td {
      padding: 6px 10px;
      border-bottom: 1px solid #e0e0e0;
    }
    .summary-table tr td:first-child {
      color: #666;
    }
    .summary-table tr td:last-child {
      text-align: right;
      font-weight: 500;
    }
    .summary-table tr.total {
      background: #2c5aa0;
      color: white;
    }
    .summary-table tr.total td {
      padding: 12px 10px;
      font-size: 14px;
      font-weight: 700;
      border: none;
    }
    .summary-table tr.remaining td {
      background: #fff3cd;
      font-weight: 600;
      color: #856404;
    }
    
    /* Słownie */
    .amount-words {
      background: #f8f9fa;
      padding: 12px 15px;
      margin-bottom: 25px;
      border-left: 3px solid #2c5aa0;
      font-size: 11px;
    }
    .amount-words-label {
      color: #888;
      font-size: 10px;
      text-transform: uppercase;
    }
    .amount-words-value {
      font-weight: 600;
      color: #333;
    }
    
    /* Płatność */
    .payment-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 25px;
      padding: 15px;
      background: #f8f9fa;
    }
    .payment-item {
      font-size: 11px;
    }
    .payment-label {
      color: #888;
      font-size: 10px;
      text-transform: uppercase;
    }
    .payment-value {
      font-weight: 600;
      color: #333;
    }
    .bank-account {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      letter-spacing: 1px;
      background: white;
      padding: 8px 12px;
      margin-top: 5px;
      border: 1px solid #ddd;
    }
    
    /* Uwagi */
    .notes {
      font-size: 10px;
      color: #666;
      margin-bottom: 20px;
      padding: 10px;
      background: #fffef0;
      border: 1px solid #f0e68c;
    }
    
    /* Stopka */
    .footer-signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 100px;
      margin-top: 60px;
      padding-top: 20px;
    }
    .signature-box {
      text-align: center;
      padding-top: 50px;
      border-top: 1px solid #333;
      font-size: 10px;
      color: #666;
    }
    
    /* Przyciski */
    .actions {
      text-align: center;
      padding: 20px;
      background: #f8f9fa;
      border-top: 1px solid #e0e0e0;
    }
    .btn {
      display: inline-block;
      padding: 12px 30px;
      margin: 0 10px;
      border: none;
      border-radius: 5px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-print {
      background: #2c5aa0;
      color: white;
    }
    .btn-print:hover {
      background: #1e4080;
    }
    .btn-download {
      background: #28a745;
      color: white;
    }
    .btn-download:hover {
      background: #1e7e34;
    }
    
    /* Proforma notice */
    .proforma-notice {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 12px 15px;
      margin-bottom: 20px;
      font-size: 11px;
      color: #856404;
      text-align: center;
    }
    
    /* Print styles */
    @media print {
      body { 
        background: white; 
        padding: 0; 
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .invoice-container { 
        box-shadow: none; 
        max-width: 100%;
      }
      .invoice-page { 
        padding: 20px; 
        min-height: auto;
      }
      .actions { display: none; }
      .items-table th { 
        background: #2c5aa0 !important; 
        color: white !important; 
      }
      .summary-table tr.total { 
        background: #2c5aa0 !important; 
        color: white !important; 
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-page">
      
      <!-- Nagłówek -->
      <div class="header">
        <div class="company-logo">${company.name || 'Firma'}</div>
        <div class="doc-title">
          <h1>${docType}</h1>
          <div class="doc-number">Nr: ${docNumber}</div>
        </div>
      </div>
      
      ${isProforma ? `
      <div class="proforma-notice">
        ⚠️ To jest dokument PROFORMA - nie stanowi faktury VAT. Po zaksięgowaniu płatności zostanie wystawiona faktura VAT.
      </div>
      ` : ''}
      
      <!-- Daty -->
      <div class="dates-row">
        <div class="date-item">
          <div class="date-label">Data wystawienia</div>
          <div class="date-value">${invoice.date || '—'}</div>
        </div>
        <div class="date-item">
          <div class="date-label">Data sprzedaży</div>
          <div class="date-value">${invoice.disposaldate || invoice.date || '—'}</div>
        </div>
        <div class="date-item">
          <div class="date-label">Termin płatności</div>
          <div class="date-value">${invoice.paymentdate || '—'}</div>
        </div>
      </div>
      
      <!-- Sprzedawca / Nabywca -->
      <div class="parties">
        <div class="party-box">
          <div class="party-label">Sprzedawca</div>
          <div class="party-name">${company.name || ''}</div>
          <div class="party-details">
            ${company.street || ''}${company.building_number ? ' ' + company.building_number : ''}${company.flat_number ? '/' + company.flat_number : ''}<br>
            ${company.zip || ''} ${company.city || ''}<br>
            ${company.country || 'Polska'}
            ${company.nip ? `<div class="party-nip">NIP: ${company.nip}</div>` : ''}
          </div>
        </div>
        <div class="party-box">
          <div class="party-label">Nabywca</div>
          <div class="party-name">${contractor.name || ''}</div>
          <div class="party-details">
            ${contractor.street || ''}<br>
            ${contractor.zip || ''} ${contractor.city || ''}<br>
            ${contractor.country || 'Polska'}
            ${contractor.nip ? `<div class="party-nip">NIP: ${contractor.nip}</div>` : ''}
            ${contractor.phone ? `<br>Tel: ${contractor.phone}` : ''}
            ${contractor.email ? `<br>Email: ${contractor.email}` : ''}
          </div>
        </div>
      </div>
      
      <!-- Pozycje -->
      <div class="items-section">
        <table class="items-table">
          <thead>
            <tr>
              <th style="width:30px" class="center">Lp.</th>
              <th>Nazwa towaru / usługi</th>
              <th class="center" style="width:50px">J.m.</th>
              <th class="right" style="width:50px">Ilość</th>
              <th class="right" style="width:80px">Cena netto</th>
              <th class="right" style="width:80px">Wartość netto</th>
              <th class="center" style="width:50px">VAT</th>
              <th class="right" style="width:80px">Wartość brutto</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
            <tr>
              <td class="center">${idx + 1}</td>
              <td class="item-name">${item.name || ''}</td>
              <td class="center">${item.unit || 'szt.'}</td>
              <td class="right">${parseFloat(item.count || 1).toFixed(2)}</td>
              <td class="right">${parseFloat(item.netto / (item.count || 1) || item.price / 1.23 || 0).toFixed(2)}</td>
              <td class="right">${parseFloat(item.netto || 0).toFixed(2)}</td>
              <td class="center">23%</td>
              <td class="right">${parseFloat(item.brutto || item.price || 0).toFixed(2)}</td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <!-- Podsumowanie -->
      <div class="summary-section">
        <table class="summary-table">
          <tr>
            <td>Razem netto:</td>
            <td>${netto} ${currency}</td>
          </tr>
          <tr>
            <td>VAT 23%:</td>
            <td>${tax} ${currency}</td>
          </tr>
          <tr class="total">
            <td>RAZEM BRUTTO:</td>
            <td>${total} ${currency}</td>
          </tr>
          ${parseFloat(alreadyPaid) > 0 ? `
          <tr>
            <td>Zapłacono:</td>
            <td>${alreadyPaid} ${currency}</td>
          </tr>
          ` : ''}
          <tr class="remaining">
            <td>Do zapłaty:</td>
            <td>${remaining} ${currency}</td>
          </tr>
        </table>
      </div>
      
      <!-- Słownie -->
      <div class="amount-words">
        <span class="amount-words-label">Słownie: </span>
        <span class="amount-words-value">${totalWords} ${currency}</span>
      </div>
      
      <!-- Płatność -->
      <div class="payment-section">
        <div class="payment-item">
          <div class="payment-label">Forma płatności</div>
          <div class="payment-value">${invoice.paymentmethod === 'transfer' ? 'Przelew bankowy' : invoice.paymentmethod || 'Przelew'}</div>
        </div>
        <div class="payment-item">
          <div class="payment-label">Status płatności</div>
          <div class="payment-value">${invoice.paymentstate === 'paid' ? '✅ Zapłacono' : invoice.paymentstate === 'unpaid' ? '⏳ Oczekuje na płatność' : invoice.paymentstate || 'Nieopłacona'}</div>
        </div>
        ${company.bank_name || company.bank_account ? `
        <div class="payment-item" style="grid-column: span 2;">
          <div class="payment-label">Numer konta bankowego ${company.bank_name ? `(${company.bank_name})` : ''}</div>
          <div class="bank-account">${formatBankAccount(company.bank_account || '')}</div>
        </div>
        ` : ''}
      </div>
      
      ${invoice.description ? `
      <div class="notes">
        <strong>Uwagi:</strong> ${invoice.description}
      </div>
      ` : ''}
      
      <!-- Podpisy -->
      <div class="footer-signatures">
        <div class="signature-box">
          Podpis osoby upoważnionej<br>do wystawienia faktury
        </div>
        <div class="signature-box">
          Podpis osoby upoważnionej<br>do odbioru faktury
        </div>
      </div>
      
    </div>
    
    <!-- Przyciski -->
    <div class="actions">
      <button class="btn btn-print" onclick="window.print()">🖨️ Drukuj / Zapisz PDF</button>
    </div>
  </div>
</body>
</html>`;
}

function formatBankAccount(account) {
  if (!account) return '';
  // Format: XX XXXX XXXX XXXX XXXX XXXX XXXX
  const clean = account.replace(/\s/g, '');
  return clean.replace(/(.{2})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})/, '$1 $2 $3 $4 $5 $6 $7');
}

function numberToWords(num) {
  if (num === 0) return 'zero';
  
  const ones = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
  const teens = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
  const tens = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
  const hundreds = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
  
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  
  let result = '';
  
  if (intPart >= 1000) {
    const thousands = Math.floor(intPart / 1000);
    if (thousands === 1) result += 'tysiąc ';
    else if (thousands >= 2 && thousands <= 4) result += ones[thousands] + ' tysiące ';
    else result += ones[thousands] + ' tysięcy ';
  }
  
  const remainder = intPart % 1000;
  if (remainder >= 100) {
    result += hundreds[Math.floor(remainder / 100)] + ' ';
  }
  
  const tensRemainder = remainder % 100;
  if (tensRemainder >= 10 && tensRemainder < 20) {
    result += teens[tensRemainder - 10] + ' ';
  } else {
    if (tensRemainder >= 20) {
      result += tens[Math.floor(tensRemainder / 10)] + ' ';
    }
    if (tensRemainder % 10 > 0) {
      result += ones[tensRemainder % 10] + ' ';
    }
  }
  
  result += decPart > 0 ? `${decPart}/100` : '00/100';
  
  return result.trim();
}
