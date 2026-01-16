// ============================================
// EKSPORT DO EXCEL I GOOGLE SHEETS
// ============================================

import * as XLSX from 'xlsx';

// Formatowanie daty
const formatDate = (d) => d ? new Date(d).toLocaleDateString('pl-PL') : '';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('pl-PL') : '';

// ============================================
// EKSPORT DO EXCEL (pobieranie pliku)
// ============================================

export const exportToExcel = (orders, filename = 'herraton-zamowienia') => {
  // Przygotuj dane
  const data = orders.map(order => ({
    'Nr zamówienia': order.nrWlasny || '',
    'Status': order.status || '',
    'Data zlecenia': formatDate(order.dataZlecenia),
    'Towar': order.towar || '',
    'Producent': order.zaladunek || '',
    'Klient - Imię': order.klient?.imie || '',
    'Klient - Adres': order.klient?.adres || '',
    'Klient - Telefon': order.klient?.telefon || '',
    'Klient - Email': order.klient?.email || '',
    'Waluta': order.platnosci?.waluta || 'PLN',
    'Cena całkowita': order.platnosci?.cenaCalkowita || 0,
    'Zapłacono': order.platnosci?.zaplacono || 0,
    'Do zapłaty': order.platnosci?.doZaplaty || 0,
    'Metoda płatności': order.platnosci?.metodaZaplaty || '',
    'Data płatności': formatDate(order.platnosci?.dataZaplaty),
    'Data odbioru': formatDate(order.dataOdbioru),
    'Uwagi': order.uwagi || '',
    'Utworzone przez': order.utworzonePrzez?.nazwa || '',
    'Data utworzenia': formatDateTime(order.utworzonePrzez?.data),
    'Kierowca': order.przypisanyKierowca || '',
  }));

  // Utwórz arkusz
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Ustaw szerokości kolumn
  const colWidths = [
    { wch: 15 }, // Nr zamówienia
    { wch: 15 }, // Status
    { wch: 12 }, // Data zlecenia
    { wch: 50 }, // Towar
    { wch: 15 }, // Producent
    { wch: 20 }, // Klient imię
    { wch: 35 }, // Klient adres
    { wch: 15 }, // Telefon
    { wch: 25 }, // Email
    { wch: 8 },  // Waluta
    { wch: 12 }, // Cena
    { wch: 12 }, // Zapłacono
    { wch: 12 }, // Do zapłaty
    { wch: 15 }, // Metoda
    { wch: 12 }, // Data płatności
    { wch: 12 }, // Data odbioru
    { wch: 30 }, // Uwagi
    { wch: 15 }, // Utworzone przez
    { wch: 18 }, // Data utworzenia
    { wch: 15 }, // Kierowca
  ];
  worksheet['!cols'] = colWidths;

  // Utwórz skoroszyt
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Zamówienia');

  // Dodaj arkusz podsumowania
  const summary = [
    { 'Statystyka': 'Wszystkich zamówień', 'Wartość': orders.length },
    { 'Statystyka': 'Do zapłaty łącznie (PLN)', 'Wartość': orders.filter(o => o.platnosci?.waluta === 'PLN').reduce((sum, o) => sum + (o.platnosci?.doZaplaty || 0), 0) },
    { 'Statystyka': 'Do zapłaty łącznie (EUR)', 'Wartość': orders.filter(o => o.platnosci?.waluta === 'EUR').reduce((sum, o) => sum + (o.platnosci?.doZaplaty || 0), 0) },
    { 'Statystyka': 'Zapłacono łącznie (PLN)', 'Wartość': orders.filter(o => o.platnosci?.waluta === 'PLN').reduce((sum, o) => sum + (o.platnosci?.zaplacono || 0), 0) },
    { 'Statystyka': 'Data eksportu', 'Wartość': formatDateTime(new Date()) },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Podsumowanie');

  // Pobierz plik
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `${filename}-${date}.xlsx`);
};

// ============================================
// SYNCHRONIZACJA Z GOOGLE SHEETS (przez Apps Script)
// ============================================

// URL do Twojego Google Apps Script (ustawisz w kroku 10)
let GOOGLE_SCRIPT_URL = '';

export const setGoogleScriptUrl = (url) => {
  GOOGLE_SCRIPT_URL = url;
  localStorage.setItem('googleScriptUrl', url);
};

export const getGoogleScriptUrl = () => {
  if (!GOOGLE_SCRIPT_URL) {
    GOOGLE_SCRIPT_URL = localStorage.getItem('googleScriptUrl') || '';
  }
  return GOOGLE_SCRIPT_URL;
};

// Wyślij dane do Google Sheets
export const syncToGoogleSheets = async (orders) => {
  const url = getGoogleScriptUrl();
  
  if (!url) {
    console.log('⚠️ Google Sheets URL nie skonfigurowany');
    return { success: false, error: 'URL nie skonfigurowany' };
  }

  try {
    // Przygotuj dane
    const data = orders.map(order => ({
      nrWlasny: order.nrWlasny || '',
      status: order.status || '',
      dataZlecenia: formatDate(order.dataZlecenia),
      towar: order.towar || '',
      producent: order.zaladunek || '',
      klientImie: order.klient?.imie || '',
      klientAdres: order.klient?.adres || '',
      klientTelefon: order.klient?.telefon || '',
      klientEmail: order.klient?.email || '',
      waluta: order.platnosci?.waluta || 'PLN',
      cenaCalkowita: order.platnosci?.cenaCalkowita || 0,
      zaplacono: order.platnosci?.zaplacono || 0,
      doZaplaty: order.platnosci?.doZaplaty || 0,
      metodaPlatnosci: order.platnosci?.metodaZaplaty || '',
      dataPlatnosci: formatDate(order.platnosci?.dataZaplaty),
      dataOdbioru: formatDate(order.dataOdbioru),
      uwagi: order.uwagi || '',
      utworzonePrzez: order.utworzonePrzez?.nazwa || '',
      dataUtworzenia: formatDateTime(order.utworzonePrzez?.data),
    }));

    // Wyślij do Google Apps Script
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // Google Apps Script wymaga tego
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'sync',
        data: data,
        timestamp: new Date().toISOString()
      })
    });

    console.log('✅ Dane wysłane do Google Sheets');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Błąd synchronizacji z Google Sheets:', error);
    return { success: false, error: error.message };
  }
};

// Automatyczna synchronizacja (wywoływana przy każdej zmianie)
let syncTimeout = null;

export const autoSyncToGoogleSheets = (orders) => {
  // Debounce - poczekaj 5 sekund po ostatniej zmianie
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  syncTimeout = setTimeout(() => {
    syncToGoogleSheets(orders);
  }, 5000);
};
