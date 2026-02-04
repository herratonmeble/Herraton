import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  subscribeToOrders, addOrder, updateOrder, deleteOrder,
  subscribeToUsers, addUser, updateUser, deleteUser,
  subscribeToProducers, addProducer, updateProducer, deleteProducer,
  subscribeToNotifications, addNotification, updateNotification, deleteNotification,
  subscribeToComplaints, addComplaint, updateComplaint, deleteComplaint,
  subscribeToLeads, addLead, updateLead, deleteLead,
  subscribeToMessages, addMessage, updateMessage,
  subscribeToPriceLists, addPriceList, deletePriceList,
  subscribeToSettlements, addSettlement, updateSettlement, deleteSettlement,
  subscribeToSamples, addSample, updateSample, deleteSample,
  subscribeToMailItems, addMailItem, updateMailItem, deleteMailItem,
  initializeDefaultData
} from './firebase';
import { exportToExcel, autoSyncToGoogleSheets, setGoogleScriptUrl, getGoogleScriptUrl } from './export';
import './App.css';

// ============================================
// FIREBASE CLOUD MESSAGING - PUSH NOTIFICATIONS
// ============================================
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
// doc i updateDoc są importowane dynamicznie w saveTokenToFirestore

// Firebase config (już używane w projekcie)
const firebaseConfig = {
  apiKey: "AIzaSyDPno2WcoauLnjkWq0NjGjuWr5wuG64xMI",
  authDomain: "herraton-332d0.firebaseapp.com",
  projectId: "herraton-332d0",
  storageBucket: "herraton-332d0.firebasestorage.app",
  messagingSenderId: "620331362290",
  appId: "1:620331362290:web:6ce157738f7ae7e2f02d6b"
};

// VAPID Key z Firebase Console
const VAPID_KEY = "BNig4oMMnd59QexuD4EQKghZGqQ0FIPCBS2UeeBgZ5teDNkd3nSj3R71UAtoiSjGafcgOnbhU5A95CSKuezH3N8";

// Inicjalizacja Firebase dla Messaging (jeśli jeszcze nie zainicjalizowana)
let messagingApp;
let messaging;

const initializeMessaging = () => {
  try {
    if (getApps().length === 0) {
      messagingApp = initializeApp(firebaseConfig);
    } else {
      messagingApp = getApps()[0];
    }
    
    // Sprawdź czy przeglądarka wspiera Messaging
    if (typeof window !== 'undefined' && 'Notification' in window) {
      messaging = getMessaging(messagingApp);
      console.log('Firebase Messaging zainicjalizowane');
    }
  } catch (error) {
    console.error('Błąd inicjalizacji Firebase Messaging:', error);
  }
};

// Inicjalizuj przy starcie
if (typeof window !== 'undefined') {
  initializeMessaging();
}

// ============================================
// HOOK - PUSH NOTIFICATIONS
// ============================================
const usePushNotifications = (currentUser, db, onNotificationReceived) => {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [fcmToken, setFcmToken] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Sprawdź wsparcie przeglądarki
  useEffect(() => {
    const checkSupport = () => {
      const supported = typeof window !== 'undefined' &&
                       'Notification' in window && 
                       'serviceWorker' in navigator && 
                       'PushManager' in window;
      setIsSupported(supported);
      
      // Aktualizuj status uprawnień
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission);
      }
    };
    checkSupport();
  }, []);

  // Zapisz token FCM w Firestore dla użytkownika
  const saveTokenToFirestore = useCallback(async (userId, token) => {
    if (!db || !userId || !token) return;
    
    try {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', userId);
      
      // Pobierz aktualne tokeny użytkownika
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      const existingTokens = userData?.fcmTokens || [];
      
      // Sprawdź czy token już istnieje
      const tokenExists = existingTokens.some(t => t.token === token);
      
      if (tokenExists) {
        console.log('Token FCM już istnieje dla użytkownika:', userId);
        return;
      }
      
      const deviceInfo = navigator.userAgent.substring(0, 100);
      
      // Dodaj nowy token
      const newToken = {
        token,
        device: deviceInfo,
        createdAt: new Date().toISOString(),
        platform: /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 
                 /Android/.test(navigator.userAgent) ? 'android' : 'web'
      };
      
      await updateDoc(userRef, {
        fcmTokens: [...existingTokens, newToken],
        lastFcmUpdate: new Date().toISOString()
      });
      
      console.log('Token FCM zapisany dla użytkownika:', userId);
    } catch (error) {
      console.error('Błąd zapisu tokenu FCM:', error);
    }
  }, [db]);

  // Pobierz token FCM
  const getFcmToken = useCallback(async () => {
    if (!messaging || !isSupported) return null;
    
    try {
      // Zarejestruj Service Worker jeśli nie jest zarejestrowany
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker zarejestrowany:', registration);
      
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });
      
      if (token) {
        console.log('Otrzymano token FCM:', token.substring(0, 20) + '...');
        setFcmToken(token);
        return token;
      } else {
        console.log('Brak tokenu FCM - brak uprawnień?');
        return null;
      }
    } catch (error) {
      console.error('Błąd pobierania tokenu FCM:', error);
      return null;
    }
  }, [isSupported]);

  // Nasłuchuj na wiadomości gdy aplikacja jest otwarta
  useEffect(() => {
    if (!messaging || !isSupported || permission !== 'granted') return;
    
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Otrzymano wiadomość FCM:', payload);
      
      // Wywołaj callback jeśli podany
      if (onNotificationReceived) {
        onNotificationReceived({
          icon: payload.data?.icon || '🔔',
          title: payload.notification?.title || 'Powiadomienie',
          message: payload.notification?.body || '',
          data: payload.data
        });
      }
      
      // Pokaż natywne powiadomienie jeśli aplikacja jest w tle/nieaktywna
      if (document.hidden && Notification.permission === 'granted') {
        new Notification(payload.notification?.title || 'Herraton', {
          body: payload.notification?.body,
          icon: '/icons/icon-192.png',
          data: payload.data
        });
      }
    });
    
    return () => unsubscribe();
  }, [isSupported, permission, onNotificationReceived]);

  // Poproś o zgodę na powiadomienia
  const requestPermission = async () => {
    if (!isSupported) {
      alert('Twoja przeglądarka nie wspiera powiadomień push. Spróbuj Chrome lub Edge.');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        const token = await getFcmToken();
        
        // Zapisz token w Firestore dla użytkownika
        if (token && currentUser?.id && db) {
          await saveTokenToFirestore(currentUser.id, token);
        }
        
        setIsLoading(false);
        return true;
      } else if (result === 'denied') {
        alert('Powiadomienia zostały zablokowane. Aby je włączyć, zmień ustawienia w przeglądarce:\n\n' +
              '1. Kliknij ikonę kłódki obok adresu strony\n' +
              '2. Znajdź "Powiadomienia"\n' +
              '3. Zmień na "Zezwalaj"');
        setIsLoading(false);
        return false;
      }
      
      setIsLoading(false);
      return false;
    } catch (error) {
      console.error('Błąd żądania uprawnień:', error);
      setIsLoading(false);
      return false;
    }
  };

  // Inicjalizuj przy starcie jeśli uprawnienia są już przyznane
  useEffect(() => {
    if (permission === 'granted' && !fcmToken && currentUser?.id) {
      getFcmToken().then(token => {
        if (token && db) {
          saveTokenToFirestore(currentUser.id, token);
        }
      });
    }
  }, [permission, fcmToken, currentUser, db, getFcmToken, saveTokenToFirestore]);

  return {
    isSupported,
    permission,
    fcmToken,
    isLoading,
    requestPermission
  };
};

// ============================================
// KOMPONENT - USTAWIENIA POWIADOMIEŃ
// ============================================
const NotificationSettings = ({ currentUser, onNotificationReceived }) => {
  const [dbInstance, setDbInstance] = useState(null);
  
  // Pobierz db dynamicznie
  useEffect(() => {
    const loadDb = async () => {
      try {
        const { db } = await import('./firebase');
        setDbInstance(db);
      } catch (error) {
        console.error('Błąd ładowania Firebase:', error);
      }
    };
    loadDb();
  }, []);
  
  const { isSupported, permission, isLoading, requestPermission } = 
    usePushNotifications(currentUser, dbInstance, onNotificationReceived);
  
  // Sprawdź czy to iOS bez zainstalowanej PWA
  const isIOSWithoutPWA = /iPad|iPhone|iPod/.test(navigator.userAgent) && 
                          !window.matchMedia('(display-mode: standalone)').matches;
  
  if (!isSupported) {
    return (
      <div className="notification-setting">
        <div className="notification-setting-header">
          <span className="notification-icon">🔔</span>
          <span className="notification-label">Powiadomienia push</span>
        </div>
        <div className="notification-status not-supported">
          ⚠️ Nieobsługiwane w tej przeglądarce
        </div>
      </div>
    );
  }
  
  if (isIOSWithoutPWA) {
    return (
      <div className="notification-setting">
        <div className="notification-setting-header">
          <span className="notification-icon">🔔</span>
          <span className="notification-label">Powiadomienia push</span>
        </div>
        <div className="notification-status ios-info">
          📱 Zainstaluj aplikację (Dodaj do ekranu) aby włączyć powiadomienia
        </div>
      </div>
    );
  }
  
  return (
    <div className="notification-setting">
      <div className="notification-setting-header">
        <span className="notification-icon">🔔</span>
        <span className="notification-label">Powiadomienia push</span>
      </div>
      
      {permission === 'granted' ? (
        <div className="notification-status enabled">
          ✅ Włączone
        </div>
      ) : permission === 'denied' ? (
        <div className="notification-status denied">
          ❌ Zablokowane
          <small>Zmień w ustawieniach przeglądarki</small>
        </div>
      ) : (
        <button 
          onClick={requestPermission} 
          className="btn-enable-notifications"
          disabled={isLoading}
        >
          {isLoading ? '⏳ Włączanie...' : '🔔 Włącz powiadomienia'}
        </button>
      )}
    </div>
  );
};

// Funkcja wysyłania emaila przez MailerSend (via Vercel API)
// attachments: [{ filename: 'plik.pdf', content: 'base64...', type: 'application/pdf' }]
const sendEmailViaMailerSend = async (toEmail, toName, subject, textContent, htmlContent = null, attachments = []) => {
  try {
    // Walidacja adresu email
    if (!toEmail || !toEmail.includes('@') || !toEmail.includes('.')) {
      console.error('Nieprawidłowy adres email:', toEmail);
      return { success: false, error: 'Nieprawidłowy adres email' };
    }
    
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        toEmail: toEmail.trim(),
        toName: toName || 'Klient',
        subject,
        textContent,
        htmlContent: htmlContent || textContent.replace(/\n/g, '<br>'),
        attachments
      })
    });

    // Sprawdź czy odpowiedź jest OK
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Błąd serwera:', response.status, errorText);
      return { success: false, error: `Błąd serwera (${response.status}). Sprawdź konfigurację API email.` };
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('Email wysłany pomyślnie!');
      return { success: true };
    } else {
      console.error('Błąd wysyłania emaila:', data.error || data.message);
      return { success: false, error: data.error || data.message || 'Błąd wysyłania' };
    }
  } catch (error) {
    console.error('Błąd połączenia:', error);
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      return { success: false, error: 'Brak połączenia z serwerem email. Sprawdź konfigurację API.' };
    }
    return { success: false, error: error.message || 'Błąd połączenia z serwerem' };
  }
};


// ============================================
// INTEGRACJA wFIRMA API
// ============================================

// Klucze API wFirma są bezpiecznie przechowywane w Vercel Environment Variables:
// WFIRMA_ACCESS_KEY, WFIRMA_SECRET_KEY, WFIRMA_COMPANY_ID

const createWFirmaInvoice = async (orderData, invoiceType = 'normal') => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Przygotuj pozycje faktury - ceny BRUTTO (wFirma sama przeliczy na netto)
    const invoiceContents = [];
    
    // Pobierz cenę całkowitą z platnosci
    const cenaCalkowita = parseFloat(orderData.platnosci?.cenaCalkowita) || 0;
    
    // Pobierz kwotę zapłaconą
    const zaplacono = parseFloat(orderData.platnosci?.zaplacono) || 0;
    
    // Waluta
    const waluta = orderData.platnosci?.waluta || 'PLN';
    
    if (orderData.produkty && orderData.produkty.length > 0) {
      orderData.produkty.forEach((prod, idx) => {
        // Cena dla klienta jest w polu "cenaKlienta" (z "a" na końcu!)
        const cenaBrutto = parseFloat(prod.cenaKlienta) || 
                          parseFloat(prod.koszty?.cenaKlienta) ||
                          parseFloat(prod.koszty?.cenaKlient) || 
                          parseFloat(prod.cena) || 0;
        
        invoiceContents.push({
          invoicecontent: {
            name: prod.towar || prod.nazwa || `Produkt ${idx + 1}`,
            unit: 'szt.',
            count: 1,
            price: cenaBrutto,
            vat: '23'
          }
        });
      });
    } else {
      // Pojedyncze zamówienie bez produktów - użyj ceny całkowitej
      invoiceContents.push({
        invoicecontent: {
          name: orderData.towar || orderData.nazwa || 'Zamówienie ' + (orderData.nrWlasny || ''),
          unit: 'szt.',
          count: 1,
          price: cenaCalkowita,
          vat: '23'
        }
      });
    }
    
    // Przygotuj dane kontrahenta
    const clientName = orderData.klient?.imie || 'Klient';
    const nameParts = clientName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Parsuj adres (zakładam format: ulica numer, kod miasto)
    const adres = orderData.klient?.adres || '';
    let street = adres;
    let city = '';
    let zip = '';
    
    // Próba sparsowania adresu
    const adresParts = adres.split(',');
    if (adresParts.length >= 2) {
      street = adresParts[0].trim();
      const cityPart = adresParts[1].trim();
      const zipMatch = cityPart.match(/(\d{2}-\d{3}|\d{5})/);
      if (zipMatch) {
        zip = zipMatch[1];
        city = cityPart.replace(zip, '').trim();
      } else {
        city = cityPart;
      }
    }
    
    // Dane faktury - typ: 'normal' (faktura VAT) lub 'proforma'
    const invoiceData = {
      invoice: {
        contractor: {
          name: clientName,
          altname: `${firstName} ${lastName}`.trim(),
          street: street,
          city: city || 'Nieznane',
          zip: zip || '00-000',
          country: 'PL',
          email: orderData.klient?.email || '',
          phone: orderData.klient?.telefon || '',
          tax_id_type: 'none'
        },
        type: invoiceType, // 'normal' = Faktura VAT, 'proforma' = Proforma
        date: today,
        paymentdate: today,
        paymentmethod: 'transfer',
        alreadypaid: invoiceType === 'proforma' ? 0 : zaplacono, // Proforma nie ma zaliczki
        currency: waluta === 'EUR' ? 'EUR' : 'PLN',
        description: `Zamówienie nr ${orderData.nrWlasny || ''}`,
        invoicecontents: invoiceContents
      }
    };
    
    // Wywołaj API wFirma przez nasz backend (proxy)
    const response = await fetch('/api/wfirma', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'createInvoice',
        data: invoiceData
      })
    });
    
    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error || errorData.fullResponse ? JSON.stringify(errorData.fullResponse || errorData, null, 2) : '';
        console.error('Błąd wFirma:', errorData);
        return { success: false, error: errorData.error || `Błąd serwera (${response.status})`, details: errorDetails };
      } catch (e) {
        const errorText = await response.text();
        console.error('Błąd wFirma:', errorText);
        return { success: false, error: `Błąd serwera (${response.status}): ${errorText.substring(0, 200)}` };
      }
    }
    
    const result = await response.json();
    
    if (result.success) {
      const docType = invoiceType === 'proforma' ? 'Proforma' : 'Faktura';
      return { 
        success: true, 
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        message: `${docType} ${result.invoiceNumber || ''} została utworzona!`
      };
    } else {
      return { success: false, error: result.error || 'Błąd tworzenia dokumentu' };
    }
    
  } catch (error) {
    console.error('Błąd wFirma:', error);
    return { success: false, error: error.message || 'Błąd połączenia z wFirma' };
  }
};


// ============================================
// KONFIGURACJA
// ============================================


const COUNTRIES = [
  { code: 'PL', name: 'Polska', flag: '🇵🇱' },
  { code: 'DE', name: 'Niemcy', flag: '🇩🇪' },
  { code: 'GB', name: 'Wielka Brytania', flag: '🇬🇧' },
  { code: 'FR', name: 'Francja', flag: '🇫🇷' },
  { code: 'NL', name: 'Holandia', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgia', flag: '🇧🇪' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹' },
  { code: 'CH', name: 'Szwajcaria', flag: '🇨🇭' },
  { code: 'IT', name: 'Włochy', flag: '🇮🇹' },
  { code: 'ES', name: 'Hiszpania', flag: '🇪🇸' },
  { code: 'CZ', name: 'Czechy', flag: '🇨🇿' },
  { code: 'SK', name: 'Słowacja', flag: '🇸🇰' },
  { code: 'SE', name: 'Szwecja', flag: '🇸🇪' },
  { code: 'NO', name: 'Norwegia', flag: '🇳🇴' },
  { code: 'DK', name: 'Dania', flag: '🇩🇰' },
  { code: 'IE', name: 'Irlandia', flag: '🇮🇪' },
  { code: 'PT', name: 'Portugalia', flag: '🇵🇹' },
  { code: 'GR', name: 'Grecja', flag: '🇬🇷' },
  { code: 'HU', name: 'Węgry', flag: '🇭🇺' },
  { code: 'RO', name: 'Rumunia', flag: '🇷🇴' },
  { code: 'BG', name: 'Bułgaria', flag: '🇧🇬' },
  { code: 'HR', name: 'Chorwacja', flag: '🇭🇷' },
  { code: 'SI', name: 'Słowenia', flag: '🇸🇮' },
  { code: 'LT', name: 'Litwa', flag: '🇱🇹' },
  { code: 'LV', name: 'Łotwa', flag: '🇱🇻' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪' },
  { code: 'UA', name: 'Ukraina', flag: '🇺🇦' },
  { code: 'US', name: 'USA', flag: '🇺🇸' },
  { code: 'CA', name: 'Kanada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'OTHER', name: 'Inny', flag: '🌍' },
];

const CURRENCIES = [
  { code: 'PLN', symbol: 'zł' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'USD', symbol: '$' },
  { code: 'CHF', symbol: 'CHF' },
  { code: 'CZK', symbol: 'Kč' },
  { code: 'SEK', symbol: 'kr' },
  { code: 'NOK', symbol: 'kr' },
  { code: 'DKK', symbol: 'kr' },
  { code: 'HUF', symbol: 'Ft' },
  { code: 'RON', symbol: 'lei' },
  { code: 'UAH', symbol: '₴' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'AUD', symbol: 'A$' },
];

const PAYMENT_METHODS = ['Gotówka', 'Przelew bankowy', 'Karta płatnicza', 'PayPal', 'Pobranie przy odbiorze', 'BLIK', 'Rata'];

// Metody płatności przy dostawie (dla kierowcy)
const DELIVERY_PAYMENT_METHODS = [
  { id: 'brak', name: 'Brak płatności przy dostawie', icon: '✅', description: 'Klient już zapłacił całość' },
  { id: 'gotowka', name: 'Gotówka', icon: '💵', description: 'Kierowca pobiera gotówkę' },
  { id: 'przelew', name: 'Przelew przy dostawie', icon: '🏦', description: 'Klient robi przelew na miejscu' },
  { id: 'humm', name: 'Humm (raty)', icon: '📱', description: 'Płatność przez Humm' },
  { id: 'karta', name: 'Karta płatnicza', icon: '💳', description: 'Płatność kartą (terminal)' },
  { id: 'blik', name: 'BLIK', icon: '📲', description: 'Płatność BLIK' },
  { id: 'inna', name: 'Inna metoda', icon: '📝', description: 'Opisz w uwagach' },
];

// eslint-disable-next-line no-unused-vars
const getDeliveryPaymentMethod = (id) => DELIVERY_PAYMENT_METHODS.find(m => m.id === id) || DELIVERY_PAYMENT_METHODS[0];

const STATUSES = [
  { id: 'nowe', name: 'Nowe zamówienie', color: '#059669', bgColor: '#D1FAE5', icon: '🆕' },
  { id: 'potwierdzone', name: 'Potwierdzone', color: '#2563EB', bgColor: '#DBEAFE', icon: '✅' },
  { id: 'w_produkcji', name: 'W produkcji', color: '#D97706', bgColor: '#FEF3C7', icon: '🏭' },
  { id: 'gotowe_do_odbioru', name: 'Gotowe do odbioru', color: '#7C3AED', bgColor: '#EDE9FE', icon: '📦' },
  { id: 'odebrane', name: 'Odebrane od producenta', color: '#0891B2', bgColor: '#CFFAFE', icon: '🚚' },
  { id: 'w_transporcie', name: 'W transporcie', color: '#EC4899', bgColor: '#FCE7F3', icon: '🚗' },
  { id: 'dostarczone', name: 'Dostarczone', color: '#10B981', bgColor: '#ECFDF5', icon: '✔️' },
];

const COMPLAINT_STATUSES = [
  { id: 'nowa', name: 'Nowa reklamacja', color: '#DC2626', bgColor: '#FEE2E2', icon: '🆕' },
  { id: 'w_trakcie', name: 'W trakcie rozpatrywania', color: '#D97706', bgColor: '#FEF3C7', icon: '🔍' },
  { id: 'oczekuje', name: 'Oczekuje na producenta', color: '#7C3AED', bgColor: '#EDE9FE', icon: '⏳' },
  { id: 'rozwiazana', name: 'Rozwiązana', color: '#10B981', bgColor: '#ECFDF5', icon: '✅' },
  { id: 'odrzucona', name: 'Odrzucona', color: '#64748B', bgColor: '#F1F5F9', icon: '❌' },
];

const getComplaintStatus = (id) => COMPLAINT_STATUSES.find(s => s.id === id) || COMPLAINT_STATUSES[0];

// Funkcje dla terminu reklamacji (14 dni)
const COMPLAINT_DEADLINE_DAYS = 14;

const getComplaintDaysLeft = (createdAt) => {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  const deadline = new Date(created);
  deadline.setDate(deadline.getDate() + COMPLAINT_DEADLINE_DAYS);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
};

const getDeadlineStyle = (daysLeft) => {
  if (daysLeft === null) return null;
  if (daysLeft <= 0) return { bg: '#DC2626', color: 'white', label: 'TERMIN MINĄŁ!', urgent: true };
  if (daysLeft <= 2) return { bg: '#DC2626', color: 'white', label: `${daysLeft} dni`, urgent: true };
  if (daysLeft <= 5) return { bg: '#F59E0B', color: 'white', label: `${daysLeft} dni`, urgent: false };
  return { bg: '#10B981', color: 'white', label: `${daysLeft} dni`, urgent: false };
};

const COMPLAINT_TYPES = [
  { id: 'uszkodzenie', name: 'Uszkodzenie towaru', icon: '💥' },
  { id: 'bledny_produkt', name: 'Błędny produkt', icon: '❌' },
  { id: 'brakujace', name: 'Brakujące elementy', icon: '🔧' },
  { id: 'jakosc', name: 'Wady jakościowe', icon: '⚠️' },
  { id: 'dostawa', name: 'Problem z dostawą', icon: '🚚' },
  { id: 'inne', name: 'Inne', icon: '📋' },
];

const getComplaintType = (id) => COMPLAINT_TYPES.find(t => t.id === id) || COMPLAINT_TYPES[5];

const USER_ROLES = [
  { id: 'admin', name: 'Administrator', icon: '👑' },
  { id: 'worker', name: 'Pracownik', icon: '👤' },
  { id: 'driver', name: 'Kierowca', icon: '🚚' },
  { id: 'contractor', name: 'Kontrahent', icon: '🏢' },
];

// ============================================
// FUNKCJE POMOCNICZE
// ============================================

const getCountry = (code) => COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
const getCurrency = (code) => CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
const getStatus = (id) => STATUSES.find(s => s.id === id) || STATUSES[0];
const getRole = (id) => USER_ROLES.find(r => r.id === id) || USER_ROLES[1];

const getDaysUntilPickup = (dateStr) => {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pickupDate = new Date(dateStr); pickupDate.setHours(0, 0, 0, 0);
  return Math.ceil((pickupDate - today) / (1000 * 60 * 60 * 24));
};

const getUrgencyStyle = (days) => {
  if (days === null) return null;
  if (days <= 0) return { bg: '#FEE2E2', color: '#DC2626', label: days === 0 ? 'DZIŚ!' : Math.abs(days) + 'd temu', blink: days === 0 };
  if (days <= 3) return { bg: '#FEE2E2', color: '#DC2626', label: days + 'd', blink: false };
  if (days <= 7) return { bg: '#FFEDD5', color: '#EA580C', label: days + 'd', blink: false };
  return { bg: '#D1FAE5', color: '#059669', label: days + 'd', blink: false };
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('pl-PL') : '—';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const formatCurrency = (amt, cur = 'PLN') => {
  if (amt === null || amt === undefined) return '—';
  const currency = getCurrency(cur);
  return amt.toLocaleString('pl-PL') + ' ' + currency.symbol;
};

const generateOrderNumber = (orders, countryCode) => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const prefix = `/${month}/${year}/${countryCode}`;
  let maxNum = 0;
  orders.forEach(o => {
    if (o.nrWlasny?.includes(prefix)) {
      const match = o.nrWlasny.match(/^(\d+)\//);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    }
  });
  return `${maxNum + 1}${prefix}`;
};

// Generowanie numeru reklamacji: REK-[rok]-[numer]
const generateComplaintNumber = (complaints) => {
  const now = new Date();
  const year = now.getFullYear();
  let maxNum = 0;
  complaints.forEach(c => {
    if (c.numer?.startsWith(`REK-${year}-`)) {
      const num = parseInt(c.numer.split('-')[2]);
      if (num > maxNum) maxNum = num;
    }
  });
  return `REK-${year}-${String(maxNum + 1).padStart(4, '0')}`;
};

const calcPaymentSums = (orders) => {
  const sums = {};
  orders.forEach(o => {
    if (o.platnosci?.doZaplaty > 0) {
      const cur = o.platnosci.waluta || 'PLN';
      sums[cur] = (sums[cur] || 0) + o.platnosci.doZaplaty;
    }
  });
  return sums;
};

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) { }
};

// ============================================
// EKRAN LOGOWANIA
// ============================================

const LoginScreen = ({ onLogin, users, loading }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      localStorage.setItem('herratonUser', JSON.stringify(user));
      onLogin(user);
    } else {
      setError('Nieprawidłowy login lub hasło');
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-logo">📦</div>
          <h1 className="loading-title">Herraton</h1>
          <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
          </div>
          <p className="loading-text">Trwa ładowanie danych...</p>
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">📦</div>
        <h1>Herraton</h1>
        <p className="login-subtitle">System Zarządzania Zamówieniami v2</p>
        <div className="form-group">
          <label>LOGIN</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} placeholder="Wpisz login..." />
        </div>
        <div className="form-group">
          <label>HASŁO</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} placeholder="Wpisz hasło..." />
        </div>
        {error && <div className="error-message">⚠️ {error}</div>}
        <button className="btn-primary btn-full" onClick={handleLogin}>Zaloguj się</button>
        <div className="login-demo">
          <strong>Konta demo:</strong><br />
          👑 admin / admin123<br />
          👤 jan / jan123<br />
          🚚 kierowca1 / kierowca123<br />
          🏢 kontrahent1 / kontr123
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL POWIADOMIEŃ - POPRAWIONY
// ============================================

const NotificationsPanel = ({ notifications, onClose, onResolve, onDelete, onOrderClick, onClearAll }) => {
  const [expanded, setExpanded] = useState(null);
  const unresolved = notifications.filter(n => !n.resolved).length;

  return (
    <div className="notifications-panel">
      <div className="notifications-header">
        <h3>🔔 Powiadomienia ({unresolved})</h3>
        <div className="notifications-header-actions">
          {notifications.length > 0 && (
            <button className="btn-small btn-danger" onClick={onClearAll}>🗑️ Wyczyść wszystko</button>
          )}
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="notifications-empty">Brak powiadomień</div>
        ) : (
          notifications.map(n => (
            <div key={n.id} className={`notification-item ${n.resolved ? 'resolved' : ''}`}>
              <div className="notification-main" onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                <span className="notification-icon">{n.icon || '🔔'}</span>
                <div className="notification-content">
                  <div className="notification-title">{n.title}</div>
                  <div className="notification-time">{formatDateTime(n.createdAt)}</div>
                </div>
                <span className="notification-arrow">{expanded === n.id ? '▲' : '▼'}</span>
              </div>
              {expanded === n.id && (
                <div className="notification-details">
                  <p className="notification-message">{n.message}</p>
                  <div className="notification-actions">
                    {n.orderId && (
                      <button className="btn-small" onClick={() => onOrderClick(n.orderId)}>📋 Zobacz zamówienie</button>
                    )}
                    {!n.resolved && (
                      <button className="btn-small btn-success" onClick={() => onResolve(n.id)}>✓ Załatwione</button>
                    )}
                    <button className="btn-small btn-danger" onClick={() => onDelete(n.id)}>🗑️ Usuń</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================
// MODAL PODGLĄDU ZDJĘCIA - NOWY
// ============================================

const ImagePreviewModal = ({ src, onClose }) => {
  return (
    <div className="modal-overlay image-preview-overlay" onClick={onClose}>
      <div className="image-preview-content" onClick={e => e.stopPropagation()}>
        <button className="btn-close image-close" onClick={onClose}>×</button>
        <img src={src} alt="Podgląd" className="image-preview-img" />
      </div>
    </div>
  );
};

// ============================================
// PANEL HISTORII
// ============================================

const HistoryPanel = ({ historia, utworzonePrzez }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="history-panel">
      <button className="history-toggle" onClick={() => setOpen(!open)}>
        <span>📜 Historia ({historia?.length || 0})</span>
        <span className={`arrow ${open ? 'open' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="history-content">
          <div className="history-created">
            <span className="label">UTWORZONO</span>
            <div><strong>{utworzonePrzez?.nazwa}</strong> • {formatDateTime(utworzonePrzez?.data)}</div>
          </div>
          {historia?.slice().reverse().slice(0, 10).map((h, i) => (
            <div key={i} className="history-item">
              <div className="history-date">{formatDateTime(h.data)}</div>
              <div><strong>{h.uzytkownik}:</strong> {h.akcja}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// MODAL SZCZEGÓŁÓW ZAMÓWIENIA - Z POWIĘKSZANIEM ZDJĘĆ
// ============================================

const OrderDetailModal = ({ order, onClose, producers, drivers, onDelete, isContractor, selectedProductIndex, onUpdateOrder }) => {
  const [previewImage, setPreviewImage] = useState(null);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [showDeliveryEmailModal, setShowDeliveryEmailModal] = useState(false);
  const [deliveryEmailLang, setDeliveryEmailLang] = useState('pl');
  const [viewMode, setViewMode] = useState(selectedProductIndex !== null && selectedProductIndex !== undefined ? 'product' : 'all'); // 'all' lub 'product'
  const [activeProductIdx, setActiveProductIdx] = useState(selectedProductIndex || 0);
  const [expandedProtocols, setExpandedProtocols] = useState({});
  const [showComplaintLinkModal, setShowComplaintLinkModal] = useState(false);
  const [complaintLinkLang, setComplaintLinkLang] = useState('pl');
  
  // State do edycji rabatów przez admina
  const [editingDiscount, setEditingDiscount] = useState(null); // { productIndex, rabat } lub { global: true, rabat }
  const [discountEditAmount, setDiscountEditAmount] = useState('');
  const [discountEditReason, setDiscountEditReason] = useState('');
  
  const status = getStatus(order.status);
  const country = getCountry(order.kraj);
  const days = getDaysUntilPickup(order.dataOdbioru);
  const urgency = getUrgencyStyle(days);
  const producer = Object.values(producers).find(p => p.id === order.zaladunek);
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);
  
  const hasMultipleProducts = order.produkty && order.produkty.length > 1;
  
  // Funkcja edycji rabatu przez admina
  const handleEditDiscount = (rabat) => {
    setEditingDiscount(rabat); // Przekazujemy cały obiekt rabatu z wszystkimi informacjami
    setDiscountEditAmount(rabat.kwota?.toString() || '');
    setDiscountEditReason(rabat.powod || '');
  };
  
  // Funkcja zapisu edytowanego rabatu
  const handleSaveDiscount = async () => {
    if (!editingDiscount) return;
    
    const newAmount = parseFloat(discountEditAmount) || 0;
    const newReason = discountEditReason || 'Brak podanego powodu';
    
    try {
      const updateData = {
        historia: [...(order.historia || []), {
          data: new Date().toISOString(),
          uzytkownik: 'Admin',
          akcja: `Edycja rabatu: ${formatCurrency(newAmount, order.platnosci?.waluta)} - ${newReason}`
        }]
      };
      
      // Jeśli rabat pochodzi z produktu (ma productIndex)
      if (editingDiscount.productIndex !== undefined && editingDiscount.productIndex !== null && editingDiscount.zProduktu) {
        const updatedProdukty = order.produkty.map((p, idx) => {
          if (idx === editingDiscount.productIndex) {
            return {
              ...p,
              rabat: {
                ...p.rabat,
                kwota: newAmount,
                powod: newReason,
                edytowanyPrzez: 'Admin',
                dataEdycji: new Date().toISOString()
              }
            };
          }
          return p;
        });
        
        // Przelicz kwotę do zapłaty
        let sumaRabatow = 0;
        updatedProdukty.forEach(p => {
          if (p.rabat?.kwota > 0) sumaRabatow += p.rabat.kwota;
        });
        
        const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
        const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
        const originalDoZaplaty = cenaCalkowita - zaplacono;
        const newDoZaplaty = Math.max(0, originalDoZaplaty - sumaRabatow);
        
        updateData.produkty = updatedProdukty;
        updateData.platnosci = {
          ...order.platnosci,
          doZaplaty: newDoZaplaty,
          originalDoZaplaty: originalDoZaplaty,
          sumaRabatow: sumaRabatow
        };
      } 
      // Jeśli rabat pochodzi z rabatyKierowcow (ma kierowcaId ale nie zProduktu)
      else if (editingDiscount.kierowcaId && !editingDiscount.zProduktu && !editingDiscount.globalny) {
        const updatedRabatyKierowcow = {
          ...order.rabatyKierowcow,
          [editingDiscount.kierowcaId]: {
            ...order.rabatyKierowcow?.[editingDiscount.kierowcaId],
            kwota: newAmount,
            powod: newReason,
            edytowanyPrzez: 'Admin',
            dataEdycji: new Date().toISOString()
          }
        };
        
        updateData.rabatyKierowcow = updatedRabatyKierowcow;
        
        // Przelicz płatności
        const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
        const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
        const originalDoZaplaty = cenaCalkowita - zaplacono;
        const newDoZaplaty = Math.max(0, originalDoZaplaty - newAmount);
        
        updateData.platnosci = {
          ...order.platnosci,
          doZaplaty: newDoZaplaty,
          originalDoZaplaty: originalDoZaplaty,
          sumaRabatow: newAmount
        };
      }
      // Stary rabat globalny
      else {
        updateData.rabatPrzyDostawie = {
          ...order.rabatPrzyDostawie,
          kwota: newAmount,
          powod: newReason,
          edytowanyPrzez: 'Admin',
          dataEdycji: new Date().toISOString()
        };
        
        // Przelicz płatności
        const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
        const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
        const originalDoZaplaty = cenaCalkowita - zaplacono;
        const newDoZaplaty = Math.max(0, originalDoZaplaty - newAmount);
        
        updateData.platnosci = {
          ...order.platnosci,
          doZaplaty: newDoZaplaty,
          originalDoZaplaty: originalDoZaplaty,
          sumaRabatow: newAmount
        };
      }
      
      await onUpdateOrder(order.id, updateData);
      
      alert('Rabat został zaktualizowany!');
    } catch (error) {
      console.error('Błąd zapisu rabatu:', error);
      alert('Wystąpił błąd podczas zapisu rabatu');
    }
    
    setEditingDiscount(null);
    setDiscountEditAmount('');
    setDiscountEditReason('');
  };
  
  // Funkcja usunięcia rabatu
  const handleDeleteDiscount = async (productIndex, kierowcaId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć ten rabat?')) return;
    
    try {
      // Usuń rabat z produktu (ustawiamy null zamiast usuwać pole)
      let updatedProdukty = order.produkty ? [...order.produkty] : [];
      
      if (productIndex !== undefined && productIndex !== null) {
        updatedProdukty = updatedProdukty.map((p, idx) => {
          if (idx === productIndex) {
            return {
              ...p,
              rabat: null
            };
          }
          return p;
        });
      }
      
      // Przelicz kwotę do zapłaty
      let sumaRabatow = 0;
      updatedProdukty.forEach(p => {
        if (p.rabat?.kwota > 0) sumaRabatow += p.rabat.kwota;
      });
      
      const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
      const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
      const originalDoZaplaty = cenaCalkowita - zaplacono;
      const newDoZaplaty = Math.max(0, originalDoZaplaty - sumaRabatow);
      
      // Usuń też z rabatyKierowcow jeśli istnieje
      let updatedRabatyKierowcow = order.rabatyKierowcow ? { ...order.rabatyKierowcow } : {};
      if (kierowcaId && updatedRabatyKierowcow[kierowcaId]) {
        updatedRabatyKierowcow[kierowcaId] = null;
      }
      
      await onUpdateOrder(order.id, {
        produkty: updatedProdukty,
        rabatyKierowcow: updatedRabatyKierowcow,
        rabatPrzyDostawie: null, // Usuń też stary globalny rabat
        platnosci: {
          ...order.platnosci,
          doZaplaty: newDoZaplaty,
          originalDoZaplaty: originalDoZaplaty,
          sumaRabatow: sumaRabatow,
          rabat: 0
        },
        historia: [...(order.historia || []), {
          data: new Date().toISOString(),
          uzytkownik: 'Admin',
          akcja: 'Usunięto rabat'
        }]
      });
      
      alert('Rabat został usunięty!');
      // Modal pozostaje otwarty - dane się same odświeżą przez Firebase
    } catch (error) {
      console.error('Błąd usuwania rabatu:', error);
      alert('Wystąpił błąd podczas usuwania rabatu');
    }
  };
  
  // Grupuj protokoły per kierowca - BEZ protokołu głównego
  const getProtocolsByDriver = () => {
    const protocols = {};
    
    if (order.produkty && order.produkty.length > 0) {
      order.produkty.forEach((prod, idx) => {
        const driverId = prod.kierowca;
        if (!driverId) return;
        
        if (!protocols[driverId]) {
          const driverInfo = drivers.find(d => d.id === driverId);
          protocols[driverId] = {
            driverName: driverInfo?.name || 'Nieznany kierowca',
            products: [],
            zdjeciaOdbioru: [],
            zdjeciaDostawy: [],
            podpisy: [],
            uwagi: [],
            rabat: null
          };
        }
        
        protocols[driverId].products.push({ ...prod, index: idx });
        
        // Zbierz protokoły z produktów
        if (prod.protokol?.zdjeciaOdbioru) {
          protocols[driverId].zdjeciaOdbioru.push(...prod.protokol.zdjeciaOdbioru);
        }
        if (prod.protokol?.zdjeciaDostawy) {
          protocols[driverId].zdjeciaDostawy.push(...prod.protokol.zdjeciaDostawy);
        }
        if (prod.protokol?.podpis) {
          protocols[driverId].podpisy.push({ productIdx: idx, podpis: prod.protokol.podpis, uwagi: prod.protokol.uwagiKlienta });
        }
        if (prod.protokol?.uwagiKlienta) {
          protocols[driverId].uwagi.push({ productIdx: idx, uwagi: prod.protokol.uwagiKlienta });
        }
        
        // Rabat kierowcy
        if (prod.rabat) {
          protocols[driverId].rabat = prod.rabat;
        }
      });
      
      // Dodaj rabaty z rabatyKierowcow jeśli nie ma w produktach - filtruj null
      if (order.rabatyKierowcow) {
        Object.entries(order.rabatyKierowcow).forEach(([driverId, rabat]) => {
          if (rabat && rabat.kwota > 0 && protocols[driverId] && !protocols[driverId].rabat) {
            protocols[driverId].rabat = rabat;
          }
        });
      }
    }
    
    return protocols;
  };
  
  const toggleProtocol = (driverId) => {
    setExpandedProtocols(prev => ({ ...prev, [driverId]: !prev[driverId] }));
  };

  const handleDelete = () => {
    if (window.confirm(`Czy na pewno chcesz usunąć zamówienie ${order.nrWlasny}?`)) {
      onDelete(order.id);
      onClose();
    }
  };

  // Tłumaczenia emaila dostawy
  const DELIVERY_EMAIL_TRANSLATIONS = {
    pl: {
      subject: 'Potwierdzenie dostawy zamówienia nr',
      greeting: 'Szanowny/a',
      client: 'Kliencie',
      intro: 'Potwierdzamy dostawę Twojego zamówienia.',
      title: 'POTWIERDZENIE DOSTAWY',
      orderNumber: 'Numer zamówienia',
      deliveryDate: 'Data dostawy',
      driver: 'Kierowca',
      product: 'Produkt',
      paymentTitle: 'POTWIERDZENIE PŁATNOŚCI',
      paidToDriver: 'została zapłacona kierowcy dnia',
      protocolInfo: 'W załączniku przesyłamy protokół odbioru towaru.',
      photosInfo: 'Zdjęcia z dostawy dostępne są w systemie.',
      thanks: 'Dziękujemy za zakupy!',
      welcome: 'Zapraszamy ponownie.',
      regards: 'Pozdrawiamy',
      team: 'Zespół obsługi zamówień'
    },
    en: {
      subject: 'Delivery confirmation for order no.',
      greeting: 'Dear',
      client: 'Customer',
      intro: 'We confirm the delivery of your order.',
      title: 'DELIVERY CONFIRMATION',
      orderNumber: 'Order number',
      deliveryDate: 'Delivery date',
      driver: 'Driver',
      product: 'Product',
      paymentTitle: 'PAYMENT CONFIRMATION',
      paidToDriver: 'was paid to the driver on',
      protocolInfo: 'Please find attached the goods receipt protocol.',
      photosInfo: 'Delivery photos are available in the system.',
      thanks: 'Thank you for your purchase!',
      welcome: 'We look forward to serving you again.',
      regards: 'Best regards',
      team: 'Order Service Team'
    },
    de: {
      subject: 'Lieferbestätigung für Bestellung Nr.',
      greeting: 'Sehr geehrte/r',
      client: 'Kunde',
      intro: 'Wir bestätigen die Lieferung Ihrer Bestellung.',
      title: 'LIEFERBESTÄTIGUNG',
      orderNumber: 'Bestellnummer',
      deliveryDate: 'Lieferdatum',
      driver: 'Fahrer',
      product: 'Produkt',
      paymentTitle: 'ZAHLUNGSBESTÄTIGUNG',
      paidToDriver: 'wurde am folgenden Tag an den Fahrer bezahlt',
      protocolInfo: 'Im Anhang finden Sie das Warenempfangsprotokoll.',
      photosInfo: 'Lieferfotos sind im System verfügbar.',
      thanks: 'Vielen Dank für Ihren Einkauf!',
      welcome: 'Wir freuen uns auf Ihren nächsten Besuch.',
      regards: 'Mit freundlichen Grüßen',
      team: 'Bestellservice-Team'
    },
    es: {
      subject: 'Confirmación de entrega del pedido nº',
      greeting: 'Estimado/a',
      client: 'Cliente',
      intro: 'Confirmamos la entrega de su pedido.',
      title: 'CONFIRMACIÓN DE ENTREGA',
      orderNumber: 'Número de pedido',
      deliveryDate: 'Fecha de entrega',
      driver: 'Conductor',
      product: 'Producto',
      paymentTitle: 'CONFIRMACIÓN DE PAGO',
      paidToDriver: 'fue pagado al conductor el día',
      protocolInfo: 'Adjuntamos el protocolo de recepción de mercancías.',
      photosInfo: 'Las fotos de la entrega están disponibles en el sistema.',
      thanks: '¡Gracias por su compra!',
      welcome: 'Esperamos volver a atenderle.',
      regards: 'Saludos cordiales',
      team: 'Equipo de servicio de pedidos'
    },
    nl: {
      subject: 'Leveringsbevestiging voor bestelling nr.',
      greeting: 'Geachte',
      client: 'Klant',
      intro: 'Wij bevestigen de levering van uw bestelling.',
      title: 'LEVERINGSBEVESTIGING',
      orderNumber: 'Bestelnummer',
      deliveryDate: 'Leverdatum',
      driver: 'Chauffeur',
      product: 'Product',
      paymentTitle: 'BETALINGSBEVESTIGING',
      paidToDriver: 'is op de volgende datum aan de chauffeur betaald',
      protocolInfo: 'In de bijlage vindt u het ontvangstprotocol.',
      photosInfo: 'Leveringsfoto\'s zijn beschikbaar in het systeem.',
      thanks: 'Bedankt voor uw aankoop!',
      welcome: 'Wij zien u graag terug.',
      regards: 'Met vriendelijke groet',
      team: 'Bestelservice Team'
    }
  };

  // Funkcja wysyłania potwierdzenia dostawy (dla admina/pracownika)
  const sendDeliveryEmail = () => {
    const t = DELIVERY_EMAIL_TRANSLATIONS[deliveryEmailLang] || DELIVERY_EMAIL_TRANSLATIONS.pl;
    const walutaSymbol = CURRENCIES.find(c => c.code === order.platnosci?.waluta)?.symbol || 'zł';
    const zaplacono = order.platnosci?.zaplacono || 0;
    const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
    const dataPlatnosci = order.potwierdzenieDostawy?.data || new Date().toISOString();
    const hasPhotos = order.zdjeciaDostawy && order.zdjeciaDostawy.length > 0;
    const hasSignature = order.podpisKlienta;
    const driverName = driver?.name || order.potwierdzenieDostawy?.kierowca || '-';
    
    // Tłumaczenia protokołu
    const PROTOCOL_TRANS = {
      pl: {
        protocolTitle: 'PROTOKÓŁ ODBIORU TOWARU',
        orderNumber: 'Nr zamówienia',
        product: 'Produkt',
        value: 'Wartość',
        recipient: 'Odbiorca',
        address: 'Adres dostawy',
        deliveryDate: 'Data dostawy',
        driver: 'Kierowca',
        declaration: 'Potwierdzam odbiór powyższego towaru. Towar został sprawdzony w obecności kierowcy.',
        clientRemarks: 'Uwagi klienta',
        noRemarks: 'Brak uwag - produkt zaakceptowany bez zastrzeżeń',
        signature: 'Podpis klienta: ZŁOŻONY ELEKTRONICZNIE',
        noSignature: 'Podpis klienta: OCZEKUJE NA PODPIS'
      },
      en: {
        protocolTitle: 'GOODS RECEIPT PROTOCOL',
        orderNumber: 'Order number',
        product: 'Product',
        value: 'Value',
        recipient: 'Recipient',
        address: 'Delivery address',
        deliveryDate: 'Delivery date',
        driver: 'Driver',
        declaration: 'I confirm receipt of the above goods. The goods have been inspected in the presence of the driver.',
        clientRemarks: 'Client remarks',
        noRemarks: 'No remarks - product accepted without reservations',
        signature: 'Client signature: SIGNED ELECTRONICALLY',
        noSignature: 'Client signature: AWAITING SIGNATURE'
      },
      de: {
        protocolTitle: 'WARENEMPFANGSPROTOKOLL',
        orderNumber: 'Bestellnummer',
        product: 'Produkt',
        value: 'Wert',
        recipient: 'Empfänger',
        address: 'Lieferadresse',
        deliveryDate: 'Lieferdatum',
        driver: 'Fahrer',
        declaration: 'Ich bestätige den Empfang der oben genannten Waren. Die Ware wurde in Anwesenheit des Fahrers geprüft.',
        clientRemarks: 'Kundenanmerkungen',
        noRemarks: 'Keine Anmerkungen - Produkt ohne Vorbehalt akzeptiert',
        signature: 'Kundenunterschrift: ELEKTRONISCH UNTERSCHRIEBEN',
        noSignature: 'Kundenunterschrift: WARTET AUF UNTERSCHRIFT'
      },
      es: {
        protocolTitle: 'PROTOCOLO DE RECEPCIÓN DE MERCANCÍAS',
        orderNumber: 'Número de pedido',
        product: 'Producto',
        value: 'Valor',
        recipient: 'Destinatario',
        address: 'Dirección de entrega',
        deliveryDate: 'Fecha de entrega',
        driver: 'Conductor',
        declaration: 'Confirmo la recepción de la mercancía anterior. La mercancía ha sido inspeccionada en presencia del conductor.',
        clientRemarks: 'Observaciones del cliente',
        noRemarks: 'Sin observaciones - producto aceptado sin reservas',
        signature: 'Firma del cliente: FIRMADO ELECTRÓNICAMENTE',
        noSignature: 'Firma del cliente: ESPERANDO FIRMA'
      },
      nl: {
        protocolTitle: 'ONTVANGSTPROTOCOL',
        orderNumber: 'Bestelnummer',
        product: 'Product',
        value: 'Waarde',
        recipient: 'Ontvanger',
        address: 'Afleveradres',
        deliveryDate: 'Leverdatum',
        driver: 'Chauffeur',
        declaration: 'Ik bevestig de ontvangst van bovenstaande goederen. De goederen zijn geïnspecteerd in aanwezigheid van de chauffeur.',
        clientRemarks: 'Opmerkingen klant',
        noRemarks: 'Geen opmerkingen - product zonder voorbehoud geaccepteerd',
        signature: 'Handtekening klant: ELEKTRONISCH ONDERTEKEND',
        noSignature: 'Handtekening klant: WACHT OP HANDTEKENING'
      }
    };
    
    const pt = PROTOCOL_TRANS[deliveryEmailLang] || PROTOCOL_TRANS.pl;
    
    const subject = `${t.subject} ${order.nrWlasny}`;
    
    let paymentInfo = '';
    if (zaplacono > 0) {
      paymentInfo = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 ${t.paymentTitle}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${zaplacono.toFixed(2)} ${walutaSymbol} ${t.paidToDriver} ${formatDate(dataPlatnosci)}.`;
    }
    
    // Protokół odbioru jako tekst
    const protocolText = `

═══════════════════════════════════════════════════════════
📋 ${pt.protocolTitle}
═══════════════════════════════════════════════════════════

${pt.orderNumber}: ${order.nrWlasny}
${pt.deliveryDate}: ${formatDate(dataPlatnosci)}
${pt.driver}: ${driverName}

───────────────────────────────────────────────────────────
${pt.product}:
${order.towar || '-'}

${pt.value}: ${cenaCalkowita.toFixed(2)} ${walutaSymbol}
───────────────────────────────────────────────────────────

${pt.recipient}: ${order.klient?.imie || '-'}
${pt.address}: ${order.klient?.adres || '-'}

───────────────────────────────────────────────────────────
${pt.declaration}

${pt.clientRemarks}: ${order.uwagiKlienta || pt.noRemarks}

${hasSignature ? pt.signature : pt.noSignature}
═══════════════════════════════════════════════════════════`;
    
    const body = `${t.greeting} ${order.klient?.imie || t.client},

${t.intro}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ${t.title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔢 ${t.orderNumber}: ${order.nrWlasny}
📅 ${t.deliveryDate}: ${formatDate(dataPlatnosci)}
🚚 ${t.driver}: ${driverName}

📦 ${t.product}:
${order.towar || '-'}
${paymentInfo}
${protocolText}
${hasPhotos ? `\n📸 ${t.photosInfo} (${order.zdjeciaDostawy.length} zdjęć)` : ''}

${t.thanks}
${t.welcome}

${t.regards},
${t.team}

---
📧 Ta wiadomość została wysłana automatycznie. Prosimy nie odpowiadać na ten email.`;

    // Wyślij przez MailerSend
    sendEmailViaMailerSend(
      order.klient.email,
      order.klient.imie,
      subject,
      body
    ).then(result => {
      if (result.success) {
        alert('✅ Email z potwierdzeniem dostawy został wysłany!');
      } else {
        alert('❌ Błąd wysyłania emaila. Spróbuj ponownie.');
      }
    });
    
    setShowDeliveryEmailModal(false);
  };

  // Funkcja generująca email z potwierdzeniem
  const generateConfirmationEmail = () => {
    const walutaSymbol = CURRENCIES.find(c => c.code === order.platnosci?.waluta)?.symbol || 'zł';
    const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
    const zaplacono = order.platnosci?.zaplacono || 0;
    const doZaplaty = order.platnosci?.doZaplaty || (cenaCalkowita - zaplacono);
    
    const subject = `Potwierdzenie zamówienia nr ${order.nrWlasny}`;
    
    const body = `Szanowny/a ${order.klient?.imie || 'Kliencie'},

Dziękujemy za złożenie zamówienia! Poniżej znajdziesz szczegóły:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 POTWIERDZENIE ZAMÓWIENIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔢 Numer zamówienia: ${order.nrWlasny}
📅 Data zamówienia: ${formatDate(order.dataZlecenia)}

📦 OPIS PRODUKTÓW:
${order.towar || 'Brak opisu'}

📍 ADRES DOSTAWY:
${order.klient?.adres || 'Nie podano'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 PODSUMOWANIE PŁATNOŚCI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Wartość zamówienia: ${cenaCalkowita.toFixed(2)} ${walutaSymbol}
Wpłacono: ${zaplacono.toFixed(2)} ${walutaSymbol}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO ZAPŁATY: ${doZaplaty.toFixed(2)} ${walutaSymbol}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${doZaplaty > 0 ? `⚠️ Pozostała kwota do zapłaty: ${doZaplaty.toFixed(2)} ${walutaSymbol}` : '✅ Zamówienie w pełni opłacone!'}

W razie pytań prosimy o kontakt.

Pozdrawiamy,
Zespół obsługi zamówień`;

    return { subject, body };
  };

  const handleSendConfirmation = async () => {
    if (!order.klient?.email) {
      alert('Brak adresu email klienta!');
      return;
    }
    
    // Generuj token jeśli nie istnieje
    let clientToken = order.clientToken;
    if (!clientToken) {
      clientToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
    
    const confirmationLink = `${window.location.origin}/zamowienie/${clientToken}`;
    const customerName = order.klient.imie || 'Kliencie';
    
    // HTML email z linkiem do panelu - identyczny jak przy tworzeniu zamówienia
    const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); padding: 30px; text-align: center;">
              <div style="font-size: 50px; margin-bottom: 10px;">📦</div>
              <h1 style="color: white; margin: 0; font-size: 24px;">Potwierdź swoje zamówienie</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${order.nrWlasny}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Szanowny/a <strong>${customerName}</strong>,</p>
              <p style="margin: 0 0 20px 0; color: #6B7280; font-size: 15px; line-height: 1.6;">
                Dziękujemy za złożenie zamówienia! Prosimy o sprawdzenie danych i potwierdzenie zamówienia w panelu klienta.
              </p>
              
              <div style="background: #F3F4F6; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #374151; font-weight: 600;">📋 Podsumowanie:</p>
                <p style="margin: 5px 0; color: #6B7280;">Numer zamówienia: <strong>${order.nrWlasny}</strong></p>
                <p style="margin: 5px 0; color: #6B7280;">Kwota: <strong>${order.platnosci?.cenaCalkowita || 0} ${order.platnosci?.waluta || 'PLN'}</strong></p>
                ${order.dataDostawy ? `<p style="margin: 5px 0; color: #6B7280;">Planowana dostawa: <strong>${new Date(order.dataDostawy).toLocaleDateString('pl-PL')}</strong></p>` : ''}
              </div>
              
              <p style="margin: 20px 0; color: #374151; font-size: 15px; text-align: center;">
                <strong>👇 Kliknij poniższy przycisk aby sprawdzić szczegóły i potwierdzić zamówienie:</strong>
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${confirmationLink}" style="display: inline-block; background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 18px 50px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 18px;">✅ POTWIERDŹ ZAMÓWIENIE</a>
              </div>
              
              <div style="background: #FEF3C7; padding: 15px; border-radius: 10px; margin-top: 20px;">
                <p style="margin: 0; color: #92400E; font-size: 14px;">
                  💡 <strong>Zachowaj ten email!</strong> Po potwierdzeniu otrzymasz link do śledzenia statusu zamówienia.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px; background-color: #F9FAFB; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">Herraton • System obsługi zamówień</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    
    // Wyślij email
    const result = await sendEmailViaMailerSend(
      order.klient.email,
      order.klient.imie,
      `Potwierdź zamówienie ${order.nrWlasny}`,
      `Potwierdź swoje zamówienie: ${confirmationLink}`,
      htmlEmail
    );
    
    if (result.success) {
      // Zaktualizuj zamówienie z tokenem i flagą
      if (onUpdateOrder) {
        onUpdateOrder(order.id, {
          clientToken,
          wyslanieDoPotwierdzenia: true,
          dataWyslaniaDoPotwierdzenia: new Date().toISOString()
        });
      }
      alert('✅ Email z linkiem do potwierdzenia został wysłany do klienta!');
    } else {
      alert(`❌ Błąd wysyłania emaila: ${result.error || 'Nieznany błąd'}. Sprawdź adres email i spróbuj ponownie.`);
    }
    
    setShowEmailConfirmation(false);
  };

  // Funkcja pobierania protokołu PDF
  // Tłumaczenia protokołu
  const PROTOCOL_TRANSLATIONS = {
    pl: {
      title: 'PROTOKÓŁ ODBIORU TOWARU',
      orderNumber: 'Nr zamówienia',
      orderData: 'Dane zamówienia',
      product: 'Produkt',
      value: 'Wartość',
      recipientData: 'Dane odbiorcy',
      fullName: 'Imię i nazwisko',
      deliveryAddress: 'Adres dostawy',
      phone: 'Telefon',
      email: 'Email',
      deliveryData: 'Dane dostawy',
      deliveryDate: 'Data dostawy',
      deliveryTime: 'Godzina dostawy',
      driver: 'Kierowca',
      declaration: 'Ja, niżej podpisany/a, potwierdzam odbiór powyższego towaru. Towar został sprawdzony w obecności kierowcy.',
      clientRemarks: 'Uwagi klienta',
      noRemarks: 'Klient nie zgłosił uwag - produkt zaakceptowany bez zastrzeżeń',
      clientSignature: 'Podpis klienta',
      signatureDate: 'Data podpisu',
      generatedAuto: 'Dokument wygenerowany automatycznie z systemu Herraton',
      generatedDate: 'Data wygenerowania',
      polishCopy: 'KOPIA POLSKA'
    },
    en: {
      title: 'GOODS RECEIPT PROTOCOL',
      orderNumber: 'Order number',
      orderData: 'Order details',
      product: 'Product',
      value: 'Value',
      recipientData: 'Recipient details',
      fullName: 'Full name',
      deliveryAddress: 'Delivery address',
      phone: 'Phone',
      email: 'Email',
      deliveryData: 'Delivery details',
      deliveryDate: 'Delivery date',
      deliveryTime: 'Delivery time',
      driver: 'Driver',
      declaration: 'I, the undersigned, confirm receipt of the above goods. The goods have been inspected in the presence of the driver.',
      clientRemarks: 'Client remarks',
      noRemarks: 'No remarks from client - product accepted without reservations',
      clientSignature: 'Client signature',
      signatureDate: 'Signature date',
      generatedAuto: 'Document generated automatically from Herraton system',
      generatedDate: 'Generated date',
      polishCopy: 'POLISH COPY'
    },
    de: {
      title: 'WARENEMPFANGSPROTOKOLL',
      orderNumber: 'Bestellnummer',
      orderData: 'Bestelldaten',
      product: 'Produkt',
      value: 'Wert',
      recipientData: 'Empfängerdaten',
      fullName: 'Vollständiger Name',
      deliveryAddress: 'Lieferadresse',
      phone: 'Telefon',
      email: 'E-Mail',
      deliveryData: 'Lieferdaten',
      deliveryDate: 'Lieferdatum',
      deliveryTime: 'Lieferzeit',
      driver: 'Fahrer',
      declaration: 'Ich, der Unterzeichnende, bestätige den Empfang der oben genannten Waren. Die Ware wurde in Anwesenheit des Fahrers geprüft.',
      clientRemarks: 'Kundenanmerkungen',
      noRemarks: 'Keine Anmerkungen vom Kunden - Produkt ohne Vorbehalt akzeptiert',
      clientSignature: 'Kundenunterschrift',
      signatureDate: 'Unterschriftsdatum',
      generatedAuto: 'Dokument automatisch aus dem Herraton-System generiert',
      generatedDate: 'Erstellungsdatum',
      polishCopy: 'POLNISCHE KOPIE'
    },
    es: {
      title: 'PROTOCOLO DE RECEPCIÓN DE MERCANCÍAS',
      orderNumber: 'Número de pedido',
      orderData: 'Datos del pedido',
      product: 'Producto',
      value: 'Valor',
      recipientData: 'Datos del destinatario',
      fullName: 'Nombre completo',
      deliveryAddress: 'Dirección de entrega',
      phone: 'Teléfono',
      email: 'Correo electrónico',
      deliveryData: 'Datos de entrega',
      deliveryDate: 'Fecha de entrega',
      deliveryTime: 'Hora de entrega',
      driver: 'Conductor',
      declaration: 'Yo, el abajo firmante, confirmo la recepción de los bienes mencionados. Los bienes han sido inspeccionados en presencia del conductor.',
      clientRemarks: 'Observaciones del cliente',
      noRemarks: 'Sin observaciones del cliente - producto aceptado sin reservas',
      clientSignature: 'Firma del cliente',
      signatureDate: 'Fecha de firma',
      generatedAuto: 'Documento generado automáticamente desde el sistema Herraton',
      generatedDate: 'Fecha de generación',
      polishCopy: 'COPIA POLACA'
    },
    nl: {
      title: 'GOEDERENONTVANGSTPROTOCOL',
      orderNumber: 'Ordernummer',
      orderData: 'Ordergegevens',
      product: 'Product',
      value: 'Waarde',
      recipientData: 'Ontvangersgegevens',
      fullName: 'Volledige naam',
      deliveryAddress: 'Afleveradres',
      phone: 'Telefoon',
      email: 'E-mail',
      deliveryData: 'Leveringsgegevens',
      deliveryDate: 'Leverdatum',
      deliveryTime: 'Levertijd',
      driver: 'Chauffeur',
      declaration: 'Ik, ondergetekende, bevestig de ontvangst van bovengenoemde goederen. De goederen zijn gecontroleerd in aanwezigheid van de chauffeur.',
      clientRemarks: 'Opmerkingen klant',
      noRemarks: 'Geen opmerkingen van klant - product zonder voorbehoud geaccepteerd',
      clientSignature: 'Handtekening klant',
      signatureDate: 'Datum handtekening',
      generatedAuto: 'Document automatisch gegenereerd uit het Herraton-systeem',
      generatedDate: 'Generatiedatum',
      polishCopy: 'POOLSE KOPIE'
    }
  };

  const [protocolLanguage, setProtocolLanguage] = useState('pl');
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [protocolOrder, setProtocolOrder] = useState(null);

  const generateProtocolHTML = (order, lang, isPLCopy = false) => {
    const t = PROTOCOL_TRANSLATIONS[lang];
    const tPL = PROTOCOL_TRANSLATIONS['pl'];
    const umowa = order.umowaOdbioru;
    
    const copyLabel = isPLCopy ? `<div style="background: #2563EB; color: white; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px;">📋 ${t.polishCopy}</div>` : '';
    const usedT = isPLCopy ? tPL : t;

    return `
    <div class="protocol-page">
      ${copyLabel}
      <div class="header">
        <h1>📋 ${usedT.title}</h1>
        <p>${usedT.orderNumber}: <strong>${order.nrWlasny}</strong></p>
      </div>

      <div class="section">
        <h2>📦 ${usedT.orderData}</h2>
        <div class="row"><span class="label">${usedT.orderNumber}:</span><span class="value">${order.nrWlasny}</span></div>
        <div class="row"><span class="label">${usedT.product}:</span><span class="value">${umowa?.produkt || '—'}</span></div>
        ${order.platnosci?.cenaCalkowita ? `<div class="row"><span class="label">${usedT.value}:</span><span class="value">${formatCurrency(order.platnosci.cenaCalkowita, order.platnosci.waluta)}</span></div>` : ''}
      </div>

      <div class="section">
        <h2>👤 ${usedT.recipientData}</h2>
        <div class="row"><span class="label">${usedT.fullName}:</span><span class="value">${umowa?.klient?.imie || '—'}</span></div>
        <div class="row"><span class="label">${usedT.deliveryAddress}:</span><span class="value">${umowa?.klient?.adres || '—'}</span></div>
        <div class="row"><span class="label">${usedT.phone}:</span><span class="value">${umowa?.klient?.telefon || '—'}</span></div>
        <div class="row"><span class="label">${usedT.email}:</span><span class="value">${umowa?.klient?.email || '—'}</span></div>
      </div>

      <div class="section">
        <h2>🚚 ${usedT.deliveryData}</h2>
        <div class="row"><span class="label">${usedT.deliveryDate}:</span><span class="value">${formatDateTime(umowa?.dataDostawy)}</span></div>
        <div class="row"><span class="label">${usedT.deliveryTime}:</span><span class="value">${umowa?.godzinaDostawy || '—'}</span></div>
        <div class="row"><span class="label">${usedT.driver}:</span><span class="value">${umowa?.kierowca || '—'}</span></div>
      </div>

      <div class="declaration">
        ${usedT.declaration}
      </div>

      <div class="remarks ${umowa?.uwagiKlienta ? 'warning' : 'ok'}">
        ${umowa?.uwagiKlienta 
          ? `<strong>⚠️ ${usedT.clientRemarks}:</strong><br>${umowa.uwagiKlienta}` 
          : `✅ ${usedT.noRemarks}`}
      </div>

      ${order.podpisKlienta ? `
      <div class="signature-section">
        <h2>✍️ ${usedT.clientSignature}</h2>
        <img src="${order.podpisKlienta.url}" alt="Signature" class="signature-img" />
        <p style="margin-top: 10px; color: #666; font-size: 12px;">
          ${usedT.signatureDate}: ${formatDateTime(order.podpisKlienta.timestamp)}
        </p>
      </div>
      ` : ''}

      <div class="footer">
        ${usedT.generatedAuto}<br>
        ${usedT.generatedDate}: ${new Date().toLocaleString('pl-PL')}
      </div>
    </div>
    `;
  };

  const downloadDeliveryProtocol = (order, language = 'pl') => {
    if (!order.umowaOdbioru) {
      alert('Brak protokołu odbioru dla tego zamówienia');
      return;
    }

    const needsPolishCopy = language !== 'pl';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Protokół odbioru - ${order.nrWlasny}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #333; }
    .protocol-page { padding: 40px; page-break-after: always; }
    .protocol-page:last-child { page-break-after: auto; }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #333; }
    .header h1 { font-size: 24px; margin-bottom: 10px; }
    .header p { color: #666; }
    .section { margin-bottom: 25px; }
    .section h2 { font-size: 14px; color: #666; text-transform: uppercase; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
    .row { display: flex; margin-bottom: 8px; }
    .label { width: 150px; color: #666; font-size: 13px; }
    .value { flex: 1; font-size: 14px; }
    .remarks { margin-top: 20px; padding: 15px; border-radius: 8px; }
    .remarks.warning { background: #fff3cd; border-left: 4px solid #ffc107; }
    .remarks.ok { background: #d4edda; border-left: 4px solid #28a745; }
    .signature-section { margin-top: 30px; padding-top: 20px; border-top: 2px solid #333; }
    .signature-section h2 { margin-bottom: 15px; }
    .signature-img { max-width: 300px; border: 1px solid #ddd; border-radius: 8px; }
    .declaration { margin: 30px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center; font-style: italic; }
    .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; }
    @media print { 
      body { padding: 0; } 
      .protocol-page { padding: 20px; }
    }
  </style>
</head>
<body>
  ${generateProtocolHTML(order, language, false)}
  ${needsPolishCopy ? generateProtocolHTML(order, language, true) : ''}
</body>
</html>
    `;

    // Utwórz blob i pobierz jako plik
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protokol-${order.nrWlasny}-${language}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openProtocolModal = (order) => {
    setProtocolOrder(order);
    setShowProtocolModal(true);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-detail" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title-row">
              <span style={{ fontSize: '20px' }}>{country?.flag}</span>
              <h2>{order.nrWlasny || 'Bez numeru'}</h2>
              {viewMode === 'product' && hasMultipleProducts && (
                <span className="product-view-badge">
                  📦 {order.produkty[activeProductIdx]?.nrPodzamowienia || `Produkt #${activeProductIdx + 1}`}
                </span>
              )}
              {urgency && <span className={`urgency-badge ${urgency.blink ? 'blink' : ''}`} style={{ background: urgency.bg, color: urgency.color }}>⏰ {urgency.label}</span>}
            </div>
            <span className="status-badge" style={{ background: status?.bgColor, color: status?.color }}>{status?.icon} {status?.name}</span>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Przełącznik widoku dla zamówień łączonych */}
          {hasMultipleProducts && (
            <div className="view-mode-switcher">
              <button 
                className={`view-mode-btn ${viewMode === 'all' ? 'active' : ''}`}
                onClick={() => setViewMode('all')}
              >
                👁️ Całe zamówienie ({order.produkty.length} produktów)
              </button>
              {order.produkty.map((prod, idx) => (
                <button 
                  key={idx}
                  className={`view-mode-btn product ${viewMode === 'product' && activeProductIdx === idx ? 'active' : ''}`}
                  onClick={() => { setViewMode('product'); setActiveProductIdx(idx); }}
                >
                  {prod.nrPodzamowienia || `#${idx + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* WIDOK CAŁEGO ZAMÓWIENIA */}
          {(viewMode === 'all' || !hasMultipleProducts) && (
            <>
              <div className="detail-section">
                <label>📦 TOWAR</label>
                {hasMultipleProducts ? (
                  <div className="products-detail-list">
                    {order.produkty.map((prod, idx) => {
                      const prodStatus = getStatus(prod.status);
                      const prodDriver = drivers.find(d => d.id === prod.kierowca);
                      return (
                        <div key={idx} className="product-detail-item">
                          <div className="product-detail-header">
                            <span className="product-detail-nr">{prod.nrPodzamowienia || `#${idx + 1}`}</span>
                            <span className="product-detail-status" style={{ background: prodStatus?.bgColor, color: prodStatus?.color }}>
                              {prodStatus?.icon} {prodStatus?.name}
                            </span>
                          </div>
                          <p className="product-detail-desc">{prod.towar}</p>
                          <div className="product-detail-tags">
                            {prodDriver && <span className="mini-tag">🚚 {prodDriver.name}</span>}
                            {prod.dataOdbioru && <span className="mini-tag">📅 {formatDate(prod.dataOdbioru)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p>{order.towar}</p>
                )}
              </div>
            </>
          )}

          {/* WIDOK POJEDYNCZEGO PRODUKTU */}
          {viewMode === 'product' && hasMultipleProducts && order.produkty[activeProductIdx] && (() => {
            const prod = order.produkty[activeProductIdx];
            const prodStatus = getStatus(prod.status);
            const prodDriver = drivers.find(d => d.id === prod.kierowca);
            const prodProducer = Object.values(producers).find(p => p.id === prod.producent);
            
            return (
              <div className="single-product-view">
                <div className="detail-section">
                  <div className="product-header-detail">
                    <span className="product-nr-large">{prod.nrPodzamowienia || `Produkt #${activeProductIdx + 1}`}</span>
                    <span className="status-badge" style={{ background: prodStatus?.bgColor, color: prodStatus?.color }}>
                      {prodStatus?.icon} {prodStatus?.name}
                    </span>
                  </div>
                  <label>📦 TOWAR</label>
                  <p>{prod.towar}</p>
                </div>

                <div className="detail-grid">
                  {prodProducer && (
                    <div className="detail-item">
                      <span className="detail-label">🏭 Producent</span>
                      <span className="detail-value">{prodProducer.name}</span>
                    </div>
                  )}
                  {prod.producentNazwa && (
                    <div className="detail-item">
                      <span className="detail-label">🏭 Producent</span>
                      <span className="detail-value">{prod.producentNazwa}</span>
                    </div>
                  )}
                  {prodDriver && (
                    <div className="detail-item">
                      <span className="detail-label">🚚 Kierowca</span>
                      <span className="detail-value">{prodDriver.name}</span>
                    </div>
                  )}
                  {prod.dataOdbioru && (
                    <div className="detail-item">
                      <span className="detail-label">📅 Data odbioru</span>
                      <span className="detail-value">{formatDate(prod.dataOdbioru)}</span>
                    </div>
                  )}
                  {prod.dataDostawy && (
                    <div className="detail-item">
                      <span className="detail-label">📅 Data dostawy</span>
                      <span className="detail-value">{formatDate(prod.dataDostawy)}</span>
                    </div>
                  )}
                </div>

                {/* Koszty produktu */}
                {prod.koszty && (
                  <div className="detail-card">
                    <label>💰 KOSZTY PRODUKTU</label>
                    <div className="costs-mini-grid">
                      {prod.cenaKlienta && (
                        <div><span>Cena klienta:</span> <strong>{formatCurrency(prod.cenaKlienta, order.platnosci?.waluta)}</strong></div>
                      )}
                      {prod.koszty.zakupNetto && (
                        <div><span>Zakup netto:</span> <strong>{formatCurrency(prod.koszty.zakupNetto, prod.koszty.waluta)}</strong></div>
                      )}
                      {prod.koszty.transportNetto && (
                        <div><span>Transport:</span> <strong>{formatCurrency(prod.koszty.transportNetto, prod.koszty.transportWaluta)}</strong></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Protokół tego produktu */}
                {prod.protokol && (prod.protokol.zdjeciaOdbioru?.length > 0 || prod.protokol.zdjeciaDostawy?.length > 0 || prod.protokol.podpis) && (
                  <div className="detail-section">
                    <label>📷 PROTOKÓŁ PRODUKTU</label>
                    <div className="photos-grid">
                      {prod.protokol.zdjeciaOdbioru?.map((p, i) => (
                        <div key={`o${i}`} className="photo-item" onClick={() => setPreviewImage(p.url)}>
                          <img src={p.url} alt={`Odbiór ${i + 1}`} />
                          <span>Odbiór</span>
                        </div>
                      ))}
                      {prod.protokol.zdjeciaDostawy?.map((p, i) => (
                        <div key={`d${i}`} className="photo-item" onClick={() => setPreviewImage(p.url)}>
                          <img src={p.url} alt={`Dostawa ${i + 1}`} />
                          <span>Dostawa</span>
                        </div>
                      ))}
                      {prod.protokol.podpis && (
                        <div className="photo-item signature" onClick={() => setPreviewImage(prod.protokol.podpis.url)}>
                          <img src={prod.protokol.podpis.url} alt="Podpis" />
                          <span>✍️ Podpis</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* WSPÓLNE DANE KLIENTA - zawsze widoczne */}
          {(viewMode === 'all' || !hasMultipleProducts) && (
            <>

          <div className="detail-card">
            <label>👤 KLIENT</label>
            <div className="client-name">{order.klient?.imie || '—'}</div>
            <div className="client-address">📍 {order.klient?.adres || '—'}</div>
            <div className="client-contact">
              {order.klient?.telefon && <a href={`tel:${order.klient.telefon}`}>📞 {order.klient.telefon}</a>}
              {order.klient?.email && <a href={`mailto:${order.klient.email}`}>✉️ {order.klient.email}</a>}
              {order.klient?.facebookUrl && <a href={order.klient.facebookUrl} target="_blank" rel="noopener noreferrer">📘 Facebook</a>}
            </div>
          </div>

          <div className="detail-card payment-card">
            <label>💰 PŁATNOŚCI</label>
            <div className="payment-grid">
              <div>
                <span className="payment-label">Cena</span>
                <span className="payment-value">{formatCurrency(order.platnosci?.cenaCalkowita, order.platnosci?.waluta)}</span>
              </div>
              <div>
                <span className="payment-label">Zapłacono</span>
                <span className="payment-value paid">{formatCurrency(order.platnosci?.zaplacono, order.platnosci?.waluta)}</span>
              </div>
              <div>
                <span className="payment-label">Pozostało</span>
                <span className={`payment-value ${order.platnosci?.doZaplaty > 0 ? 'unpaid' : 'paid'}`}>{formatCurrency(order.platnosci?.doZaplaty, order.platnosci?.waluta)}</span>
              </div>
            </div>
            {order.platnosci?.metodaZaplaty && <div className="payment-method">Metoda: {order.platnosci.metodaZaplaty}</div>}
          </div>

          <div className="detail-grid">
            {producer && !isContractor && (
              <div className="detail-item">
                <span className="detail-label">🏭 Producent</span>
                <span className="detail-value">{producer.name}</span>
                {producer.address && <span className="detail-sub">📍 {producer.address}</span>}
                {producer.phone && <span className="detail-sub">📞 {producer.phone}</span>}
              </div>
            )}
            <div className="detail-item">
              <span className="detail-label">📅 Odbiór</span>
              <span className="detail-value">{formatDate(order.dataOdbioru)}</span>
            </div>
            {order.szacowanyOdbior && (
              <div className="detail-item">
                <span className="detail-label">📅 Szac. odbiór (kierowca)</span>
                <span className="detail-value">{formatDate(order.szacowanyOdbior)}</span>
              </div>
            )}
            {order.szacowanaDostwa && (
              <div className="detail-item">
                <span className="detail-label">📅 Szac. dostawa (kierowca)</span>
                <span className="detail-value">{formatDate(order.szacowanaDostwa)}</span>
              </div>
            )}
          </div>

          {driver && (
            <div className="detail-item driver">
              <span className="detail-label">🚚 Kierowca</span>
              <span className="detail-value">{driver.name}</span>
              {driver.phone && <span className="detail-sub">📞 {driver.phone}</span>}
            </div>
          )}

          {order.uwagi && <div className="detail-notes">📝 {order.uwagi}</div>}
          {order.uwagiKierowcy && <div className="detail-notes driver-notes">🚚 Uwagi kierowcy: {order.uwagiKierowcy}</div>}

          {/* DOKUMENTACJA ZE ZDJĘCIAMI - KLIKALNE DO POWIĘKSZENIA */}
          {(order.zdjeciaOdbioru?.length > 0 || order.zdjeciaDostawy?.length > 0 || order.podpisKlienta) && (
            <div className="detail-section">
              <label>📷 DOKUMENTACJA (kliknij aby powiększyć)</label>
              <div className="photos-grid">
                {order.zdjeciaOdbioru?.map((p, i) => (
                  <div key={`o${i}`} className="photo-item" onClick={() => setPreviewImage(p.url)}>
                    <img src={p.url} alt={`Odbiór ${i + 1}`} />
                    <span>Odbiór - {formatDateTime(p.timestamp)}</span>
                  </div>
                ))}
                {order.zdjeciaDostawy?.map((p, i) => (
                  <div key={`d${i}`} className="photo-item" onClick={() => setPreviewImage(p.url)}>
                    <img src={p.url} alt={`Dostawa ${i + 1}`} />
                    <span>Dostawa - {formatDateTime(p.timestamp)}</span>
                  </div>
                ))}
                {order.podpisKlienta && (
                  <div className="photo-item signature" onClick={() => setPreviewImage(order.podpisKlienta.url)}>
                    <img src={order.podpisKlienta.url} alt="Podpis klienta" />
                    <span>✍️ Podpis - {formatDateTime(order.podpisKlienta.timestamp)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* UMOWA ODBIORU */}
          {order.umowaOdbioru && (
            <div className="detail-section contract-section">
              <div className="contract-header-row">
                <label>📋 PROTOKÓŁ ODBIORU TOWARU</label>
                <button className="btn-download-pdf" onClick={() => openProtocolModal(order)}>
                  📥 Pobierz protokół
                </button>
              </div>
              <div className="contract-display">
                <div className="contract-row">
                  <span className="contract-label">Data dostawy:</span>
                  <span>{formatDateTime(order.umowaOdbioru.dataDostawy)}</span>
                </div>
                <div className="contract-row">
                  <span className="contract-label">Godzina:</span>
                  <span>{order.umowaOdbioru.godzinaDostawy}</span>
                </div>
                <div className="contract-row">
                  <span className="contract-label">Kierowca:</span>
                  <span>{order.umowaOdbioru.kierowca}</span>
                </div>
                <div className="contract-row">
                  <span className="contract-label">Odbiorca:</span>
                  <span>{order.umowaOdbioru.klient?.imie}</span>
                </div>
                <div className="contract-row">
                  <span className="contract-label">Adres:</span>
                  <span>{order.umowaOdbioru.klient?.adres}</span>
                </div>
                <div className="contract-row">
                  <span className="contract-label">Telefon:</span>
                  <span>{order.umowaOdbioru.klient?.telefon || '—'}</span>
                </div>
                <div className="contract-row">
                  <span className="contract-label">Produkt:</span>
                  <span>{order.umowaOdbioru.produkt}</span>
                </div>
                {order.platnosci?.cenaCalkowita > 0 && (
                  <div className="contract-row">
                    <span className="contract-label">Wartość:</span>
                    <span>{formatCurrency(order.platnosci.cenaCalkowita, order.platnosci.waluta)}</span>
                  </div>
                )}
                {order.umowaOdbioru.uwagiKlienta ? (
                  <div className="contract-remarks warning">
                    <span className="contract-label">⚠️ Uwagi klienta:</span>
                    <span>{order.umowaOdbioru.uwagiKlienta}</span>
                  </div>
                ) : (
                  <div className="contract-remarks ok">
                    <span>✅ Klient nie zgłosił uwag - produkt zaakceptowany bez zastrzeżeń</span>
                  </div>
                )}
                {order.podpisKlienta && (
                  <div className="contract-signature">
                    <span className="contract-label">Podpis klienta:</span>
                    <img src={order.podpisKlienta.url} alt="Podpis klienta" className="signature-preview" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RABAT PRZY DOSTAWIE - obsługa nowej i starej logiki */}
          {(() => {
            // Zbierz wszystkie rabaty - z produktów (nowa logika) i z rabatyKierowcow
            const rabatyZProduktow = [];
            if (order.produkty && order.produkty.length > 0) {
              order.produkty.forEach((p, idx) => {
                if (p.rabat && p.rabat.kwota > 0) {
                  rabatyZProduktow.push({
                    ...p.rabat,
                    podzamowienie: p.nrPodzamowienia || `#${idx+1}`,
                    productIndex: idx,
                    kierowcaId: p.rabat.kierowcaId || p.kierowca,
                    zProduktu: true
                  });
                }
              });
            }
            
            // Rabaty z rabatyKierowcow (może być duplikat z produktów) - filtruj null
            const rabatyKierowcow = order.rabatyKierowcow ? Object.entries(order.rabatyKierowcow)
              .filter(([_, r]) => r && r.kwota > 0)
              .map(([odDriver, r]) => ({
                ...r,
                kierowcaId: odDriver,
                zRabatyKierowcow: true
              })) : [];
            
            // Stary rabat globalny (fallback)
            const staryRabat = order.rabatPrzyDostawie && order.rabatPrzyDostawie.kwota > 0 
              ? { ...order.rabatPrzyDostawie, globalny: true, kierowcaId: order.rabatPrzyDostawie.kierowcaId } 
              : null;
            
            // Połącz wszystkie rabaty - priorytet: produkty > rabatyKierowcow > rabatPrzyDostawie
            // Ale nie duplikuj jeśli ten sam kierowca ma rabat w obu miejscach
            let wszystkieRabaty = [...rabatyZProduktow];
            
            // Dodaj rabaty z rabatyKierowcow tylko jeśli nie ma już dla tego kierowcy w produktach
            rabatyKierowcow.forEach(rk => {
              const jestWProduktach = rabatyZProduktow.some(rp => rp.kierowcaId === rk.kierowcaId);
              if (!jestWProduktach) {
                wszystkieRabaty.push(rk);
              }
            });
            
            // Dodaj stary rabat globalny jeśli nie ma żadnych innych
            if (wszystkieRabaty.length === 0 && staryRabat) {
              wszystkieRabaty.push(staryRabat);
            }
            
            // Oblicz sumę rabatów
            const sumaRabatow = wszystkieRabaty.reduce((sum, r) => sum + (r.kwota || 0), 0);
            
            if (wszystkieRabaty.length === 0) return null;
            
            return (
              <div className="detail-section discount-section">
                <label>💸 RABATY PRZY DOSTAWIE {wszystkieRabaty.length > 1 && `(${wszystkieRabaty.length})`}</label>
                {wszystkieRabaty.map((rabat, idx) => (
                  <div key={idx} className="discount-display">
                    <div className="discount-header-row">
                      <div className="discount-amount">
                        -{formatCurrency(rabat.kwota, order.platnosci?.waluta)}
                        {rabat.podzamowienie && <span className="discount-suborder">({rabat.podzamowienie})</span>}
                      </div>
                      {/* Przyciski edycji/usunięcia dla admina */}
                      {!isContractor && (
                        <div className="discount-admin-actions">
                          <button 
                            className="btn-edit-discount"
                            onClick={() => handleEditDiscount(rabat)}
                            title="Edytuj rabat"
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn-delete-discount"
                            onClick={() => handleDeleteDiscount(rabat.productIndex, rabat.kierowcaId)}
                            title="Usuń rabat"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="discount-details">
                      <p><strong>Powód:</strong> {rabat.powod}</p>
                      <p><strong>Udzielony przez:</strong> {rabat.kierowca}</p>
                      <p><strong>Data:</strong> {formatDateTime(rabat.data)}</p>
                      {rabat.edytowanyPrzez && (
                        <p className="discount-edited"><em>Edytowany przez: {rabat.edytowanyPrzez} ({formatDateTime(rabat.dataEdycji)})</em></p>
                      )}
                    </div>
                  </div>
                ))}
                {wszystkieRabaty.length > 1 && (
                  <div className="discount-total">
                    <strong>Suma rabatów: -{formatCurrency(sumaRabatow, order.platnosci?.waluta)}</strong>
                  </div>
                )}
              </div>
            );
          })()}

          <HistoryPanel historia={order.historia} utworzonePrzez={order.utworzonePrzez} />
            </>
          )}
          
          {/* Modal edycji rabatu - POZA blokiem warunkowym viewMode */}
          {editingDiscount && (
            <div className="discount-edit-overlay" onClick={() => setEditingDiscount(null)}>
              <div className="discount-edit-modal" onClick={e => e.stopPropagation()}>
                <h3>✏️ Edycja rabatu</h3>
                <div className="form-group">
                  <label>Kwota rabatu ({order.platnosci?.waluta || 'PLN'})</label>
                  <input 
                    type="number" 
                    value={discountEditAmount} 
                    onChange={e => setDiscountEditAmount(e.target.value)}
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Powód rabatu</label>
                  <textarea 
                    value={discountEditReason} 
                    onChange={e => setDiscountEditReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="discount-edit-actions">
                  <button className="btn-secondary" onClick={() => setEditingDiscount(null)}>Anuluj</button>
                  <button className="btn-primary" onClick={handleSaveDiscount}>💾 Zapisz</button>
                </div>
              </div>
            </div>
          )}

          {/* PROTOKOŁY PER KIEROWCA - dla zamówień łączonych */}
          {hasMultipleProducts && Object.keys(getProtocolsByDriver()).length > 0 && (
            <div className="detail-section protocols-by-driver">
              <label>📋 PROTOKOŁY KIEROWCÓW</label>
              {Object.entries(getProtocolsByDriver()).map(([driverId, protocol]) => (
                <div key={driverId} className="driver-protocol-block">
                  <button 
                    className={`driver-protocol-header ${expandedProtocols[driverId] ? 'expanded' : ''}`}
                    onClick={() => toggleProtocol(driverId)}
                  >
                    <span className="driver-protocol-name">
                      🚚 {protocol.driverName}
                      <span className="protocol-counts">
                        {protocol.zdjeciaOdbioru.length > 0 && <span>📷O: {protocol.zdjeciaOdbioru.length}</span>}
                        {protocol.zdjeciaDostawy.length > 0 && <span>📷D: {protocol.zdjeciaDostawy.length}</span>}
                        {protocol.podpisy.length > 0 && <span>✍️: {protocol.podpisy.length}</span>}
                      </span>
                    </span>
                    <span className="expand-icon">{expandedProtocols[driverId] ? '▼' : '▶'}</span>
                  </button>
                  
                  {expandedProtocols[driverId] && (
                    <div className="driver-protocol-content">
                      {/* Produkty tego kierowcy */}
                      <div className="protocol-products">
                        <strong>Produkty:</strong>
                        {protocol.products.map((p, i) => (
                          <span key={i} className="protocol-product-tag">
                            {p.nrPodzamowienia || `#${p.index + 1}`}
                          </span>
                        ))}
                      </div>

                      {/* Zdjęcia odbioru */}
                      {protocol.zdjeciaOdbioru.length > 0 && (
                        <div className="protocol-photos-section">
                          <strong>📷 Zdjęcia odbioru:</strong>
                          <div className="photos-grid small">
                            {protocol.zdjeciaOdbioru.map((p, i) => (
                              <div key={i} className="photo-item small" onClick={() => setPreviewImage(p.url)}>
                                <img src={p.url} alt={`Odbiór ${i + 1}`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Zdjęcia dostawy */}
                      {protocol.zdjeciaDostawy.length > 0 && (
                        <div className="protocol-photos-section">
                          <strong>📷 Zdjęcia dostawy:</strong>
                          <div className="photos-grid small">
                            {protocol.zdjeciaDostawy.map((p, i) => (
                              <div key={i} className="photo-item small" onClick={() => setPreviewImage(p.url)}>
                                <img src={p.url} alt={`Dostawa ${i + 1}`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Podpisy */}
                      {protocol.podpisy.length > 0 && (
                        <div className="protocol-signatures-section">
                          <strong>✍️ Podpisy:</strong>
                          <div className="signatures-grid">
                            {protocol.podpisy.map((p, i) => (
                              <div key={i} className="signature-item" onClick={() => setPreviewImage(p.podpis.url || p.podpis)}>
                                <img src={p.podpis.url || p.podpis} alt="Podpis" />
                                {!p.global && <span>Produkt #{p.productIdx + 1}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Uwagi */}
                      {protocol.uwagi.length > 0 && (
                        <div className="protocol-notes-section">
                          <strong>📝 Uwagi klienta:</strong>
                          {protocol.uwagi.map((u, i) => (
                            <div key={i} className="protocol-note">
                              {!u.global && <span className="note-product">#{u.productIdx + 1}:</span>}
                              {u.uwagi}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Rabat kierowcy */}
                      {protocol.rabat && (
                        <div className="protocol-discount-section">
                          <strong>💸 Rabat udzielony:</strong>
                          <div className="protocol-discount-info">
                            <span className="discount-amount">-{formatCurrency(protocol.rabat.kwota, order.platnosci?.waluta)}</span>
                            <span className="discount-reason">{protocol.rabat.powod}</span>
                            <span className="discount-date">{formatDateTime(protocol.rabat.data)}</span>
                          </div>
                        </div>
                      )}

                      {/* Przycisk pobrania protokołu */}
                      {(protocol.podpisy.length > 0 || protocol.zdjeciaDostawy.length > 0) && (
                        <div className="protocol-actions">
                          <button 
                            className="btn-download-protocol"
                            onClick={() => {
                              // Otwórz modal protokołu z danymi tego kierowcy
                              const protocolData = {
                                ...order,
                                _driverProtocol: {
                                  driverId: driverId,
                                  driverName: protocol.driverName,
                                  products: protocol.products,
                                  podpis: protocol.podpisy[0]?.podpis,
                                  zdjeciaDostawy: protocol.zdjeciaDostawy,
                                  zdjeciaOdbioru: protocol.zdjeciaOdbioru,
                                  uwagi: protocol.uwagi,
                                  rabat: protocol.rabat
                                }
                              };
                              openProtocolModal(protocolData);
                            }}
                          >
                            📥 Pobierz protokół PDF
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {order.klient?.email && (
            <button className="btn-send-confirmation" onClick={() => setShowEmailConfirmation(true)}>
              📧 Wyślij potwierdzenie
            </button>
          )}
          {order.klient?.email && order.status === 'dostarczone' && (
            <button className="btn-delivery-confirmation" onClick={() => setShowDeliveryEmailModal(true)}>
              📦 Potwierdzenie dostawy
            </button>
          )}
          {order.klient?.email && (
            <button className="btn-complaint-link" onClick={() => setShowComplaintLinkModal(true)} style={{background: 'linear-gradient(135deg, #DC2626, #B91C1C)', color: 'white'}}>
              📋 Link do reklamacji
            </button>
          )}
          <button className="btn-danger" onClick={handleDelete}>🗑️ Usuń zamówienie</button>
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>

      {/* Modal podglądu zdjęcia */}
      {previewImage && <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />}

      {/* Modal wysyłania potwierdzenia dostawy */}
      {showDeliveryEmailModal && (
        <div className="modal-overlay" style={{zIndex: 2000}}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header delivery-confirmation-header">
              <h2>📦 Wyślij potwierdzenie dostawy</h2>
              <button className="btn-close" onClick={() => setShowDeliveryEmailModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="delivery-confirm-info">
                <p><strong>Zamówienie:</strong> {order.nrWlasny}</p>
                <p><strong>Klient:</strong> {order.klient?.imie}</p>
                <p><strong>Email:</strong> {order.klient?.email}</p>
                
                <div className="form-group" style={{marginTop: '16px'}}>
                  <label>Język wiadomości:</label>
                  <select 
                    value={deliveryEmailLang} 
                    onChange={e => setDeliveryEmailLang(e.target.value)}
                    className="protocol-language-select"
                  >
                    <option value="pl">🇵🇱 Polski</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="de">🇩🇪 Deutsch</option>
                    <option value="es">🇪🇸 Español</option>
                    <option value="nl">🇳🇱 Nederlands</option>
                  </select>
                </div>

                <div className="delivery-confirm-content">
                  <p>✅ Potwierdzenie dostawy</p>
                  <p>📋 Protokół odbioru towaru</p>
                  {order.zdjeciaDostawy?.length > 0 && (
                    <p>📸 {order.zdjeciaDostawy.length} zdjęć z dostawy</p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDeliveryEmailModal(false)}>Anuluj</button>
              <button className="btn-primary" onClick={sendDeliveryEmail}>📤 Wyślij email</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal potwierdzenia email */}
      {showEmailConfirmation && (
        <div className="modal-overlay" style={{zIndex: 2000}}>
          <div className="modal-content modal-medium" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📧 Podgląd potwierdzenia zamówienia</h2>
              <button className="btn-close" onClick={() => setShowEmailConfirmation(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="email-preview">
                <div className="email-to">
                  <strong>Do:</strong> {order.klient?.email}
                </div>
                <div className="email-subject">
                  <strong>Temat:</strong> Potwierdzenie zamówienia nr {order.nrWlasny}
                </div>
                <div className="email-body-preview">
                  <pre>{generateConfirmationEmail().body}</pre>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEmailConfirmation(false)}>Anuluj</button>
              <button className="btn-primary" onClick={handleSendConfirmation}>
                📤 Wyślij email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal wyboru języka protokołu */}
      {showProtocolModal && protocolOrder && (
        <div className="modal-overlay" style={{zIndex: 2000}}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Pobierz protokół odbioru</h2>
              <button className="btn-close" onClick={() => setShowProtocolModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Wybierz język protokołu:</label>
                <select 
                  value={protocolLanguage} 
                  onChange={e => setProtocolLanguage(e.target.value)}
                  className="protocol-language-select"
                >
                  <option value="pl">🇵🇱 Polski</option>
                  <option value="en">🇬🇧 English (+ kopia PL)</option>
                  <option value="de">🇩🇪 Deutsch (+ kopia PL)</option>
                  <option value="es">🇪🇸 Español (+ kopia PL)</option>
                  <option value="nl">🇳🇱 Nederlands (+ kopia PL)</option>
                </select>
              </div>
              <p className="protocol-info">
                {protocolLanguage !== 'pl' && '📋 Protokół będzie zawierał 2 strony: oryginał w wybranym języku + kopię po polsku'}
                {protocolLanguage === 'pl' && '📋 Protokół będzie w języku polskim'}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowProtocolModal(false)}>Anuluj</button>
              <button 
                className="btn-primary" 
                onClick={() => {
                  downloadDeliveryProtocol(protocolOrder, protocolLanguage);
                  setShowProtocolModal(false);
                }}
              >
                📥 Pobierz protokół
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal wysyłania linku do reklamacji */}
      {showComplaintLinkModal && (
        <div className="modal-overlay" style={{zIndex: 2000}}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{background: 'linear-gradient(135deg, #DC2626, #B91C1C)'}}>
              <h2 style={{color: 'white'}}>📋 Wyślij link do reklamacji</h2>
              <button className="btn-close" onClick={() => setShowComplaintLinkModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="complaint-link-preview">
                <div className="preview-section" style={{marginBottom: '15px'}}>
                  <label style={{color: '#6B7280', fontSize: '13px'}}>📧 Email klienta:</label>
                  <p style={{margin: '5px 0 0 0', fontWeight: '600'}}>{order.klient?.email}</p>
                </div>
                <div className="preview-section" style={{marginBottom: '15px'}}>
                  <label style={{color: '#6B7280', fontSize: '13px'}}>📦 Zamówienie:</label>
                  <p style={{margin: '5px 0 0 0', fontWeight: '600'}}>{order.nrWlasny}</p>
                </div>
                <div className="preview-section" style={{marginBottom: '15px'}}>
                  <label style={{color: '#6B7280', fontSize: '13px'}}>👤 Klient:</label>
                  <p style={{margin: '5px 0 0 0', fontWeight: '600'}}>{order.klient?.imie}</p>
                </div>
                <div className="form-group">
                  <label>🌍 Język wiadomości:</label>
                  <select 
                    value={complaintLinkLang} 
                    onChange={e => setComplaintLinkLang(e.target.value)}
                    className="form-control"
                  >
                    <option value="pl">🇵🇱 Polski</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="de">🇩🇪 Deutsch</option>
                  </select>
                </div>
                <div style={{background: '#FEF3C7', padding: '15px', borderRadius: '8px', marginTop: '15px'}}>
                  <p style={{margin: 0, fontSize: '13px', color: '#92400E'}}>
                    📌 Klient otrzyma email z linkiem do formularza reklamacji. 
                    Po wypełnieniu formularza reklamacja automatycznie pojawi się w panelu "Reklamacje" z załączonymi zdjęciami i opisem.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowComplaintLinkModal(false)}>Anuluj</button>
              <button 
                className="btn-primary" 
                style={{background: 'linear-gradient(135deg, #DC2626, #B91C1C)'}}
                onClick={() => {
                  // Generuj unikalny token dla reklamacji
                  const complaintToken = `${order.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  const complaintLink = `${window.location.origin}/reklamacja/${complaintToken}`;
                  
                  // Zapisz token w zamówieniu
                  if (onUpdateOrder) {
                    onUpdateOrder(order.id, {
                      complaintToken: complaintToken,
                      complaintTokenCreated: new Date().toISOString()
                    });
                  }
                  
                  // Tłumaczenia
                  const translations = {
                    pl: {
                      subject: `Formularz reklamacji - Zamówienie ${order.nrWlasny}`,
                      greeting: 'Szanowny/a',
                      intro: 'Otrzymaliśmy informację o problemie z Twoim zamówieniem. Przepraszamy za niedogodności.',
                      instruction: 'Aby zgłosić reklamację, kliknij poniższy przycisk i wypełnij formularz:',
                      buttonText: 'ZGŁOŚ REKLAMACJĘ',
                      info: 'W formularzu możesz opisać problem i załączyć zdjęcia. Nasz zespół zajmie się Twoją sprawą najszybciej jak to możliwe.',
                      thanks: 'Dziękujemy za cierpliwość!',
                      team: 'Zespół Obsługi Klienta'
                    },
                    en: {
                      subject: `Complaint Form - Order ${order.nrWlasny}`,
                      greeting: 'Dear',
                      intro: 'We have received information about an issue with your order. We apologize for any inconvenience.',
                      instruction: 'To submit a complaint, please click the button below and fill out the form:',
                      buttonText: 'SUBMIT COMPLAINT',
                      info: 'In the form, you can describe the problem and attach photos. Our team will handle your case as soon as possible.',
                      thanks: 'Thank you for your patience!',
                      team: 'Customer Service Team'
                    },
                    de: {
                      subject: `Reklamationsformular - Bestellung ${order.nrWlasny}`,
                      greeting: 'Sehr geehrte/r',
                      intro: 'Wir haben Informationen über ein Problem mit Ihrer Bestellung erhalten. Wir entschuldigen uns für die Unannehmlichkeiten.',
                      instruction: 'Um eine Reklamation einzureichen, klicken Sie auf die Schaltfläche unten und füllen Sie das Formular aus:',
                      buttonText: 'REKLAMATION EINREICHEN',
                      info: 'Im Formular können Sie das Problem beschreiben und Fotos anhängen. Unser Team wird sich so schnell wie möglich um Ihren Fall kümmern.',
                      thanks: 'Vielen Dank für Ihre Geduld!',
                      team: 'Kundenservice-Team'
                    }
                  };
                  
                  const t = translations[complaintLinkLang] || translations.pl;
                  
                  const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%); padding: 30px; text-align: center;">
              <div style="font-size: 40px; margin-bottom: 10px;">📋</div>
              <h1 style="color: white; margin: 0; font-size: 22px;">Formularz Reklamacji</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Zamówienie: ${order.nrWlasny}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">${t.greeting} <strong>${order.klient?.imie}</strong>,</p>
              <p style="margin: 0 0 20px 0; color: #6B7280; font-size: 15px; line-height: 1.6;">${t.intro}</p>
              <p style="margin: 0 0 25px 0; color: #374151; font-size: 15px;">${t.instruction}</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${complaintLink}" style="display: inline-block; background: linear-gradient(135deg, #DC2626, #B91C1C); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">${t.buttonText}</a>
              </div>
              <div style="background: #FEF3C7; padding: 20px; border-radius: 10px; margin-top: 20px;">
                <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">💡 ${t.info}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px; background-color: #F9FAFB; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #374151;">${t.thanks}</p>
              <p style="margin: 0; color: #6B7280; font-size: 14px;">${t.team}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

                  sendEmailViaMailerSend(
                    order.klient.email,
                    order.klient.imie,
                    t.subject,
                    `${t.greeting} ${order.klient?.imie}, ${t.intro} ${t.instruction} Link: ${complaintLink}`,
                    htmlEmail
                  ).then(result => {
                    if (result.success) {
                      alert('✅ Link do reklamacji został wysłany na email klienta!');
                    } else {
                      alert('❌ Błąd wysyłania emaila. Spróbuj ponownie.');
                    }
                  });
                  
                  setShowComplaintLinkModal(false);
                }}
              >
                📤 Wyślij link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// MODAL EDYCJI ZAMÓWIENIA - KOMPLEKSOWA PRZEBUDOWA
// ============================================

const OrderModal = ({ order, onSave, onClose, producers, drivers, currentUser, orders, isContractor, isAdmin, exchangeRates, priceLists }) => {
  // Inicjalizacja produktów - każdy produkt ma własne dane
  const initProducts = (existingOrder) => {
    if (existingOrder?.produkty && existingOrder.produkty.length > 0) {
      // Upewnij się że każdy produkt ma wszystkie wymagane pola
      return existingOrder.produkty.map((p, idx) => ({
        id: p.id || 'prod_' + Date.now() + '_' + idx,
        nrPodzamowienia: p.nrPodzamowienia || '',
        towar: p.towar || '',
        producent: p.producent || '',
        producentNazwa: p.producentNazwa || '',
        status: p.status || existingOrder.status || 'nowe',
        kierowca: p.kierowca || existingOrder.przypisanyKierowca || '',
        dataOdbioru: p.dataOdbioru || existingOrder.dataOdbioru || '',
        koszty: {
          waluta: p.koszty?.waluta || 'PLN',
          zakupNetto: p.koszty?.zakupNetto || 0,
          zakupBrutto: p.koszty?.zakupBrutto || 0,
          transportWaluta: p.koszty?.transportWaluta || 'PLN',
          transportNetto: p.koszty?.transportNetto || 0,
          transportBrutto: p.koszty?.transportBrutto || 0,
          vatRate: p.koszty?.vatRate || 23
        },
        // Ile klient płaci za ten konkretny produkt
        cenaKlienta: p.cenaKlienta || 0,
        // Ile kierowca ma pobrać za ten produkt
        doPobrania: p.doPobrania || 0
      }));
    }
    // Migracja starego formatu
    if (existingOrder?.towar) {
      return [{
        id: 'prod_' + Date.now(),
        nrPodzamowienia: existingOrder.nrWlasny,
        towar: existingOrder.towar,
        producent: existingOrder.zaladunek || '',
        producentNazwa: '',
        status: existingOrder.status || 'nowe',
        kierowca: existingOrder.przypisanyKierowca || '',
        dataOdbioru: existingOrder.dataOdbioru || '',
        koszty: {
          waluta: existingOrder.koszty?.waluta || 'PLN',
          zakupNetto: existingOrder.koszty?.zakupNetto || 0,
          zakupBrutto: existingOrder.koszty?.zakupBrutto || 0,
          transportWaluta: existingOrder.koszty?.transportWaluta || 'PLN',
          transportNetto: existingOrder.koszty?.transportNetto || 0,
          transportBrutto: existingOrder.koszty?.transportBrutto || 0,
          vatRate: existingOrder.koszty?.vatRate || 23
        },
        cenaKlienta: existingOrder.platnosci?.cenaCalkowita || 0,
        doPobrania: existingOrder.platnosci?.doZaplaty || 0
      }];
    }
    // Nowe zamówienie
    return [{
      id: 'prod_' + Date.now(),
      nrPodzamowienia: '',
      towar: '',
      producent: '',
      producentNazwa: '',
      status: 'nowe',
      kierowca: '',
      dataOdbioru: '',
      koszty: {
        waluta: 'PLN',
        zakupNetto: 0,
        zakupBrutto: 0,
        transportWaluta: 'PLN',
        transportNetto: 0,
        transportBrutto: 0,
        vatRate: 23
      },
      cenaKlienta: 0,
      doPobrania: 0
    }];
  };

  const [form, setForm] = useState(order ? {
    ...order,
    produkty: initProducts(order)
  } : {
    nrWlasny: '',
    kraj: 'PL',
    status: 'nowe',
    dataZlecenia: new Date().toISOString().split('T')[0],
    towar: '',
    zaladunek: '',
    produkty: initProducts(null),
    klient: { imie: '', adres: '', telefon: '', email: '', facebookUrl: '' },
    platnosci: { waluta: 'PLN', zaplacono: 0, metodaZaplaty: '', dataZaplaty: '', doZaplaty: 0, cenaCalkowita: 0 },
    koszty: { 
      waluta: 'PLN', 
      zakupNetto: 0, 
      zakupBrutto: 0, 
      transportWaluta: 'PLN',
      transportBrutto: 0,
      transportNetto: 0,
      vatRate: 23
    },
    uwagi: '',
    dataOdbioru: '',
    dataDostawy: '',
    przypisanyKierowca: null,
    kontrahentId: isContractor ? currentUser.id : null
  });
  const [saving, setSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showProductSearchInOrder, setShowProductSearchInOrder] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [showEmailModal, setShowEmailModal] = useState(null); // {type: 'producer'|'confirmation', productIndex?: number}
  const [producerEmailType, setProducerEmailType] = useState('inquiry'); // inquiry | order

  // Generuj numer podzamówienia
  const generateSubOrderNumber = (baseNr, index) => {
    if (index === 0) return baseNr;
    const suffix = String.fromCharCode(65 + index - 1); // A, B, C...
    return `${baseNr}-${suffix}`;
  };

  // Dodaj nowy produkt
  const addProduct = () => {
    const newProduct = {
      id: 'prod_' + Date.now(),
      nrPodzamowienia: generateSubOrderNumber(form.nrWlasny, form.produkty.length),
      towar: '',
      producent: '',
      producentNazwa: '',
      status: 'nowe',
      kierowca: form.przypisanyKierowca || '', // Domyślnie główny kierowca
      kierowcaNazwa: '',
      kierowcaTelefon: '',
      dataOdbioru: '',
      koszty: {
        waluta: form.platnosci?.waluta || 'PLN',
        zakupNetto: 0,
        zakupBrutto: 0,
        transportWaluta: form.platnosci?.waluta || 'PLN',
        transportNetto: 0,
        transportBrutto: 0,
        vatRate: 23
      },
      waluta: form.platnosci?.waluta || 'PLN', // Waluta do pobrania - dziedziczona z zamówienia
      cenaKlienta: 0,
      doPobrania: 0
    };
    setForm({ ...form, produkty: [...form.produkty, newProduct] });
    setActiveProductIndex(form.produkty.length);
  };

  // Usuń produkt
  const removeProduct = (index) => {
    if (form.produkty.length <= 1) {
      alert('Zamówienie musi mieć przynajmniej jeden produkt');
      return;
    }
    const newProducts = form.produkty.filter((_, i) => i !== index);
    setForm({ ...form, produkty: newProducts });
    if (activeProductIndex >= newProducts.length) {
      setActiveProductIndex(newProducts.length - 1);
    }
  };

  // Aktualizuj produkt - obsługa zagnieżdżonych pól
  const updateProduct = (index, field, value) => {
    setForm(prevForm => {
      const newProducts = [...prevForm.produkty];
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        newProducts[index] = {
          ...newProducts[index],
          [parent]: { 
            ...(newProducts[index][parent] || {}), 
            [child]: value 
          }
        };
      } else {
        newProducts[index] = { ...newProducts[index], [field]: value };
      }
      return { ...prevForm, produkty: newProducts };
    });
  };

  // Aktualizuj koszty produktu z przeliczaniem netto/brutto
  const updateProductCost = (index, field, value) => {
    setForm(prevForm => {
      const newProducts = [...prevForm.produkty];
      const currentKoszty = newProducts[index].koszty || { waluta: 'PLN', vatRate: 23 };
      const vatRate = currentKoszty.vatRate || 23;
      
      let newKoszty = { ...currentKoszty };
      
      if (field === 'zakupNetto') {
        const netto = parseFloat(value) || 0;
        newKoszty.zakupNetto = netto;
        newKoszty.zakupBrutto = Math.round(netto * (1 + vatRate / 100) * 100) / 100;
      } else if (field === 'zakupBrutto') {
        const brutto = parseFloat(value) || 0;
        newKoszty.zakupBrutto = brutto;
        newKoszty.zakupNetto = Math.round(brutto / (1 + vatRate / 100) * 100) / 100;
      } else if (field === 'transportNetto') {
        const netto = parseFloat(value) || 0;
        newKoszty.transportNetto = netto;
        newKoszty.transportBrutto = Math.round(netto * (1 + vatRate / 100) * 100) / 100;
      } else if (field === 'transportBrutto') {
        const brutto = parseFloat(value) || 0;
        newKoszty.transportBrutto = brutto;
        newKoszty.transportNetto = Math.round(brutto / (1 + vatRate / 100) * 100) / 100;
      } else {
        newKoszty[field] = value;
      }
      
      newProducts[index] = { ...newProducts[index], koszty: newKoszty };
      
      // Automatycznie zsumuj koszty wszystkich produktów do głównych pól
      let sumZakupNetto = 0;
      let sumZakupBrutto = 0;
      let sumTransportNetto = 0;
      let sumTransportBrutto = 0;
      newProducts.forEach(p => {
        if (p.koszty) {
          sumZakupNetto += p.koszty.zakupNetto || 0;
          sumZakupBrutto += p.koszty.zakupBrutto || 0;
          sumTransportNetto += p.koszty.transportNetto || 0;
          sumTransportBrutto += p.koszty.transportBrutto || 0;
        }
      });
      
      return { 
        ...prevForm, 
        produkty: newProducts,
        koszty: {
          ...prevForm.koszty,
          zakupNetto: sumZakupNetto,
          zakupBrutto: sumZakupBrutto,
          transportNetto: sumTransportNetto,
          transportBrutto: sumTransportBrutto
        }
      };
    });
  };

  // Aktualizuj numery podzamówień gdy zmienia się główny numer
  useEffect(() => {
    if (form.nrWlasny && form.produkty) {
      const updatedProducts = form.produkty.map((p, idx) => ({
        ...p,
        nrPodzamowienia: generateSubOrderNumber(form.nrWlasny, idx)
      }));
      if (JSON.stringify(updatedProducts) !== JSON.stringify(form.produkty)) {
        setForm(f => ({ ...f, produkty: updatedProducts }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nrWlasny]);

  // Generuj unikalny token dla klienta
  const generateClientToken = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  };

  // Funkcja wysyłania emaila z linkiem do panelu klienta
  const handleSendConfirmation = async () => {
    if (!form.klient?.email) {
      alert('Brak adresu email klienta!');
      return;
    }
    
    // Generuj token jeśli nie istnieje
    let clientToken = form.clientToken;
    if (!clientToken) {
      clientToken = generateClientToken();
      // Zaktualizuj form z tokenem
      setForm({ ...form, clientToken });
    }
    
    const confirmationLink = `${window.location.origin}/zamowienie/${clientToken}`;
    const customerName = form.klient.imie || 'Kliencie';
    
    // HTML email z linkiem do panelu
    const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); padding: 30px; text-align: center;">
              <div style="font-size: 50px; margin-bottom: 10px;">📦</div>
              <h1 style="color: white; margin: 0; font-size: 24px;">Potwierdź swoje zamówienie</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${form.nrWlasny}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Szanowny/a <strong>${customerName}</strong>,</p>
              <p style="margin: 0 0 20px 0; color: #6B7280; font-size: 15px; line-height: 1.6;">
                Dziękujemy za złożenie zamówienia! Prosimy o sprawdzenie danych i potwierdzenie zamówienia w panelu klienta.
              </p>
              
              <div style="background: #F3F4F6; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #374151; font-weight: 600;">📋 Podsumowanie:</p>
                <p style="margin: 5px 0; color: #6B7280;">Numer zamówienia: <strong>${form.nrWlasny}</strong></p>
                <p style="margin: 5px 0; color: #6B7280;">Kwota: <strong>${form.platnosci?.cenaCalkowita || 0} ${form.platnosci?.waluta || 'PLN'}</strong></p>
                ${form.dataDostawy ? `<p style="margin: 5px 0; color: #6B7280;">Planowana dostawa: <strong>${new Date(form.dataDostawy).toLocaleDateString('pl-PL')}</strong></p>` : ''}
              </div>
              
              <p style="margin: 20px 0; color: #374151; font-size: 15px; text-align: center;">
                <strong>👇 Kliknij poniższy przycisk aby sprawdzić szczegóły i potwierdzić zamówienie:</strong>
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${confirmationLink}" style="display: inline-block; background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 18px 50px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 18px;">✅ POTWIERDŹ ZAMÓWIENIE</a>
              </div>
              
              <div style="background: #FEF3C7; padding: 15px; border-radius: 10px; margin-top: 20px;">
                <p style="margin: 0; color: #92400E; font-size: 14px;">
                  💡 <strong>Zachowaj ten email!</strong> Po potwierdzeniu otrzymasz link do śledzenia statusu zamówienia.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px; background-color: #F9FAFB; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">Herraton • System obsługi zamówień</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Wyślij email
    const result = await sendEmailViaMailerSend(
      form.klient.email,
      form.klient.imie,
      `Potwierdź zamówienie ${form.nrWlasny}`,
      `Potwierdź swoje zamówienie: ${confirmationLink}`,
      htmlEmail
    );
    
    if (result.success) {
      // Zapisz token i flagę wysłania w zamówieniu
      const updatedForm = {
        ...form,
        clientToken,
        wyslanieDoPotwierdzenia: true,
        dataWyslaniaDoPotwierdzenia: new Date().toISOString()
      };
      setForm(updatedForm);
      
      // Jeśli edytujemy istniejące zamówienie, zaktualizuj w bazie
      if (order?.id) {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const { db } = await import('./firebase');
          await updateDoc(doc(db, 'orders', order.id), {
            clientToken,
            wyslanieDoPotwierdzenia: true,
            dataWyslaniaDoPotwierdzenia: new Date().toISOString()
          });
        } catch (err) {
          console.error('Błąd aktualizacji zamówienia:', err);
        }
      }
      
      alert('✅ Email z linkiem do potwierdzenia został wysłany do klienta!');
    } else {
      alert('❌ Błąd wysyłania emaila. Spróbuj ponownie.');
    }
    
    setShowConfirmationModal(false);
  };

  // Wyciągnij unikalne kontakty z zamówień do sugestii
  const getContactSuggestions = (searchText) => {
    if (!searchText || searchText.length < 2) return [];
    
    const relevantOrders = isContractor 
      ? orders.filter(o => o.kontrahentId === currentUser?.id && !o.usuniety)
      : orders.filter(o => !o.usuniety);

    const contactsMap = new Map();
    relevantOrders.forEach(order => {
      if (!order.klient?.imie) return;
      const key = `${order.klient.imie}_${order.klient.telefon || order.klient.email || ''}`;
      if (!contactsMap.has(key)) {
        contactsMap.set(key, {
          imie: order.klient.imie,
          telefon: order.klient.telefon || '',
          email: order.klient.email || '',
          adres: order.klient.adres || '',
          facebookUrl: order.klient.facebookUrl || ''
        });
      }
    });

    const searchLower = searchText.toLowerCase();
    return Array.from(contactsMap.values())
      .filter(c => c.imie.toLowerCase().includes(searchLower))
      .slice(0, 5);
  };

  // Obsługa zmiany imienia - szukaj sugestii
  const handleNameChange = (value) => {
    updateKlient('imie', value);
    const sugg = getContactSuggestions(value);
    setSuggestions(sugg);
    setShowSuggestions(sugg.length > 0);
  };

  // Wybór sugestii
  const selectSuggestion = (contact) => {
    setForm({
      ...form,
      klient: {
        imie: contact.imie,
        telefon: contact.telefon,
        email: contact.email,
        adres: contact.adres,
        facebookUrl: contact.facebookUrl
      }
    });
    setShowSuggestions(false);
  };

  // Generuj numer zamówienia dla nowych zamówień (bez ID)
  useEffect(() => {
    const isNewOrder = !order?.id;
    if (isNewOrder && form.kraj) {
      const nr = generateOrderNumber(orders || [], form.kraj);
      setForm(f => ({ ...f, nrWlasny: nr }));
    }
  }, [form.kraj, order, orders]);

  const updateKlient = (k, v) => setForm({ ...form, klient: { ...form.klient, [k]: v } });
  const updatePlatnosci = (k, v) => {
    const p = { ...form.platnosci, [k]: v };
    if (k === 'cenaCalkowita' || k === 'zaplacono') {
      p.doZaplaty = Math.max(0, (p.cenaCalkowita || 0) - (p.zaplacono || 0));
    }
    setForm({ ...form, platnosci: p });
  };
  
  // Aktualizacja kosztów z auto-przeliczaniem netto↔brutto
  // eslint-disable-next-line no-unused-vars
  const updateKoszty = (field, value) => {
    const koszty = { ...form.koszty };
    const vatMultiplier = 1 + (koszty.vatRate || 23) / 100;
    
    if (field === 'zakupNetto') {
      koszty.zakupNetto = value;
      koszty.zakupBrutto = Math.round(value * vatMultiplier * 100) / 100;
    } else if (field === 'zakupBrutto') {
      koszty.zakupBrutto = value;
      koszty.zakupNetto = Math.round(value / vatMultiplier * 100) / 100;
    } else if (field === 'transportBrutto') {
      koszty.transportBrutto = value;
      koszty.transportNetto = Math.round(value / vatMultiplier * 100) / 100;
    } else if (field === 'transportNetto') {
      koszty.transportNetto = value;
      koszty.transportBrutto = Math.round(value * vatMultiplier * 100) / 100;
    } else if (field === 'vatRate') {
      koszty.vatRate = value;
      const newMultiplier = 1 + value / 100;
      // Przelicz wszystko na nowo
      if (koszty.zakupNetto > 0) {
        koszty.zakupBrutto = Math.round(koszty.zakupNetto * newMultiplier * 100) / 100;
      }
      if (koszty.transportNetto > 0) {
        koszty.transportBrutto = Math.round(koszty.transportNetto * newMultiplier * 100) / 100;
      }
    } else {
      koszty[field] = value;
    }
    
    setForm({ ...form, koszty });
  };

  // Konwersja waluty na PLN
  const convertToPLN = (amount, fromCurrency) => {
    if (fromCurrency === 'PLN' || !exchangeRates) return amount;
    const rate = exchangeRates[fromCurrency] || 1;
    return Math.round(amount * rate * 100) / 100;
  };

  // Wyliczenie marży - ZAWSZE W PLN
  // eslint-disable-next-line no-unused-vars
  const calcMarza = () => {
    const cenaBrutto = form.platnosci?.cenaCalkowita || 0;
    const vatRate = form.koszty?.vatRate || 23;
    const vatMultiplier = 1 + vatRate / 100;
    
    // Cena netto od klienta (w oryginalnej walucie)
    const cenaNetto = cenaBrutto / vatMultiplier;
    
    // Koszty zakupu w walucie kosztów
    const zakupNetto = form.koszty?.zakupNetto || 0;
    const kosztWaluta = form.koszty?.waluta || 'PLN';
    
    // Transport w osobnej walucie
    const transportNetto = form.koszty?.transportNetto || 0;
    const transportWaluta = form.koszty?.transportWaluta || 'PLN';
    
    // Konwertuj WSZYSTKO do PLN
    const cenaBruttoPLN = convertToPLN(cenaBrutto, form.platnosci?.waluta);
    const cenaNettoPLN = convertToPLN(cenaNetto, form.platnosci?.waluta);
    const zakupNettoPLN = convertToPLN(zakupNetto, kosztWaluta);
    const transportNettoPLN = convertToPLN(transportNetto, transportWaluta);
    
    // Marża w PLN (przed rabatem)
    let marzaPLN = cenaNettoPLN - zakupNettoPLN - transportNettoPLN;
    
    // Oblicz sumę rabatów - preferuj rabatyKierowcow jako źródło prawdy
    let sumaRabatow = 0;
    
    // 1. Sprawdź rabatyKierowcow (główne źródło prawdy)
    if (form.rabatyKierowcow) {
      sumaRabatow = Object.values(form.rabatyKierowcow).filter(r => r && r.kwota > 0).reduce((sum, r) => sum + r.kwota, 0);
    }
    
    // 2. Jeśli brak, sprawdź produkty (unikalne per kierowca)
    if (sumaRabatow === 0 && form.produkty && form.produkty.length > 0) {
      const rabatyPerKierowca = {};
      form.produkty.forEach(p => {
        if (p.rabat && p.rabat.kwota > 0 && p.rabat.kierowcaId) {
          if (!rabatyPerKierowca[p.rabat.kierowcaId]) {
            rabatyPerKierowca[p.rabat.kierowcaId] = p.rabat.kwota;
          }
        }
      });
      sumaRabatow = Object.values(rabatyPerKierowca).reduce((sum, k) => sum + k, 0);
    }
    
    // 3. Fallback na stary rabatPrzyDostawie
    if (sumaRabatow === 0 && form.rabatPrzyDostawie?.kwota > 0) {
      sumaRabatow = form.rabatPrzyDostawie.kwota;
    }
    
    // Odejmij rabat od marży (rabat jest brutto, więc przeliczamy na netto)
    if (sumaRabatow > 0) {
      const rabatNetto = sumaRabatow / vatMultiplier;
      const rabatPLN = convertToPLN(rabatNetto, form.platnosci?.waluta);
      marzaPLN -= rabatPLN;
    }
    
    // Oblicz procent marży (od ceny po rabacie)
    const skutecznaCenaNettoPLN = sumaRabatow > 0 
      ? cenaNettoPLN - convertToPLN(sumaRabatow / vatMultiplier, form.platnosci?.waluta)
      : cenaNettoPLN;
    const marzaProcentowa = skutecznaCenaNettoPLN > 0 ? Math.round(marzaPLN / skutecznaCenaNettoPLN * 100) : 0;
    
    return {
      cenaBrutto,
      cenaNetto: Math.round(cenaNetto * 100) / 100,
      cenaBruttoPLN: Math.round(cenaBruttoPLN * 100) / 100,
      cenaNettoPLN: Math.round(cenaNettoPLN * 100) / 100,
      zakupNettoOriginal: zakupNetto,
      zakupNettoPLN: Math.round(zakupNettoPLN * 100) / 100,
      zakupWaluta: kosztWaluta,
      transportNettoOriginal: transportNetto,
      transportNettoPLN: Math.round(transportNettoPLN * 100) / 100,
      transportWaluta: transportWaluta,
      marzaPLN: Math.round(marzaPLN * 100) / 100,
      marzaProcentowa,
      rabatPLN: sumaRabatow > 0 ? Math.round(convertToPLN(sumaRabatow / vatMultiplier, form.platnosci?.waluta) * 100) / 100 : 0
    };
  };

  const handleSave = async () => {
    setSaving(true);
    
    // Synchronizuj pola towar i zaladunek dla kompatybilności wstecznej
    const formToSave = { ...form };
    if (formToSave.produkty && formToSave.produkty.length > 0) {
      // Połącz opisy wszystkich produktów (BEZ nazw producentów - to info wewnętrzne)
      formToSave.towar = formToSave.produkty.map((p, idx) => {
        const prefix = formToSave.produkty.length > 1 ? `[${p.nrPodzamowienia || idx + 1}] ` : '';
        return `${prefix}${p.towar}`;
      }).join('\n\n');
      
      // Pierwszy producent jako główny (dla kompatybilności)
      formToSave.zaladunek = formToSave.produkty[0]?.producent || '';
      
      // Oblicz sumę kosztów zakupu ze wszystkich produktów
      let sumZakupNetto = 0;
      let sumZakupBrutto = 0;
      formToSave.produkty.forEach(p => {
        if (p.koszty) {
          sumZakupNetto += p.koszty.zakupNetto || 0;
          sumZakupBrutto += p.koszty.zakupBrutto || 0;
        }
      });
      formToSave.koszty = {
        ...formToSave.koszty,
        zakupNetto: sumZakupNetto,
        zakupBrutto: sumZakupBrutto
      };
    }
    
    await onSave(formToSave, currentUser);
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-form modal-fullscreen" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{order ? '✏️ Edytuj' : '➕ Nowe'} zamówienie {form.nrWlasny && `#${form.nrWlasny}`}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body modal-body-sections">
          {/* LEWA KOLUMNA - Podstawowe info i Produkty */}
          <div className="modal-column modal-column-left">
            
            {/* ========== SEKCJA 1: PODSTAWOWE INFO ========== */}
            <div className="form-section-box">
              <div className="section-header">
                <span className="section-icon">📋</span>
                <h3>Podstawowe informacje</h3>
              </div>
              <div className="section-content">
                <div className="form-row">
                  <div className="form-group">
                    <label>🌍 KRAJ DOSTAWY</label>
                    <select value={form.kraj || 'PL'} onChange={e => setForm({ ...form, kraj: e.target.value })}>
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>🔢 NR ZAMÓWIENIA</label>
                    <input value={form.nrWlasny} onChange={e => setForm({ ...form, nrWlasny: e.target.value })} placeholder="Auto" />
                  </div>
                  <div className="form-group">
                    <label>📅 DATA ZLECENIA</label>
                    <input type="date" value={form.dataZlecenia} onChange={e => setForm({ ...form, dataZlecenia: e.target.value })} />
                  </div>
                </div>
                {!isContractor && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>📅 DATA DOSTAWY</label>
                      <input type="date" value={form.dataDostawy || ''} onChange={e => setForm({ ...form, dataDostawy: e.target.value })} />
                    </div>
                    <div className="form-group">
                      {/* Puste */}
                    </div>
                    <div className="form-group">
                      {/* Puste */}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ========== SEKCJA 2: PRODUKTY ========== */}
            <div className="form-section-box products-box">
              <div className="section-header">
                <span className="section-icon">📦</span>
                <h3>Produkty ({form.produkty?.length || 0})</h3>
                {!isContractor && (
                  <button type="button" className="btn-add-small" onClick={addProduct}>
                    ➕ Dodaj produkt
                  </button>
                )}
              </div>
              <div className="section-content">
                {/* Zakładki produktów */}
                {form.produkty && form.produkty.length > 1 && (
                  <div className="product-tabs-horizontal">
                    {form.produkty.map((prod, idx) => {
                      const prodStatus = getStatus(prod.status);
                      const prodDriver = drivers.find(d => d.id === prod.kierowca);
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          className={`product-tab-h ${activeProductIndex === idx ? 'active' : ''}`}
                          onClick={() => setActiveProductIndex(idx)}
                        >
                          <span className="tab-nr">#{idx + 1}</span>
                          <span className="tab-status-dot" style={{ background: prodStatus?.color }}></span>
                          {prodDriver && <span className="tab-driver">🚚</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Aktywny produkt */}
                {form.produkty && form.produkty[activeProductIndex] && (
                  <div className="product-edit-card">
                    <div className="product-card-header">
                      <span>Produkt {activeProductIndex + 1} {form.produkty[activeProductIndex].nrPodzamowienia ? `(${form.produkty[activeProductIndex].nrPodzamowienia})` : ''}</span>
                      {form.produkty.length > 1 && (
                        <button type="button" className="btn-remove-small" onClick={() => removeProduct(activeProductIndex)}>🗑️</button>
                      )}
                    </div>
                    
                    {/* Opis towaru */}
                    <div className="form-group full">
                      <label>📝 OPIS TOWARU *</label>
                      <textarea 
                        value={form.produkty[activeProductIndex].towar || ''} 
                        onChange={e => updateProduct(activeProductIndex, 'towar', e.target.value)} 
                        rows={3} 
                        placeholder="Szczegółowy opis produktu..."
                      />
                    </div>

                    {!isContractor && (
                      <div className="product-details-grid">
                        <div className="form-group">
                          <label>🏭 PRODUCENT</label>
                          <select 
                            value={form.produkty[activeProductIndex].producent || ''} 
                            onChange={e => {
                              updateProduct(activeProductIndex, 'producent', e.target.value);
                              if (e.target.value !== '_other') {
                                updateProduct(activeProductIndex, 'producentNazwa', '');
                              }
                            }}
                          >
                            <option value="">-- Wybierz --</option>
                            {Object.values(producers).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                            <option value="_other">➕ Inny...</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>📊 STATUS</label>
                          <select 
                            value={form.produkty[activeProductIndex].status || 'nowe'} 
                            onChange={e => updateProduct(activeProductIndex, 'status', e.target.value)}
                          >
                            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>🚚 KIEROWCA</label>
                          <select 
                            value={form.produkty[activeProductIndex].kierowca || ''} 
                            onChange={e => updateProduct(activeProductIndex, 'kierowca', e.target.value)}
                          >
                            <option value="">-- Wybierz --</option>
                            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>📅 DATA ODBIORU</label>
                          <input 
                            type="date" 
                            value={form.produkty[activeProductIndex].dataOdbioru || ''} 
                            onChange={e => updateProduct(activeProductIndex, 'dataOdbioru', e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Inny producent */}
                    {form.produkty[activeProductIndex].producent === '_other' && (
                      <div className="form-group full">
                        <label>NAZWA PRODUCENTA</label>
                        <input 
                          value={form.produkty[activeProductIndex].producentNazwa || ''} 
                          onChange={e => updateProduct(activeProductIndex, 'producentNazwa', e.target.value)}
                          placeholder="Wpisz nazwę..."
                        />
                      </div>
                    )}

                    {/* Przycisk email do producenta */}
                    {!isContractor && form.produkty[activeProductIndex].producent && form.produkty[activeProductIndex].producent !== '_other' && (
                      <button 
                        type="button" 
                        className="btn-producer-email"
                        onClick={() => setShowEmailModal({ type: 'producer', productIndex: activeProductIndex })}
                      >
                        📧 Wyślij zapytanie/zlecenie do producenta
                      </button>
                    )}

                    {/* ===== KOSZTY PRODUKTU (tylko admin) ===== */}
                    {isAdmin && (
                      <div className="product-costs-section">
                        <div className="product-costs-header">
                          <h4>💰 Koszty tego produktu</h4>
                        </div>

                        {/* 1. CENA DLA KLIENTA */}
                        <div className="cost-input-row highlight-green">
                          <label>💵 Cena dla klienta (brutto):</label>
                          <div className="cost-input-group">
                            <select 
                              value={form.platnosci?.waluta || 'PLN'} 
                              onChange={e => updatePlatnosci('waluta', e.target.value)}
                              className="currency-select-small"
                            >
                              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                            <input 
                              type="number" 
                              step="0.01"
                              value={form.produkty[activeProductIndex].cenaKlienta || ''} 
                              onChange={e => {
                                const newCena = parseFloat(e.target.value) || 0;
                                updateProduct(activeProductIndex, 'cenaKlienta', newCena);
                                
                                // Automatycznie aktualizuj sumę w płatnościach
                                const sumaCen = form.produkty.reduce((sum, p, idx) => {
                                  if (idx === activeProductIndex) return sum + newCena;
                                  return sum + (p.cenaKlienta || 0);
                                }, 0);
                                
                                setForm(prev => ({
                                  ...prev,
                                  produkty: prev.produkty.map((p, idx) => 
                                    idx === activeProductIndex ? { ...p, cenaKlienta: newCena } : p
                                  ),
                                  platnosci: {
                                    ...prev.platnosci,
                                    cenaCalkowita: sumaCen,
                                    doZaplaty: Math.max(0, sumaCen - (prev.platnosci?.zaplacono || 0))
                                  }
                                }));
                              }}
                              placeholder="0.00"
                              className="cost-input"
                            />
                          </div>
                        </div>

                        {/* 2. DO POBRANIA PRZEZ KIEROWCĘ */}
                        <div className="cost-input-row highlight-orange">
                          <label>🚚 Do pobrania przez kierowcę:</label>
                          <div className="cost-input-group">
                            <span className="currency-label-fixed">{getCurrency(form.platnosci?.waluta || 'PLN').symbol}</span>
                            <input 
                              type="number" 
                              step="0.01"
                              value={form.produkty[activeProductIndex].doPobrania || ''} 
                              onChange={e => updateProduct(activeProductIndex, 'doPobrania', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="cost-input"
                            />
                          </div>
                        </div>

                        {/* 3. KOSZT ZAKUPU - oddzielna waluta */}
                        <div className="cost-input-row">
                          <label>🏭 Koszt zakupu (netto):</label>
                          <div className="cost-input-group">
                            <select 
                              value={form.produkty[activeProductIndex].koszty?.waluta || 'PLN'} 
                              onChange={e => updateProductCost(activeProductIndex, 'waluta', e.target.value)}
                              className="currency-select-small"
                            >
                              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                            <input 
                              type="number" 
                              step="0.01"
                              value={form.produkty[activeProductIndex].koszty?.zakupNetto || ''} 
                              onChange={e => updateProductCost(activeProductIndex, 'zakupNetto', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="cost-input"
                            />
                            {priceLists && priceLists.length > 0 && (
                              <button 
                                type="button" 
                                className="btn-search-price"
                                onClick={() => setShowProductSearchInOrder(activeProductIndex)}
                                title="Szukaj w cennikach"
                              >
                                🔍
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 4. KOSZT TRANSPORTU - oddzielna waluta */}
                        <div className="cost-input-row">
                          <label>🚚 Koszt transportu (netto):</label>
                          <div className="cost-input-group">
                            <select 
                              value={form.produkty[activeProductIndex].koszty?.transportWaluta || 'PLN'} 
                              onChange={e => updateProductCost(activeProductIndex, 'transportWaluta', e.target.value)}
                              className="currency-select-small"
                            >
                              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                            <input 
                              type="number" 
                              step="0.01"
                              value={form.produkty[activeProductIndex].koszty?.transportNetto || ''} 
                              onChange={e => updateProductCost(activeProductIndex, 'transportNetto', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="cost-input"
                            />
                          </div>
                        </div>

                        {/* Stawki kierowcy - podpowiedź */}
                        {form.produkty[activeProductIndex].kierowca && (() => {
                          const prodDriver = drivers.find(d => d.id === form.produkty[activeProductIndex].kierowca);
                          const driverRates = prodDriver?.transportRates || [];
                          const countryRates = driverRates.filter(r => r.country === form.kraj);
                          
                          if (countryRates.length > 0) {
                            return (
                              <div className="driver-rates-quick">
                                <span className="rates-label">💶 Stawki {prodDriver?.name}:</span>
                                <div className="rates-buttons">
                                  {countryRates.map(rate => (
                                    <button
                                      key={rate.id}
                                      type="button"
                                      className="rate-quick-btn-small"
                                      onClick={() => {
                                        updateProductCost(activeProductIndex, 'transportWaluta', rate.currency);
                                        updateProductCost(activeProductIndex, 'transportNetto', rate.priceNetto);
                                      }}
                                    >
                                      {rate.name}: {rate.priceNetto} {CURRENCIES.find(c => c.code === rate.currency)?.symbol}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* MARŻA - wyliczana w PLN z pokazaniem przeliczeń */}
                        {(() => {
                          const walutaKlienta = form.platnosci?.waluta || 'PLN';
                          const walutaZakupu = form.produkty[activeProductIndex].koszty?.waluta || 'PLN';
                          const walutaTransportu = form.produkty[activeProductIndex].koszty?.transportWaluta || 'PLN';
                          
                          const cenaKlienta = form.produkty[activeProductIndex].cenaKlienta || 0;
                          const kosztZakupu = form.produkty[activeProductIndex].koszty?.zakupNetto || 0;
                          const kosztTransportu = form.produkty[activeProductIndex].koszty?.transportNetto || 0;
                          
                          // Pobierz kursy z NBP (PLN = 1)
                          const rateKlienta = exchangeRates?.[walutaKlienta] || 1;
                          const rateZakupu = exchangeRates?.[walutaZakupu] || 1;
                          const rateTransportu = exchangeRates?.[walutaTransportu] || 1;
                          
                          // Przelicz na PLN
                          const cenaKlientaPLN = cenaKlienta * rateKlienta;
                          const kosztZakupuPLN = kosztZakupu * rateZakupu;
                          const kosztTransportuPLN = kosztTransportu * rateTransportu;
                          
                          // Marża netto (zakładamy VAT 23%)
                          const cenaNettoPLN = cenaKlientaPLN / 1.23;
                          const marzaPLN = cenaNettoPLN - kosztZakupuPLN - kosztTransportuPLN;
                          
                          return (
                            <div className={`product-margin-display ${marzaPLN >= 0 ? 'positive' : 'negative'}`}>
                              <div className="margin-calculation">
                                <div className="calc-row">
                                  <span>Cena klienta netto:</span>
                                  <span>
                                    {formatCurrency(cenaKlienta, walutaKlienta)} / 1.23 
                                    {walutaKlienta !== 'PLN' && ` × ${rateKlienta.toFixed(4)}`} 
                                    = <strong>{formatCurrency(cenaNettoPLN, 'PLN')}</strong>
                                  </span>
                                </div>
                                <div className="calc-row minus">
                                  <span>− Koszt zakupu:</span>
                                  <span>
                                    {formatCurrency(kosztZakupu, walutaZakupu)}
                                    {walutaZakupu !== 'PLN' && ` × ${rateZakupu.toFixed(4)}`} 
                                    = <strong>{formatCurrency(kosztZakupuPLN, 'PLN')}</strong>
                                  </span>
                                </div>
                                <div className="calc-row minus">
                                  <span>− Koszt transportu:</span>
                                  <span>
                                    {formatCurrency(kosztTransportu, walutaTransportu)}
                                    {walutaTransportu !== 'PLN' && ` × ${rateTransportu.toFixed(4)}`} 
                                    = <strong>{formatCurrency(kosztTransportuPLN, 'PLN')}</strong>
                                  </span>
                                </div>
                              </div>
                              <div className="margin-result">
                                <span>📊 Marża netto:</span>
                                <strong>{formatCurrency(Math.round(marzaPLN * 100) / 100, 'PLN')}</strong>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PRAWA KOLUMNA - Klient, Płatności, Koszty */}
          <div className="modal-column modal-column-right">
            
            {/* ========== SEKCJA 3: DANE KLIENTA ========== */}
            <div className="form-section-box">
              <div className="section-header">
                <span className="section-icon">👤</span>
                <h3>Dane klienta</h3>
              </div>
              <div className="section-content">
                <div className="client-grid">
                  <div className="form-group name-autocomplete">
                    <label>IMIĘ I NAZWISKO</label>
                    <input 
                      value={form.klient?.imie || ''} 
                      onChange={e => handleNameChange(e.target.value)} 
                      onFocus={() => {
                        const sugg = getContactSuggestions(form.klient?.imie || '');
                        setSuggestions(sugg);
                        setShowSuggestions(sugg.length > 0);
                      }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Jan Kowalski" 
                      autoComplete="off"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="suggestions-dropdown">
                        <div className="suggestions-header">📇 Znalezieni klienci:</div>
                        {suggestions.map((s, idx) => (
                          <div key={idx} className="suggestion-item" onMouseDown={() => selectSuggestion(s)}>
                            <div className="suggestion-name">{s.imie}</div>
                            <div className="suggestion-details">
                              {s.telefon && <span>📞 {s.telefon}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>TELEFON</label>
                    <input value={form.klient?.telefon || ''} onChange={e => updateKlient('telefon', e.target.value)} placeholder="+48 123 456 789" />
                  </div>
                  <div className="form-group full-width">
                    <label>ADRES DOSTAWY</label>
                    <input value={form.klient?.adres || ''} onChange={e => updateKlient('adres', e.target.value)} placeholder="ul. Przykładowa 1, 00-000 Miasto" />
                  </div>
                  <div className="form-group">
                    <label>EMAIL</label>
                    <input value={form.klient?.email || ''} onChange={e => updateKlient('email', e.target.value)} placeholder="email@example.com" />
                  </div>
                  <div className="form-group">
                    <label>FACEBOOK</label>
                    <input value={form.klient?.facebookUrl || ''} onChange={e => updateKlient('facebookUrl', e.target.value)} placeholder="https://facebook.com/..." />
                  </div>
                </div>
              </div>
            </div>

            {/* ========== SEKCJA 4: PŁATNOŚCI ========== */}
            <div className="form-section-box">
              <div className="section-header">
                <span className="section-icon">💳</span>
                <h3>Płatności</h3>
              </div>
              <div className="section-content">
                <div className="payment-grid">
                  <div className="form-group">
                    <label>WALUTA</label>
                    <select value={form.platnosci?.waluta || 'PLN'} onChange={e => updatePlatnosci('waluta', e.target.value)}>
                      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>CENA CAŁKOWITA</label>
                    <input 
                      type="number" 
                      value={form.platnosci?.cenaCalkowita || ''} 
                      onChange={e => updatePlatnosci('cenaCalkowita', parseFloat(e.target.value) || 0)} 
                    />
                  </div>
                  <div className="form-group">
                    <label>ZAPŁACONO</label>
                    <input 
                      type="number" 
                      value={form.platnosci?.zaplacono || ''} 
                      onChange={e => updatePlatnosci('zaplacono', parseFloat(e.target.value) || 0)} 
                    />
                  </div>
                  <div className="form-group">
                    <label>METODA</label>
                    <select value={form.platnosci?.metodaZaplaty || ''} onChange={e => updatePlatnosci('metodaZaplaty', e.target.value)}>
                      <option value="">-- Wybierz --</option>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>DATA PŁATNOŚCI</label>
                    <input type="date" value={form.platnosci?.dataZaplaty || ''} onChange={e => updatePlatnosci('dataZaplaty', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>DO ZAPŁATY</label>
                    <input 
                      type="number" 
                      value={form.platnosci?.doZaplaty || 0} 
                      readOnly 
                      className={form.platnosci?.doZaplaty > 0 ? 'unpaid-input' : 'paid-input'} 
                    />
                  </div>
                </div>

                {/* Podsumowanie płatności */}
                <div className={`payment-summary ${form.platnosci?.doZaplaty > 0 ? 'unpaid' : ''}`}>
                  <div className="payment-summary-row">
                    <span>Cena całkowita:</span>
                    <strong>{formatCurrency(form.platnosci?.cenaCalkowita || 0, form.platnosci?.waluta)}</strong>
                  </div>
                  <div className="payment-summary-row">
                    <span>Zapłacono:</span>
                    <strong>{formatCurrency(form.platnosci?.zaplacono || 0, form.platnosci?.waluta)}</strong>
                  </div>
                  <div className="payment-summary-row total">
                    <span>{form.platnosci?.doZaplaty > 0 ? '⚠️ Pozostało do zapłaty:' : '✅ Opłacone'}</span>
                    <strong>{formatCurrency(form.platnosci?.doZaplaty || 0, form.platnosci?.waluta)}</strong>
                  </div>
                </div>

                {/* Pobranie per kierowca - edytowalne z metodą płatności i notatkami */}
                {form.produkty && form.produkty.length > 0 && (() => {
                  // Grupuj produkty per kierowca
                  const driverProducts = {};
                  form.produkty.forEach((p, idx) => {
                    const driverId = p.kierowca;
                    if (driverId) {
                      if (!driverProducts[driverId]) driverProducts[driverId] = [];
                      driverProducts[driverId].push({ ...p, index: idx });
                    }
                  });
                  const driverIds = Object.keys(driverProducts);
                  
                  if (driverIds.length > 0) {
                    return (
                      <div className="driver-collection-info">
                        <h4>🚚 Pobranie per kierowca:</h4>
                        {driverIds.map(dId => {
                          const driver = drivers.find(d => d.id === dId);
                          const products = driverProducts[dId];
                          const totalAmount = products.reduce((sum, p) => sum + (p.doPobrania || 0), 0);
                          
                          return (
                            <div key={dId} className="driver-collection-block">
                              <div className="driver-collection-header">
                                <span className="driver-name">🚗 {driver?.name || 'Nieznany'}</span>
                                <span className="driver-total">{formatCurrency(totalAmount, form.platnosci?.waluta)}</span>
                              </div>
                              
                              {/* Produkty tego kierowcy */}
                              {products.map(p => (
                                <div key={p.index} className="driver-product-row">
                                  <span className="product-label">#{p.index + 1}: {p.towar?.substring(0, 20) || 'Produkt'}...</span>
                                  <div className="product-amount-edit">
                                    <span>{getCurrency(form.platnosci?.waluta || 'PLN').symbol}</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={p.doPobrania || ''}
                                      onChange={e => updateProduct(p.index, 'doPobrania', parseFloat(e.target.value) || 0)}
                                      className="driver-amount-input"
                                    />
                                  </div>
                                </div>
                              ))}
                              
                              {/* Metoda płatności przy dostawie */}
                              <div className="driver-payment-method">
                                <label>💳 Metoda pobrania:</label>
                                <select
                                  value={products[0]?.metodaPobrania || 'gotowka'}
                                  onChange={e => {
                                    // Ustaw metodę dla wszystkich produktów tego kierowcy
                                    products.forEach(p => {
                                      updateProduct(p.index, 'metodaPobrania', e.target.value);
                                    });
                                  }}
                                  className="payment-method-select"
                                >
                                  <option value="gotowka">💵 Gotówka</option>
                                  <option value="przelew">🏦 Przelew</option>
                                  <option value="karta">💳 Karta</option>
                                  <option value="blik">📱 BLIK</option>
                                  <option value="oplacone">✅ Już opłacone</option>
                                </select>
                              </div>
                              
                              {/* Notatka dla kierowcy */}
                              <div className="driver-note-section">
                                <label>📝 Notatka dla kierowcy:</label>
                                <textarea
                                  value={products[0]?.notatkaKierowcy || ''}
                                  onChange={e => {
                                    // Ustaw notatkę dla wszystkich produktów tego kierowcy
                                    products.forEach(p => {
                                      updateProduct(p.index, 'notatkaKierowcy', e.target.value);
                                    });
                                  }}
                                  placeholder="Np. dzwonić przed dostawą, kod do bramy: 1234..."
                                  className="driver-note-input"
                                  rows={2}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* ========== SEKCJA 5: KOSZTY (admin) ========== */}
            {isAdmin && (
              <div className="form-section-box">
                <div className="section-header">
                  <span className="section-icon">📊</span>
                  <h3>Koszty i marża</h3>
                </div>
                <div className="section-content">
                  {/* Podsumowanie kosztów z produktów */}
                  {form.produkty && form.produkty.length > 0 && (
                    <div className="costs-summary-box">
                      <h4>💰 Koszty produktów:</h4>
                      <div className="costs-products-list">
                        {form.produkty.map((p, idx) => {
                          const zakupPLN = (p.koszty?.zakupNetto || 0) * (exchangeRates?.[p.koszty?.waluta || 'PLN'] || 1);
                          const transportPLN = (p.koszty?.transportNetto || 0) * (exchangeRates?.[p.koszty?.transportWaluta || 'PLN'] || 1);
                          return (
                            <div key={idx} className="cost-product-row">
                              <span>#{idx + 1}: {p.towar?.substring(0, 20) || 'Produkt'}...</span>
                              <span>
                                Zakup: {formatCurrency(zakupPLN, 'PLN')} | 
                                Transport: {formatCurrency(transportPLN, 'PLN')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
                        <strong>Suma kosztów (PLN):</strong>
                        <strong>
                          {formatCurrency(
                            form.produkty.reduce((s, p) => {
                              const zakup = p.koszty?.zakupNetto || 0;
                              const rateZ = exchangeRates?.[p.koszty?.waluta || 'PLN'] || 1;
                              const transport = p.koszty?.transportNetto || 0;
                              const rateT = exchangeRates?.[p.koszty?.transportWaluta || 'PLN'] || 1;
                              return s + (zakup * rateZ) + (transport * rateT);
                            }, 0), 
                            'PLN'
                          )} netto
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Marża - ZAWSZE W PLN */}
                  {(() => {
                    // Cena klienta brutto -> netto
                    const cenaBrutto = form.platnosci?.cenaCalkowita || 0;
                    const walutaKlienta = form.platnosci?.waluta || 'PLN';
                    const cenaNetto = cenaBrutto / 1.23;
                    
                    // Kurs waluty klienta do PLN
                    const rateKlienta = exchangeRates?.[walutaKlienta] || 1;
                    const cenaNettoPLN = cenaNetto * rateKlienta;
                    
                    // Koszty zakupu w PLN
                    let kosztyZakupuPLN = 0;
                    let kosztyTransportPLN = 0;
                    
                    if (form.produkty && form.produkty.length > 0) {
                      form.produkty.forEach(p => {
                        // Zakup
                        const zakupNetto = p.koszty?.zakupNetto || 0;
                        const walutaZakupu = p.koszty?.waluta || 'PLN';
                        const rateZakupu = exchangeRates?.[walutaZakupu] || 1;
                        kosztyZakupuPLN += zakupNetto * rateZakupu;
                        
                        // Transport
                        const transportNetto = p.koszty?.transportNetto || 0;
                        const walutaTransport = p.koszty?.transportWaluta || 'PLN';
                        const rateTransport = exchangeRates?.[walutaTransport] || 1;
                        kosztyTransportPLN += transportNetto * rateTransport;
                      });
                    } else {
                      // Stare zamówienie
                      const zakup = form.koszty?.zakupNetto || 0;
                      const rateZ = exchangeRates?.[form.koszty?.waluta || 'PLN'] || 1;
                      kosztyZakupuPLN = zakup * rateZ;
                      
                      const transport = form.koszty?.transportNetto || 0;
                      const rateT = exchangeRates?.[form.koszty?.transportWaluta || 'PLN'] || 1;
                      kosztyTransportPLN = transport * rateT;
                    }
                    
                    const marzaPLN = cenaNettoPLN - kosztyZakupuPLN - kosztyTransportPLN;
                    
                    return (
                      <div className={`margin-display ${marzaPLN >= 0 ? 'positive' : 'negative'}`}>
                        <span>📈 Szacowana marża netto:</span>
                        <strong>{formatCurrency(Math.round(marzaPLN * 100) / 100, 'PLN')}</strong>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ========== SEKCJA 6: UWAGI ========== */}
            <div className="form-section-box">
              <div className="section-header">
                <span className="section-icon">📝</span>
                <h3>Uwagi</h3>
              </div>
              <div className="section-content notes-section">
                <textarea 
                  value={form.uwagi || ''} 
                  onChange={e => setForm({ ...form, uwagi: e.target.value })}
                  placeholder="Dodatkowe uwagi do zamówienia..."
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER Z PRZYCISKAMI */}
        <div className="modal-footer-full">
          <div className="footer-left-actions">
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={() => setShowConfirmationModal(true)}
              disabled={!form.klient?.email}
              title={!form.klient?.email ? 'Wpisz email klienta aby wysłać potwierdzenie' : ''}
              style={!form.klient?.email ? {opacity: 0.5, cursor: 'not-allowed'} : {}}
            >
              📧 Wyślij potwierdzenie
            </button>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={() => {
                // Generuj PDF potwierdzenia do druku
                const printWindow = window.open('', '_blank');
                const produktyHTML = form.produkty?.map((p, idx) => `
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${p.nrPodzamowienia || `#${idx + 1}`}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${p.towar || '—'}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right;">${p.koszty?.cenaKlient || 0} ${p.koszty?.waluta || 'EUR'}</td>
                  </tr>
                `).join('') || `
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${form.nrWlasny || '—'}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${form.towar || '—'}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right;">${form.platnosci?.cenaCalkowita || 0} ${form.platnosci?.waluta || 'EUR'}</td>
                  </tr>
                `;
                
                printWindow.document.write(`
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="UTF-8">
                    <title>Potwierdzenie zamówienia ${form.nrWlasny || ''}</title>
                    <style>
                      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                      .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #4F46E5; }
                      .header h1 { color: #4F46E5; margin: 0 0 10px 0; }
                      .header p { color: #6B7280; margin: 0; }
                      .section { margin-bottom: 30px; }
                      .section-title { font-size: 14px; color: #6B7280; text-transform: uppercase; margin-bottom: 10px; font-weight: 600; }
                      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                      .info-box { background: #F9FAFB; padding: 15px; border-radius: 8px; }
                      .info-box label { font-size: 12px; color: #6B7280; display: block; margin-bottom: 5px; }
                      .info-box span { font-size: 16px; font-weight: 600; color: #1F2937; }
                      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                      th { background: #4F46E5; color: white; padding: 12px; text-align: left; }
                      .total { text-align: right; font-size: 20px; font-weight: 700; color: #4F46E5; margin-top: 20px; }
                      .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; color: #9CA3AF; font-size: 12px; }
                      @media print { body { padding: 20px; } }
                    </style>
                  </head>
                  <body>
                    <div class="header">
                      <h1>POTWIERDZENIE ZAMÓWIENIA</h1>
                      <p>Nr: <strong>${form.nrWlasny || '—'}</strong> | Data: ${new Date().toLocaleDateString('pl-PL')}</p>
                    </div>
                    
                    <div class="section">
                      <div class="section-title">Dane klienta</div>
                      <div class="info-grid">
                        <div class="info-box">
                          <label>Imię i nazwisko</label>
                          <span>${form.klient?.imie || '—'}</span>
                        </div>
                        <div class="info-box">
                          <label>Email</label>
                          <span>${form.klient?.email || '—'}</span>
                        </div>
                        <div class="info-box">
                          <label>Telefon</label>
                          <span>${form.klient?.telefon || '—'}</span>
                        </div>
                        <div class="info-box">
                          <label>Adres dostawy</label>
                          <span>${form.klient?.adres || '—'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div class="section">
                      <div class="section-title">Zamówione produkty</div>
                      <table>
                        <thead>
                          <tr>
                            <th>Nr</th>
                            <th>Opis towaru</th>
                            <th style="text-align: right;">Cena</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${produktyHTML}
                        </tbody>
                      </table>
                      <div class="total">
                        Do zapłaty: ${form.platnosci?.cenaCalkowita || 0} ${form.platnosci?.waluta || 'EUR'}
                      </div>
                    </div>
                    
                    <div class="section">
                      <div class="section-title">Informacje o płatności</div>
                      <div class="info-grid">
                        <div class="info-box">
                          <label>Wpłacona zaliczka</label>
                          <span>${form.platnosci?.zaplacono || 0} ${form.platnosci?.waluta || 'EUR'}</span>
                        </div>
                        <div class="info-box">
                          <label>Pozostało do zapłaty</label>
                          <span>${form.platnosci?.doZaplaty || 0} ${form.platnosci?.waluta || 'EUR'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div class="footer">
                      <p>Dziękujemy za zamówienie! • Herraton</p>
                      <p>Wygenerowano: ${new Date().toLocaleString('pl-PL')}</p>
                    </div>
                    
                    <script>window.onload = function() { window.print(); }</script>
                  </body>
                  </html>
                `);
                printWindow.document.close();
              }}
            >
              🖨️ Drukuj potwierdzenie
            </button>
            <button 
              type="button" 
              className="btn-secondary" 
              style={{background: '#EEF2FF', color: '#4F46E5', borderColor: '#C7D2FE'}}
              onClick={async (e) => {
                if (!form.klient?.imie) {
                  alert('❌ Uzupełnij dane klienta (imię i nazwisko) przed utworzeniem faktury.');
                  return;
                }
                
                // Zapisz referencję do przycisku PRZED async operacjami
                const btn = e.currentTarget;
                const originalText = btn.innerHTML;
                
                const confirmCreate = await new Promise((resolve) => {
                  // Tworzymy modal wyboru typu faktury
                  const modalDiv = document.createElement('div');
                  modalDiv.className = 'invoice-type-modal-overlay';
                  modalDiv.innerHTML = `
                    <div class="invoice-type-modal">
                      <h3>📄 Wystaw dokument w wFirma</h3>
                      <div class="invoice-details">
                        <p><strong>Klient:</strong> ${form.klient?.imie || '—'}</p>
                        <p><strong>Email:</strong> ${form.klient?.email || 'brak'}</p>
                        <p><strong>Kwota:</strong> ${form.platnosci?.cenaCalkowita || 0} ${form.platnosci?.waluta || 'EUR'}</p>
                      </div>
                      <div class="invoice-type-select">
                        <label>Typ dokumentu:</label>
                        <div class="invoice-type-buttons">
                          <button type="button" class="invoice-type-btn btn-invoice-vat">
                            📄 Faktura VAT
                          </button>
                          <button type="button" class="invoice-type-btn btn-invoice-proforma">
                            📋 Proforma
                          </button>
                        </div>
                      </div>
                      <div class="invoice-email-option">
                        <label>
                          <input type="checkbox" id="sendInvoiceEmail" ${form.klient?.email ? 'checked' : 'disabled'}>
                          Wyślij dokument na email klienta
                        </label>
                        ${!form.klient?.email ? '<small style="color: #EF4444;">Brak adresu email klienta</small>' : ''}
                      </div>
                      <div class="invoice-modal-actions">
                        <button type="button" class="btn-cancel">Anuluj</button>
                      </div>
                    </div>
                  `;
                  document.body.appendChild(modalDiv);
                  
                  // Obsługa przycisku Anuluj
                  const cancelBtn = modalDiv.querySelector('.btn-cancel');
                  cancelBtn.addEventListener('click', () => {
                    document.body.removeChild(modalDiv);
                    resolve(null);
                  });
                  
                  // Obsługa kliknięcia w tło
                  modalDiv.addEventListener('click', (evt) => {
                    if (evt.target === modalDiv) {
                      document.body.removeChild(modalDiv);
                      resolve(null);
                    }
                  });
                  
                  // Obsługa przycisku Faktura VAT
                  const vatBtn = modalDiv.querySelector('.btn-invoice-vat');
                  vatBtn.addEventListener('click', () => {
                    const sendEmail = modalDiv.querySelector('#sendInvoiceEmail')?.checked || false;
                    document.body.removeChild(modalDiv);
                    resolve({ type: 'normal', sendEmail });
                  });
                  
                  // Obsługa przycisku Proforma
                  const proformaBtn = modalDiv.querySelector('.btn-invoice-proforma');
                  proformaBtn.addEventListener('click', () => {
                    const sendEmail = modalDiv.querySelector('#sendInvoiceEmail')?.checked || false;
                    document.body.removeChild(modalDiv);
                    resolve({ type: 'proforma', sendEmail });
                  });
                });
                
                if (!confirmCreate) return;
                
                // Pokaż loading
                btn.innerHTML = '⏳ Tworzę dokument...';
                btn.disabled = true;
                
                try {
                  const result = await createWFirmaInvoice(form, confirmCreate.type);
                  
                  if (result.success) {
                    let message = `✅ ${result.message}`;
                    
                    // Jeśli zaznaczono wysyłkę email i mamy email klienta
                    if (confirmCreate.sendEmail && form.klient?.email && result.invoiceId) {
                      btn.innerHTML = '📧 Wysyłam email...';
                      
                      const docType = confirmCreate.type === 'proforma' ? 'Proforma' : 'Faktura';
                      const invoiceUrl = `${window.location.origin}/api/invoice/${result.invoiceId}`;
                      
                      try {
                        const emailResult = await sendEmailViaMailerSend(
                          form.klient.email,
                          form.klient.imie || 'Klient',
                          `${docType} nr ${result.invoiceNumber || ''} - Herraton`,
                          `Szanowny Kliencie,

Przesyłamy ${docType.toLowerCase()} nr ${result.invoiceNumber || ''}.

Zamówienie: ${form.nrWlasny || ''}
Kwota: ${form.platnosci?.cenaCalkowita || 0} ${form.platnosci?.waluta || 'EUR'}

Kliknij poniższy link, aby zobaczyć dokument:
${invoiceUrl}

Dziękujemy za zakupy!

Pozdrawiamy,
Zespół Herraton`,
                          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                              <div style="font-size: 48px;">📄</div>
                              <h1 style="color: #1E293B; margin: 10px 0;">${docType}</h1>
                              <p style="color: #64748B; font-size: 18px;">Nr: ${result.invoiceNumber || ''}</p>
                            </div>
                            
                            <p style="color: #334155; font-size: 16px;">Szanowny Kliencie,</p>
                            <p style="color: #334155; font-size: 16px;">Przesyłamy ${docType.toLowerCase()} za Twoje zamówienie.</p>
                            
                            <div style="background: linear-gradient(135deg, #EEF2FF, #E0E7FF); padding: 20px; border-radius: 12px; margin: 25px 0; text-align: center;">
                              <p style="color: #6366F1; font-size: 14px; margin-bottom: 5px;">Kwota do zapłaty</p>
                              <p style="color: #4F46E5; font-size: 32px; font-weight: 700; margin: 0;">${form.platnosci?.cenaCalkowita || 0} ${form.platnosci?.waluta || 'EUR'}</p>
                            </div>
                            
                            <div style="background: #F8FAFC; padding: 16px; border-radius: 8px; margin: 20px 0;">
                              <p style="margin: 6px 0; color: #475569;"><strong>Zamówienie:</strong> ${form.nrWlasny || ''}</p>
                              <p style="margin: 6px 0; color: #475569;"><strong>Data:</strong> ${new Date().toLocaleDateString('pl-PL')}</p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                              <a href="${invoiceUrl}" style="display: inline-block; background: linear-gradient(135deg, #3B82F6, #2563EB); color: white; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                📄 Zobacz ${docType.toLowerCase()}
                              </a>
                            </div>
                            
                            <p style="color: #334155; font-size: 16px;">Dziękujemy za zakupy!</p>
                            
                            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 30px 0;">
                            
                            <p style="color: #94A3B8; font-size: 13px; text-align: center;">
                              Pozdrawiamy,<br>
                              <strong style="color: #64748B;">Zespół Herraton</strong>
                            </p>
                          </div>`
                        );
                        
                        if (emailResult.success) {
                          message += `\n\n📧 Email wysłany na: ${form.klient.email}`;
                        } else {
                          message += `\n\n⚠️ Nie udało się wysłać emaila: ${emailResult.error}`;
                        }
                      } catch (emailErr) {
                        message += `\n\n⚠️ Błąd wysyłki emaila: ${emailErr.message}`;
                      }
                    }
                    
                    alert(message);
                  } else {
                    alert(`❌ Błąd: ${result.error}\n\nSprawdź dane i spróbuj ponownie.`);
                  }
                } catch (err) {
                  alert(`❌ Błąd połączenia: ${err.message}`);
                } finally {
                  btn.innerHTML = originalText;
                  btn.disabled = false;
                }
              }}
            >
              📄 Faktura / Proforma
            </button>
          </div>
          <div className="footer-right-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Anuluj</button>
            <button 
              type="button" 
              className="btn-primary btn-save-order" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '⏳ Zapisuję...' : '💾 Zapisz zamówienie'}
            </button>
          </div>
        </div>

        {/* Modal podglądu potwierdzenia dla klienta */}
        {showConfirmationModal && (
          <div className="confirmation-modal-overlay">
            <div className="confirmation-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '550px'}}>
              <div className="confirmation-modal-header">
                <h3>📧 Wyślij link do potwierdzenia</h3>
                <button className="btn-close" onClick={() => setShowConfirmationModal(false)}>×</button>
              </div>
              <div className="confirmation-modal-body">
                <div style={{background: '#F0FDF4', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #86EFAC'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px'}}>
                    <span style={{fontSize: '32px'}}>✉️</span>
                    <div>
                      <p style={{margin: 0, fontWeight: '600', color: '#166534'}}>Nowy system potwierdzania</p>
                      <p style={{margin: '5px 0 0 0', fontSize: '14px', color: '#15803D'}}>
                        Klient otrzyma link do panelu, gdzie zobaczy szczegóły i potwierdzi zamówienie.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div style={{background: '#F9FAFB', padding: '15px', borderRadius: '10px', marginBottom: '15px'}}>
                  <p style={{margin: '0 0 10px 0', fontSize: '14px', color: '#6B7280'}}>
                    <strong>Do:</strong> {form.klient?.email}
                  </p>
                  <p style={{margin: '0 0 10px 0', fontSize: '14px', color: '#6B7280'}}>
                    <strong>Temat:</strong> Potwierdź zamówienie {form.nrWlasny}
                  </p>
                </div>
                
                <div style={{background: '#FEF3C7', padding: '15px', borderRadius: '10px'}}>
                  <p style={{margin: 0, fontSize: '13px', color: '#92400E'}}>
                    <strong>💡 Jak to działa:</strong><br/>
                    1. Klient otrzyma email z przyciskiem "Potwierdź zamówienie"<br/>
                    2. Po kliknięciu zobaczy panel ze szczegółami zamówienia<br/>
                    3. Po potwierdzeniu otrzyma link do śledzenia statusu<br/>
                    4. W systemie zobaczysz ✅ przy potwierdzonym zamówieniu
                  </p>
                </div>
                
                {form.wyslanieDoPotwierdzenia && (
                  <div style={{marginTop: '15px', padding: '10px', background: '#DBEAFE', borderRadius: '8px'}}>
                    <p style={{margin: 0, fontSize: '13px', color: '#1E40AF'}}>
                      ℹ️ Email był już wysłany {form.dataWyslaniaDoPotwierdzenia ? `dnia ${new Date(form.dataWyslaniaDoPotwierdzenia).toLocaleDateString('pl-PL')}` : ''}
                      {form.potwierdzoneByClient && ' - ✅ Klient potwierdził!'}
                    </p>
                  </div>
                )}
              </div>
              <div className="confirmation-modal-footer">
                <button className="btn-secondary" onClick={() => setShowConfirmationModal(false)}>Anuluj</button>
                <button className="btn-primary" onClick={handleSendConfirmation} style={{background: 'linear-gradient(135deg, #10B981, #059669)'}}>
                  📤 {form.wyslanieDoPotwierdzenia ? 'Wyślij ponownie' : 'Wyślij email'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal emailowy do producenta - dla konkretnego produktu */}
        {showEmailModal?.type === 'producer' && (() => {
          const productIdx = showEmailModal.productIndex;
          const product = form.produkty[productIdx];
          const producer = Object.values(producers).find(p => p.id === product?.producent);
          
          if (!producer) {
            return (
              <div className="confirmation-modal-overlay">
                <div className="confirmation-modal" onClick={e => e.stopPropagation()}>
                  <div className="confirmation-modal-header">
                    <h3>⚠️ Brak producenta</h3>
                    <button className="btn-close" onClick={() => setShowEmailModal(null)}>×</button>
                  </div>
                  <div className="confirmation-modal-body">
                    <p>Wybierz producenta dla tego produktu, aby móc wysłać email.</p>
                  </div>
                  <div className="confirmation-modal-footer">
                    <button className="btn-secondary" onClick={() => setShowEmailModal(null)}>Zamknij</button>
                  </div>
                </div>
              </div>
            );
          }

          const inquiryBody = `Dzień dobry,

Pytanie dotyczące zamówienia nr ${product.nrPodzamowienia || form.nrWlasny}

Opis produktu:
${product.towar}

${product.dataOdbioru ? `Planowany termin odbioru: ${formatDate(product.dataOdbioru)}` : ''}

Proszę o informację o dostępności i terminie realizacji.

Z poważaniem`;

          const orderBody = `Dzień dobry,

Zlecam realizację zamówienia:

Nr zamówienia: ${product.nrPodzamowienia || form.nrWlasny}

Opis produktu:
${product.towar}

${product.dataOdbioru ? `Termin odbioru: ${formatDate(product.dataOdbioru)}` : 'Termin odbioru: Do ustalenia'}

Proszę o potwierdzenie przyjęcia zlecenia.

Z poważaniem`;

          const body = producerEmailType === 'inquiry' ? inquiryBody : orderBody;
          const subject = producerEmailType === 'inquiry' 
            ? `Zapytanie - zamówienie ${product.nrPodzamowienia || form.nrWlasny}` 
            : `ZLECENIE - zamówienie ${product.nrPodzamowienia || form.nrWlasny}`;

          return (
            <div className="confirmation-modal-overlay">
              <div className="confirmation-modal modal-email-producer" onClick={e => e.stopPropagation()}>
                <div className="confirmation-modal-header">
                  <h3>📧 Email do producenta: {producer.name}</h3>
                  <button className="btn-close" onClick={() => setShowEmailModal(null)}>×</button>
                </div>
                <div className="confirmation-modal-body">
                  <div className="producer-contact-info">
                    <span>📧 {producer.email || '—'}</span>
                    <span>📞 {producer.phone || '—'}</span>
                    {producer.address && <span>📍 {producer.address}</span>}
                  </div>

                  <div className="email-type-buttons">
                    <button 
                      className={`email-type-btn ${producerEmailType === 'inquiry' ? 'active' : ''}`}
                      onClick={() => setProducerEmailType('inquiry')}
                    >
                      ❓ Zapytanie
                    </button>
                    <button 
                      className={`email-type-btn ${producerEmailType === 'order' ? 'active' : ''}`}
                      onClick={() => setProducerEmailType('order')}
                    >
                      📦 Zlecenie
                    </button>
                  </div>

                  <div className="email-preview">
                    <div className="email-subject">
                      <strong>Temat:</strong> {subject}
                    </div>
                    <div className="email-body-preview">
                      <pre>{body}</pre>
                    </div>
                  </div>
                </div>
                <div className="confirmation-modal-footer">
                  <button className="btn-secondary" onClick={() => setShowEmailModal(null)}>Anuluj</button>
                  {producer.phone && (
                    <a href={`tel:${producer.phone}`} className="btn-secondary">📞 Zadzwoń</a>
                  )}
                  {producer.email && (
                    <a 
                      href={`mailto:${producer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                      className="btn-primary"
                    >
                      📤 Wyślij {producerEmailType === 'order' ? 'zlecenie' : 'zapytanie'}
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Wyszukiwarka produktów z cennika */}
        {showProductSearchInOrder !== false && priceLists && (
          <ProductSearchModal
            priceLists={priceLists}
            producers={producers}
            onSelect={(product) => {
              // Pobierz indeks produktu (showProductSearchInOrder teraz zawiera indeks)
              const productIndex = typeof showProductSearchInOrder === 'number' ? showProductSearchInOrder : activeProductIndex;
              
              // Zaktualizuj koszty produktu
              const updatedProducts = [...form.produkty];
              if (updatedProducts[productIndex]) {
                updatedProducts[productIndex] = {
                  ...updatedProducts[productIndex],
                  koszty: {
                    ...updatedProducts[productIndex].koszty,
                    zakupNetto: product.cena,
                    waluta: product.waluta || updatedProducts[productIndex].koszty?.waluta || 'PLN'
                  }
                };
                
                // Ustaw producenta jeśli nie jest wybrany
                if (!updatedProducts[productIndex].producent && product.producerId) {
                  updatedProducts[productIndex].producent = product.producerId;
                }
                
                setForm({ ...form, produkty: updatedProducts });
              }
              
              setShowProductSearchInOrder(false);
            }}
            onClose={() => setShowProductSearchInOrder(false)}
          />
        )}
      </div>
    </div>
  );
};

// ============================================
// MODAL PRODUCENTÓW
// ============================================

const ProducersModal = ({ producers, onSave, onClose }) => {
  const [list, setList] = useState(Object.values(producers));
  const [newP, setNewP] = useState({ name: '', email: '', phone: '', address: '' });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleAdd = () => {
    if (newP.name) {
      setList([...list, { ...newP, id: newP.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now() }]);
      setNewP({ name: '', email: '', phone: '', address: '' });
    }
  };

  const handleUpdate = (id, field, value) => {
    setList(list.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(list);
      console.log('Zapisano zmiany producentów');
    } catch (err) {
      console.error('Błąd zapisywania producentów:', err);
      alert('Błąd podczas zapisywania');
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏭 Zarządzanie producentami</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {list.map(p => (
            <div key={p.id} className="list-item">
              {editingId === p.id ? (
                <div className="edit-form">
                  <input value={p.name} onChange={e => handleUpdate(p.id, 'name', e.target.value)} placeholder="Nazwa" />
                  <input value={p.email || ''} onChange={e => handleUpdate(p.id, 'email', e.target.value)} placeholder="Email" />
                  <input value={p.phone || ''} onChange={e => handleUpdate(p.id, 'phone', e.target.value)} placeholder="Telefon" />
                  <input value={p.address || ''} onChange={e => handleUpdate(p.id, 'address', e.target.value)} placeholder="Adres" />
                  <button className="btn-small btn-success" onClick={() => setEditingId(null)}>✓ Gotowe</button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="list-item-title">{p.name}</div>
                    <div className="list-item-subtitle">📧 {p.email || '—'} • 📞 {p.phone || '—'}</div>
                    <div className="list-item-subtitle">📍 {p.address || '—'}</div>
                  </div>
                  <div className="list-item-actions">
                    <button className="btn-small" onClick={() => setEditingId(p.id)}>✏️</button>
                    <button className="btn-small btn-danger" onClick={() => setList(list.filter(x => x.id !== p.id))}>🗑️</button>
                  </div>
                </>
              )}
            </div>
          ))}
          <div className="add-form">
            <h4>➕ Dodaj producenta</h4>
            <input placeholder="Nazwa *" value={newP.name} onChange={e => setNewP({ ...newP, name: e.target.value })} />
            <input placeholder="Email" value={newP.email} onChange={e => setNewP({ ...newP, email: e.target.value })} />
            <input placeholder="Telefon" value={newP.phone} onChange={e => setNewP({ ...newP, phone: e.target.value })} />
            <input placeholder="Adres" value={newP.address} onChange={e => setNewP({ ...newP, address: e.target.value })} />
            <button className="btn-add" onClick={handleAdd}>➕ Dodaj</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '⏳...' : '💾 Zapisz'}</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MODAL DANYCH FIRMY KONTRAHENTA
// ============================================

const CompanyDataModal = ({ user, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    companyName: user?.companyName || '',
    nip: user?.nip || '',
    regon: user?.regon || '',
    companyAddress: user?.companyAddress || '',
    companyCity: user?.companyCity || '',
    companyPostCode: user?.companyPostCode || '',
    companyCountry: user?.companyCountry || 'Polska',
    bankName: user?.bankName || '',
    bankAccount: user?.bankAccount || '',
    companyEmail: user?.companyEmail || '',
    companyPhone: user?.companyPhone || '',
    companyWebsite: user?.companyWebsite || '',
    notes: user?.notes || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ ...user, ...formData });
      onClose();
    } catch (err) {
      alert('Błąd zapisu: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏢 Dane firmy</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>NAZWA FIRMY *</label>
              <input value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} placeholder="Pełna nazwa firmy" />
            </div>
            <div className="form-group">
              <label>NIP</label>
              <input value={formData.nip} onChange={e => setFormData({...formData, nip: e.target.value})} placeholder="123-456-78-90" />
            </div>
            <div className="form-group">
              <label>REGON</label>
              <input value={formData.regon} onChange={e => setFormData({...formData, regon: e.target.value})} placeholder="123456789" />
            </div>
            <div className="form-group full">
              <label>ADRES</label>
              <input value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} placeholder="ul. Przykładowa 123" />
            </div>
            <div className="form-group">
              <label>KOD POCZTOWY</label>
              <input value={formData.companyPostCode} onChange={e => setFormData({...formData, companyPostCode: e.target.value})} placeholder="00-000" />
            </div>
            <div className="form-group">
              <label>MIASTO</label>
              <input value={formData.companyCity} onChange={e => setFormData({...formData, companyCity: e.target.value})} placeholder="Warszawa" />
            </div>
            <div className="form-group">
              <label>KRAJ</label>
              <input value={formData.companyCountry} onChange={e => setFormData({...formData, companyCountry: e.target.value})} placeholder="Polska" />
            </div>
          </div>

          <h3 style={{marginTop: '20px', marginBottom: '10px'}}>💳 Dane bankowe</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>NAZWA BANKU</label>
              <input value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} placeholder="Nazwa banku" />
            </div>
            <div className="form-group">
              <label>NUMER KONTA</label>
              <input value={formData.bankAccount} onChange={e => setFormData({...formData, bankAccount: e.target.value})} placeholder="PL00 0000 0000 0000 0000 0000 0000" />
            </div>
          </div>

          <h3 style={{marginTop: '20px', marginBottom: '10px'}}>📞 Kontakt</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>EMAIL FIRMOWY</label>
              <input value={formData.companyEmail} onChange={e => setFormData({...formData, companyEmail: e.target.value})} placeholder="firma@example.com" />
            </div>
            <div className="form-group">
              <label>TELEFON FIRMOWY</label>
              <input value={formData.companyPhone} onChange={e => setFormData({...formData, companyPhone: e.target.value})} placeholder="+48 123 456 789" />
            </div>
            <div className="form-group full">
              <label>STRONA WWW</label>
              <input value={formData.companyWebsite} onChange={e => setFormData({...formData, companyWebsite: e.target.value})} placeholder="https://www.firma.pl" />
            </div>
            <div className="form-group full">
              <label>DODATKOWE INFORMACJE</label>
              <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={3} placeholder="Dodatkowe informacje o firmie..." />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '⏳...' : '💾 Zapisz'}</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MODAL UŻYTKOWNIKÓW - Z RESETOWANIEM HASŁA
// ============================================

const UsersModal = ({ users, onSave, onClose, isAdmin, onEditContractor }) => {
  const [list, setList] = useState(users);
  const [newU, setNewU] = useState({ username: '', password: '', name: '', role: 'worker', companyName: '', phone: '' });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleAdd = () => {
    if (newU.username && newU.password && newU.name) {
      setList([...list, { ...newU, id: 'new_' + Date.now() }]);
      setNewU({ username: '', password: '', name: '', role: 'worker', companyName: '', phone: '' });
    }
  };

  const handleUpdate = (id, field, value) => {
    setList(list.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(list);
      console.log('Zapisano zmiany użytkowników');
    } catch (err) {
      console.error('Błąd zapisywania użytkowników:', err);
      alert('Błąd podczas zapisywania');
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>👥 Zarządzanie użytkownikami</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {list.map(u => {
            const role = getRole(u.role);
            return (
              <div key={u.id} className="list-item">
                {editingId === u.id ? (
                  <div className="edit-form">
                    <input value={u.name} onChange={e => handleUpdate(u.id, 'name', e.target.value)} placeholder="Imię i nazwisko" />
                    <input value={u.username} onChange={e => handleUpdate(u.id, 'username', e.target.value)} placeholder="Login" disabled={u.username === 'admin'} />
                    <input value={u.password} onChange={e => handleUpdate(u.id, 'password', e.target.value)} placeholder="Nowe hasło" type="text" />
                    <input value={u.phone || ''} onChange={e => handleUpdate(u.id, 'phone', e.target.value)} placeholder="Telefon" />
                    <select value={u.role} onChange={e => handleUpdate(u.id, 'role', e.target.value)} disabled={u.username === 'admin'}>
                      {USER_ROLES.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
                    </select>
                    {u.role === 'contractor' && (
                      <input value={u.companyName || ''} onChange={e => handleUpdate(u.id, 'companyName', e.target.value)} placeholder="Nazwa firmy" />
                    )}
                    <button className="btn-small btn-success" onClick={() => setEditingId(null)}>✓ Gotowe</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="list-item-title">{role.icon} {u.name}</div>
                      <div className="list-item-subtitle">@{u.username} • {role.name}</div>
                      {u.companyName && <div className="list-item-subtitle">🏢 {u.companyName}</div>}
                      {u.phone && <div className="list-item-subtitle">📞 {u.phone}</div>}
                      {/* Dodatkowe dane firmy kontrahenta */}
                      {u.role === 'contractor' && (u.nip || u.companyAddress || u.companyEmail) && (
                        <div className="contractor-details">
                          {u.nip && <div className="list-item-subtitle">🔢 NIP: {u.nip}</div>}
                          {u.companyAddress && <div className="list-item-subtitle">📍 {u.companyAddress}{u.companyCity ? `, ${u.companyPostCode || ''} ${u.companyCity}` : ''}</div>}
                          {u.companyEmail && <div className="list-item-subtitle">✉️ {u.companyEmail}</div>}
                          {u.bankAccount && <div className="list-item-subtitle">🏦 {u.bankName}: {u.bankAccount}</div>}
                        </div>
                      )}
                    </div>
                    <div className="list-item-actions">
                      {isAdmin && <button className="btn-small" onClick={() => setEditingId(u.id)}>✏️ Edytuj</button>}
                      {isAdmin && u.role === 'contractor' && onEditContractor && (
                        <button className="btn-small btn-info" onClick={() => onEditContractor(u)}>🏢 Firma</button>
                      )}
                      {u.username !== 'admin' && <button className="btn-small btn-danger" onClick={() => setList(list.filter(x => x.id !== u.id))}>🗑️</button>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <div className="add-form">
            <h4>➕ Dodaj użytkownika</h4>
            <input placeholder="Imię i nazwisko *" value={newU.name} onChange={e => setNewU({ ...newU, name: e.target.value })} />
            <div className="form-row">
              <input placeholder="Login *" value={newU.username} onChange={e => setNewU({ ...newU, username: e.target.value })} />
              <input placeholder="Hasło *" type="text" value={newU.password} onChange={e => setNewU({ ...newU, password: e.target.value })} />
            </div>
            <input placeholder="Telefon" value={newU.phone} onChange={e => setNewU({ ...newU, phone: e.target.value })} />
            <select value={newU.role} onChange={e => setNewU({ ...newU, role: e.target.value })}>
              {USER_ROLES.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
            </select>
            {newU.role === 'contractor' && (
              <input placeholder="Nazwa firmy" value={newU.companyName} onChange={e => setNewU({ ...newU, companyName: e.target.value })} />
            )}
            <button className="btn-add" onClick={handleAdd}>➕ Dodaj</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '⏳...' : '💾 Zapisz'}</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MENEDŻER CENNIKÓW - IMPORT XLSX
// ============================================

const PriceListManager = ({ producers, priceLists, onSave, onDelete, onClose }) => {
  const [activeTab, setActiveTab] = useState('list'); // list, import
  const [selectedProducer, setSelectedProducer] = useState('');
  const [priceListName, setPriceListName] = useState('');
  const [importedProducts, setImportedProducts] = useState([]);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPriceList, setSelectedPriceList] = useState(null);
  const [filterProducer, setFilterProducer] = useState('all');
  const fileInputRef = useRef(null);

  // Parsowanie pliku XLSX
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // Pierwsza linia to nagłówki
          const headers = jsonData[0] || [];
          const products = [];
          
          // Znajdź indeksy kolumn
          const nazwaIndex = headers.findIndex(h => 
            h && (h.toString().toLowerCase().includes('nazwa') || h.toString().toLowerCase().includes('produkt') || h.toString().toLowerCase().includes('name'))
          );
          
          // Szukamy kolumn z grupami/cenami
          const grupaIndices = [];
          headers.forEach((h, i) => {
            if (h && (
              h.toString().toLowerCase().includes('grupa') || 
              h.toString().toLowerCase().includes('cena') ||
              h.toString().toLowerCase().includes('price') ||
              h.toString().match(/^g\d+$/i) ||
              h.toString().match(/^grupa\s*\d+$/i)
            )) {
              grupaIndices.push({ index: i, name: h.toString() });
            }
          });
          
          // Jeśli nie znaleziono grup, użyj wszystkich kolumn po nazwie jako grupy
          if (grupaIndices.length === 0 && nazwaIndex >= 0) {
            headers.forEach((h, i) => {
              if (i > nazwaIndex && h) {
                grupaIndices.push({ index: i, name: h.toString() });
              }
            });
          }

          // Parsuj produkty (od wiersza 2)
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || !row[nazwaIndex >= 0 ? nazwaIndex : 0]) continue;
            
            const product = {
              nazwa: row[nazwaIndex >= 0 ? nazwaIndex : 0]?.toString() || '',
              grupy: {}
            };
            
            grupaIndices.forEach(g => {
              const value = row[g.index];
              if (value !== undefined && value !== null && value !== '') {
                // Parsuj cenę - usuń znaki waluty, spacje itp.
                let price = value;
                if (typeof value === 'string') {
                  price = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
                }
                product.grupy[g.name] = price;
              }
            });
            
            if (product.nazwa) {
              products.push(product);
            }
          }
          
          setImportedProducts(products);
          
          // Automatycznie ustaw nazwę cennika z nazwy pliku
          if (!priceListName) {
            setPriceListName(file.name.replace(/\.[^/.]+$/, ''));
          }
          
          alert(`✅ Zaimportowano ${products.length} produktów z ${grupaIndices.length} grup cenowych!`);
        } catch (parseError) {
          console.error('Błąd parsowania:', parseError);
          alert('❌ Błąd parsowania pliku. Upewnij się, że plik ma poprawny format.');
        }
        setImporting(false);
      };
      
      reader.onerror = () => {
        alert('❌ Błąd odczytu pliku');
        setImporting(false);
      };
      
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Błąd importu:', error);
      alert('❌ Błąd importu: ' + error.message);
      setImporting(false);
    }
    
    // Reset input
    e.target.value = '';
  };

  // Zapisz cennik
  const handleSavePriceList = async () => {
    if (!selectedProducer) {
      alert('❌ Wybierz producenta!');
      return;
    }
    if (!priceListName) {
      alert('❌ Podaj nazwę cennika!');
      return;
    }
    if (importedProducts.length === 0) {
      alert('❌ Brak produktów do zapisania!');
      return;
    }

    try {
      await onSave({
        producerId: selectedProducer,
        producerName: Object.values(producers).find(p => p.id === selectedProducer)?.name || '',
        nazwa: priceListName,
        produkty: importedProducts,
        dataUtworzenia: new Date().toISOString(),
        iloscProduktow: importedProducts.length
      });
      
      alert(`✅ Cennik "${priceListName}" został zapisany z ${importedProducts.length} produktami!`);
      
      // Reset
      setImportedProducts([]);
      setPriceListName('');
      setSelectedProducer('');
      setActiveTab('list');
    } catch (error) {
      alert('❌ Błąd zapisu: ' + error.message);
    }
  };

  // Usuń cennik
  const handleDeletePriceList = async (priceList) => {
    if (window.confirm(`Czy na pewno chcesz usunąć cennik "${priceList.nazwa}"?`)) {
      await onDelete(priceList.id);
    }
  };

  // Filtrowane cenniki
  const filteredPriceLists = priceLists.filter(pl => {
    if (filterProducer !== 'all' && pl.producerId !== filterProducer) return false;
    return true;
  });

  // Wyszukiwanie w wybranym cenniku
  const searchedProducts = selectedPriceList?.produkty?.filter(p =>
    p.nazwa.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large pricelist-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📋 Zarządzanie cennikami</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        <div className="pricelist-tabs">
          <button 
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            📚 Lista cenników
          </button>
          <button 
            className={`tab-btn ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            📥 Importuj cennik
          </button>
        </div>

        <div className="modal-body">
          {/* LISTA CENNIKÓW */}
          {activeTab === 'list' && (
            <div className="pricelist-list-tab">
              <div className="pricelist-filters">
                <select 
                  value={filterProducer} 
                  onChange={e => setFilterProducer(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">Wszyscy producenci</option>
                  {Object.values(producers).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {filteredPriceLists.length === 0 ? (
                <div className="empty-state">
                  <p>📭 Brak cenników</p>
                  <p>Kliknij "Importuj cennik" aby dodać pierwszy cennik.</p>
                </div>
              ) : (
                <div className="pricelist-grid">
                  {filteredPriceLists.map(pl => (
                    <div 
                      key={pl.id} 
                      className={`pricelist-card ${selectedPriceList?.id === pl.id ? 'selected' : ''}`}
                      onClick={() => setSelectedPriceList(selectedPriceList?.id === pl.id ? null : pl)}
                    >
                      <div className="pricelist-card-header">
                        <h3>{pl.nazwa}</h3>
                        <button 
                          className="btn-delete-small"
                          onClick={(e) => { e.stopPropagation(); handleDeletePriceList(pl); }}
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="pricelist-card-body">
                        <p><strong>🏭 Producent:</strong> {pl.producerName}</p>
                        <p><strong>📦 Produktów:</strong> {pl.iloscProduktow || pl.produkty?.length || 0}</p>
                        <p><strong>📅 Dodano:</strong> {new Date(pl.dataUtworzenia).toLocaleDateString('pl-PL')}</p>
                        {pl.produkty?.[0]?.grupy && (
                          <p><strong>💰 Grupy cenowe:</strong> {Object.keys(pl.produkty[0].grupy).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Podgląd wybranego cennika */}
              {selectedPriceList && (
                <div className="pricelist-preview">
                  <h3>📖 Podgląd: {selectedPriceList.nazwa}</h3>
                  <input
                    type="text"
                    placeholder="🔍 Szukaj produktu..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                  <div className="products-table-container">
                    <table className="products-table">
                      <thead>
                        <tr>
                          <th>Nazwa produktu</th>
                          {selectedPriceList.produkty?.[0]?.grupy && 
                            Object.keys(selectedPriceList.produkty[0].grupy).map(g => (
                              <th key={g}>{g}</th>
                            ))
                          }
                        </tr>
                      </thead>
                      <tbody>
                        {searchedProducts.slice(0, 100).map((p, i) => (
                          <tr key={i}>
                            <td>{p.nazwa}</td>
                            {p.grupy && Object.values(p.grupy).map((price, j) => (
                              <td key={j} className="price-cell">{typeof price === 'number' ? price.toFixed(2) : price}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {searchedProducts.length > 100 && (
                      <p className="table-info">Wyświetlono 100 z {searchedProducts.length} produktów. Użyj wyszukiwarki.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* IMPORT CENNIKA */}
          {activeTab === 'import' && (
            <div className="pricelist-import-tab">
              <div className="import-instructions">
                <h3>📋 Instrukcja importu cennika z pliku XLSX</h3>
                <p>Plik Excel powinien mieć następującą strukturę:</p>
                <div className="example-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Nazwa Towaru</th>
                        <th>Grupa 1</th>
                        <th>Grupa 2</th>
                        <th>Grupa 3</th>
                        <th>Grupa 4</th>
                        <th>Grupa 5</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Sofa MALMO 3-os</td>
                        <td>2500</td>
                        <td>2800</td>
                        <td>3100</td>
                        <td>3400</td>
                        <td>3700</td>
                      </tr>
                      <tr>
                        <td>Fotel BERGEN</td>
                        <td>1200</td>
                        <td>1400</td>
                        <td>1600</td>
                        <td>1800</td>
                        <td>2000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <ul>
                  <li>Pierwsza kolumna: <strong>Nazwa produktu</strong></li>
                  <li>Kolejne kolumny: <strong>Grupy cenowe</strong> (różne tkaniny/wykończenia)</li>
                  <li>Nazwy kolumn zostaną automatycznie rozpoznane</li>
                </ul>
              </div>

              <div className="import-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>🏭 Producent *</label>
                    <select 
                      value={selectedProducer} 
                      onChange={e => setSelectedProducer(e.target.value)}
                    >
                      <option value="">-- Wybierz producenta --</option>
                      {Object.values(producers).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>📝 Nazwa cennika *</label>
                    <input
                      type="text"
                      value={priceListName}
                      onChange={e => setPriceListName(e.target.value)}
                      placeholder="np. Cennik 2024, Katalog wiosna..."
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>📂 Plik XLSX</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <button 
                    className="btn-upload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? '⏳ Importowanie...' : '📥 Wybierz plik XLSX'}
                  </button>
                </div>

                {importedProducts.length > 0 && (
                  <div className="import-preview">
                    <h4>✅ Zaimportowano {importedProducts.length} produktów</h4>
                    <div className="preview-table-container">
                      <table className="products-table">
                        <thead>
                          <tr>
                            <th>Nazwa produktu</th>
                            {importedProducts[0]?.grupy && 
                              Object.keys(importedProducts[0].grupy).map(g => (
                                <th key={g}>{g}</th>
                              ))
                            }
                          </tr>
                        </thead>
                        <tbody>
                          {importedProducts.slice(0, 10).map((p, i) => (
                            <tr key={i}>
                              <td>{p.nazwa}</td>
                              {p.grupy && Object.values(p.grupy).map((price, j) => (
                                <td key={j} className="price-cell">{typeof price === 'number' ? price.toFixed(2) : price}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importedProducts.length > 10 && (
                        <p className="table-info">...i {importedProducts.length - 10} więcej</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
          {activeTab === 'import' && importedProducts.length > 0 && (
            <button className="btn-primary" onClick={handleSavePriceList}>
              💾 Zapisz cennik ({importedProducts.length} produktów)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// WYSZUKIWARKA PRODUKTÓW Z CENNIKA
// ============================================

const ProductSearchModal = ({ priceLists, producers, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducer, setSelectedProducer] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [results, setResults] = useState([]);

  // Dostępne grupy cenowe
  const availableGroups = React.useMemo(() => {
    const groups = new Set();
    priceLists.forEach(pl => {
      pl.produkty?.forEach(p => {
        Object.keys(p.grupy || {}).forEach(g => groups.add(g));
      });
    });
    return Array.from(groups);
  }, [priceLists]);

  // Wyszukiwanie
  useEffect(() => {
    if (searchTerm.length < 2) {
      setResults([]);
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const found = [];

    priceLists.forEach(pl => {
      if (selectedProducer !== 'all' && pl.producerId !== selectedProducer) return;
      
      pl.produkty?.forEach(p => {
        if (p.nazwa.toLowerCase().includes(searchLower)) {
          found.push({
            ...p,
            producerId: pl.producerId,
            producerName: pl.producerName,
            priceListName: pl.nazwa
          });
        }
      });
    });

    setResults(found.slice(0, 50));
  }, [searchTerm, selectedProducer, priceLists]);

  // Wybierz produkt
  const handleSelect = (product) => {
    const price = selectedGroup && product.grupy?.[selectedGroup] 
      ? product.grupy[selectedGroup] 
      : Object.values(product.grupy || {})[0] || 0;
    
    onSelect({
      nazwa: product.nazwa,
      producerId: product.producerId,
      producerName: product.producerName,
      grupa: selectedGroup || Object.keys(product.grupy || {})[0] || '',
      cena: price,
      grupy: product.grupy
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-medium product-search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔍 Wyszukaj produkt z cennika</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="search-filters">
            <div className="form-group">
              <input
                type="text"
                placeholder="🔍 Wpisz nazwę produktu (min. 2 znaki)..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
                className="search-input-large"
              />
            </div>
            <div className="filter-row">
              <select 
                value={selectedProducer} 
                onChange={e => setSelectedProducer(e.target.value)}
              >
                <option value="all">Wszyscy producenci</option>
                {Object.values(producers).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select 
                value={selectedGroup} 
                onChange={e => setSelectedGroup(e.target.value)}
              >
                <option value="">-- Grupa cenowa --</option>
                {availableGroups.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="search-results">
            {results.length === 0 && searchTerm.length >= 2 && (
              <p className="no-results">Nie znaleziono produktów</p>
            )}
            {results.length === 0 && searchTerm.length < 2 && (
              <p className="hint">Wpisz minimum 2 znaki aby wyszukać...</p>
            )}
            {results.map((p, i) => (
              <div key={i} className="product-result" onClick={() => handleSelect(p)}>
                <div className="product-result-main">
                  <span className="product-name">{p.nazwa}</span>
                  <span className="product-producer">{p.producerName}</span>
                </div>
                <div className="product-prices">
                  {Object.entries(p.grupy || {}).map(([group, price]) => (
                    <span 
                      key={group} 
                      className={`price-tag ${selectedGroup === group ? 'selected' : ''}`}
                    >
                      {group}: {typeof price === 'number' ? price.toFixed(2) : price} zł
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {results.length === 50 && (
              <p className="hint">Wyświetlono 50 wyników. Zawęź wyszukiwanie.</p>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MODAL USTAWIEŃ - TYLKO DLA ADMINA
// ============================================

const SettingsModal = ({ onClose, currentUser, onNotificationReceived }) => {
  const [url, setUrl] = useState(getGoogleScriptUrl());
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general'); // general, notifications

  const handleSave = () => {
    setGoogleScriptUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ Ustawienia</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        {/* Tabs */}
        <div className="settings-tabs">
          <button 
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            🔧 Ogólne
          </button>
          <button 
            className={`settings-tab ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            🔔 Powiadomienia
          </button>
        </div>
        
        <div className="modal-body">
          {activeTab === 'general' && (
            <>
              <div className="form-group">
                <label>URL Google Apps Script</label>
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..." />
                <small>Wklej URL z kroku 10 instrukcji</small>
              </div>
              {saved && <div className="success-message">✅ Zapisano!</div>}
            </>
          )}
          
          {activeTab === 'notifications' && (
            <div className="notifications-settings">
              <p className="settings-description">
                Włącz powiadomienia push, aby otrzymywać alerty o nowych zamówieniach, 
                zmianach statusu i wiadomościach nawet gdy aplikacja jest zamknięta.
              </p>
              
              <NotificationSettings 
                currentUser={currentUser}
                onNotificationReceived={onNotificationReceived}
              />
              
              <div className="notification-info">
                <h4>📱 Jak działają powiadomienia?</h4>
                <ul>
                  <li><strong>Android:</strong> Działają od razu po włączeniu</li>
                  <li><strong>iPhone/iPad:</strong> Wymagają iOS 16.4+ i zainstalowanej aplikacji PWA</li>
                  <li><strong>Komputer:</strong> Działają w Chrome, Edge i Firefox</li>
                </ul>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
          {activeTab === 'general' && (
            <button className="btn-primary" onClick={handleSave}>💾 Zapisz</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL REKLAMACJI
// ============================================

const ComplaintsPanel = ({ complaints, orders, onSave, onDelete, onClose, currentUser, onAddNotification, producers }) => {
  const [view, setView] = useState('list'); // list, detail, form
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [editingComplaint, setEditingComplaint] = useState(null); // Do edycji
  const [filter, setFilter] = useState('all');
  const [newComment, setNewComment] = useState('');
  const [resolution, setResolution] = useState('');
  const [formData, setFormData] = useState({
    orderId: '',
    typ: 'uszkodzenie',
    opis: '',
    wiadomoscKlienta: '',
    oczekiwaniaKlienta: '',
    zdjecia: [],
    priorytet: 'normalny'
  });
  
  // Lightbox do powiększania zdjęć
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  
  // Zdjęcia do wysłania w czacie
  const [chatPhotos, setChatPhotos] = useState([]);
  const [uploadingChatPhotos, setUploadingChatPhotos] = useState(false);
  
  // Real-time listener dla wybranej reklamacji
  useEffect(() => {
    if (!selectedComplaint?.id) return;
    
    let unsubscribe = null;
    
    const setupListener = async () => {
      const { doc, onSnapshot } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      const complaintRef = doc(db, 'complaints', selectedComplaint.id);
      unsubscribe = onSnapshot(complaintRef, (docSnap) => {
        if (docSnap.exists()) {
          setSelectedComplaint({ id: docSnap.id, ...docSnap.data() });
        }
      });
    };
    
    setupListener();
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedComplaint?.id]);
  
  // Obsługa zdjęć w czacie
  const handleChatPhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert('Zdjęcie jest za duże (max 10MB)');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 800;
          let width = img.width;
          let height = img.height;
          
          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          setChatPhotos(prev => [...prev, compressedBase64]);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input
    e.target.value = '';
  };
  
  const removeChatPhoto = (index) => {
    setChatPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Reset formularza
  const resetForm = () => {
    setFormData({
      orderId: '',
      typ: 'uszkodzenie',
      opis: '',
      wiadomoscKlienta: '',
      oczekiwaniaKlienta: '',
      zdjecia: [],
      priorytet: 'normalny'
    });
    setEditingComplaint(null);
  };

  // Otwórz formularz do edycji
  const openEditForm = (complaint) => {
    setEditingComplaint(complaint);
    setFormData({
      orderId: complaint.orderId || '',
      typ: complaint.typ || 'uszkodzenie',
      opis: complaint.opis || '',
      wiadomoscKlienta: complaint.wiadomoscKlienta || '',
      oczekiwaniaKlienta: complaint.oczekiwaniaKlienta || '',
      zdjecia: complaint.zdjecia || [],
      priorytet: complaint.priorytet || 'normalny'
    });
    setView('form');
  };

  // Otwórz formularz nowej reklamacji
  const openNewForm = () => {
    resetForm();
    setView('form');
  };

  // Pobierz rolę użytkownika
  const getUserRoleLabel = (user) => {
    if (!user) return 'Nieznany';
    const role = USER_ROLES.find(r => r.id === user.role);
    return role ? `${role.icon} ${role.name}` : '👤 Użytkownik';
  };

  const filteredComplaints = filter === 'all' 
    ? complaints 
    : complaints.filter(c => c.status === filter);

  const handleSaveComplaint = async () => {
    if (!formData.orderId || !formData.opis) {
      alert('Wybierz zamówienie i opisz reklamację');
      return;
    }
    const order = orders.find(o => o.id === formData.orderId);
    const userRole = getUserRoleLabel(currentUser);
    
    if (editingComplaint) {
      // EDYCJA istniejącej reklamacji
      const updated = {
        ...editingComplaint,
        ...formData,
        nrZamowienia: order?.nrWlasny || editingComplaint.nrZamowienia,
        klient: order?.klient?.imie || editingComplaint.klient,
        historia: [
          ...(editingComplaint.historia || []), 
          { data: new Date().toISOString(), uzytkownik: currentUser.name, akcja: 'Edytowano reklamację' }
        ]
      };
      await onSave(updated, editingComplaint.id);
    } else {
      // NOWA reklamacja
      const complaint = {
        ...formData,
        numer: generateComplaintNumber(complaints),
        orderId: formData.orderId,
        nrZamowienia: order?.nrWlasny || '',
        klient: order?.klient?.imie || '',
        status: 'nowa',
        dataUtworzenia: new Date().toISOString(),
        utworzonePrzez: { 
          id: currentUser.id, 
          nazwa: currentUser.name,
          rola: currentUser.role,
          rolaLabel: userRole
        },
        komentarze: [],
        historia: [{ data: new Date().toISOString(), uzytkownik: currentUser.name, akcja: 'Utworzono reklamację' }]
      };
      await onSave(complaint);
      
      // Wyślij powiadomienie
      if (onAddNotification) {
        await onAddNotification({
          icon: '📋',
          title: `Nowa reklamacja: ${complaint.numer}`,
          message: `Dodana przez: ${currentUser.name} (${userRole}) | Zamówienie: ${order?.nrWlasny || 'brak'} | Klient: ${order?.klient?.imie || 'brak'}`,
          complaintId: null,
          type: 'complaint'
        });
      }
    }
    
    resetForm();
    setView('list');
  };

  const handleStatusChange = async (complaint, newStatus) => {
    const updated = {
      ...complaint,
      status: newStatus,
      ...(newStatus === 'rozwiazana' ? { dataRozwiazania: new Date().toISOString() } : {}),
      historia: [...(complaint.historia || []), { data: new Date().toISOString(), uzytkownik: currentUser.name, akcja: `Status: ${getComplaintStatus(newStatus).name}` }]
    };
    await onSave(updated, complaint.id);
    if (selectedComplaint?.id === complaint.id) setSelectedComplaint(updated);
  };

  const handleResolve = async () => {
    if (!selectedComplaint || !resolution.trim()) return;
    const updated = {
      ...selectedComplaint,
      status: 'rozwiazana',
      rozwiazanie: resolution,
      dataRozwiazania: new Date().toISOString(),
      historia: [...(selectedComplaint.historia || []), { data: new Date().toISOString(), uzytkownik: currentUser.name, akcja: 'Rozwiązano reklamację' }]
    };
    await onSave(updated, selectedComplaint.id);
    setSelectedComplaint(updated);
    setResolution('');
  };

  const handleAddComment = async () => {
    if (!selectedComplaint || (!newComment.trim() && chatPhotos.length === 0)) return;
    
    setUploadingChatPhotos(true);
    
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      // Upload zdjęć do Firebase Storage jeśli są
      let uploadedPhotoUrls = [];
      if (chatPhotos.length > 0) {
        try {
          const { uploadMultipleImages } = await import('./firebase');
          uploadedPhotoUrls = await uploadMultipleImages(chatPhotos, 'complaints/chat');
        } catch (uploadErr) {
          console.error('Błąd uploadu zdjęć:', uploadErr);
          uploadedPhotoUrls = chatPhotos; // Fallback na base64
        }
      }
      
      const messageText = newComment.trim() || (uploadedPhotoUrls.length > 0 ? '(załączono zdjęcia)' : '');
      
      const newMsg = {
        id: Date.now().toString(),
        autor: 'admin',
        autorNazwa: currentUser.name,
        tresc: messageText,
        data: new Date().toISOString()
      };
      
      // Dodaj zdjęcia tylko jeśli są
      if (uploadedPhotoUrls.length > 0) {
        newMsg.zdjecia = uploadedPhotoUrls;
      }
      
      const updatedWiadomosci = [...(selectedComplaint.wiadomosci || []), newMsg];
      const updatedKomentarze = [...(selectedComplaint.komentarze || []), {
        id: Date.now(),
        tekst: messageText,
        data: new Date().toISOString(),
        autor: currentUser.name
      }];
      const updatedHistoria = [...(selectedComplaint.historia || []), {
        data: new Date().toISOString(),
        uzytkownik: currentUser.name,
        akcja: uploadedPhotoUrls.length > 0 ? 'Dodano wiadomość ze zdjęciami' : 'Dodano wiadomość'
      }];
      const newStatus = (selectedComplaint.status === 'nowa' || selectedComplaint.status === 'w_trakcie') 
        ? 'oczekuje_na_klienta' 
        : selectedComplaint.status;
      
      // Użyj bezpośrednio updateDoc zamiast onSave
      const complaintRef = doc(db, 'complaints', selectedComplaint.id);
      await updateDoc(complaintRef, {
        komentarze: updatedKomentarze,
        wiadomosci: updatedWiadomosci,
        status: newStatus,
        historia: updatedHistoria
      });
      
      setNewComment('');
      setChatPhotos([]); // Wyczyść zdjęcia
      
      // Wyślij email do klienta jeśli ma email i token
      if (selectedComplaint.klientEmail && selectedComplaint.complaintToken) {
        const complaintLink = `${window.location.origin}/reklamacja/${selectedComplaint.complaintToken}`;
        
        const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); padding: 30px; text-align: center;">
              <div style="font-size: 40px; margin-bottom: 10px;">💬</div>
              <h1 style="color: white; margin: 0; font-size: 22px;">Nowa wiadomość</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Reklamacja: ${selectedComplaint.numer}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Szanowny/a <strong>${selectedComplaint.klient}</strong>,</p>
              <p style="margin: 0 0 20px 0; color: #6B7280; font-size: 15px;">Otrzymałeś nową wiadomość dotyczącą Twojej reklamacji.</p>
              
              <div style="background: #F3F4F6; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <p style="margin: 0 0 5px 0; color: #6B7280; font-size: 13px;">${currentUser.name} napisał/a:</p>
                <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${newComment || '(załączono zdjęcia)'}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${complaintLink}" style="display: inline-block; background: linear-gradient(135deg, #6366F1, #4F46E5); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">ODPOWIEDZ</a>
              </div>
              
              <p style="margin: 0; color: #9CA3AF; font-size: 13px; text-align: center;">Możesz również śledzić status reklamacji pod powyższym linkiem.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px; background-color: #F9FAFB; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">Herraton • Obsługa reklamacji</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      // Wyślij email
      fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: selectedComplaint.klientEmail,
          toName: selectedComplaint.klient,
          subject: `Nowa wiadomość - Reklamacja ${selectedComplaint.numer}`,
          textContent: `Nowa wiadomość od ${currentUser.name}: ${newComment}. Odpowiedz pod linkiem: ${complaintLink}`,
          htmlContent: htmlEmail
        })
      }).catch(err => console.error('Błąd wysyłania emaila:', err));
      }
    } catch (err) {
      console.error('Błąd wysyłania wiadomości:', err);
      alert('Nie udało się wysłać wiadomości. Spróbuj ponownie.');
    } finally {
      setUploadingChatPhotos(false);
    }
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setFormData(prev => ({
          ...prev,
          zdjecia: [...prev.zdjecia, { id: Date.now() + Math.random(), url: reader.result, nazwa: file.name }]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const selectedOrder = formData.orderId ? orders.find(o => o.id === formData.orderId) : null;
  const complaintOrder = selectedComplaint?.orderId ? orders.find(o => o.id === selectedComplaint.orderId) : null;

  // ========== WIDOK LISTY ==========
  if (view === 'list') {
    return (
      <div className="modal-overlay">
        <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>📋 Reklamacje ({complaints.filter(c => !['rozwiazana', 'odrzucona'].includes(c.status)).length} aktywnych)</h2>
            <button className="btn-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="complaints-toolbar">
              <div className="complaints-filters">
                <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                  Wszystkie ({complaints.length})
                </button>
                {COMPLAINT_STATUSES.map(s => (
                  <button
                    key={s.id}
                    className={`filter-chip ${filter === s.id ? 'active' : ''}`}
                    style={filter === s.id ? { background: s.color, color: 'white' } : {}}
                    onClick={() => setFilter(s.id)}
                  >
                    {s.icon} {complaints.filter(c => c.status === s.id).length}
                  </button>
                ))}
              </div>
              <div style={{display: 'flex', gap: '10px'}}>
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    const publicLink = `${window.location.origin}/reklamacja/nowy`;
                    navigator.clipboard.writeText(publicLink);
                    alert(`✅ Skopiowano link do schowka!\n\n${publicLink}\n\nMożesz go umieścić na swojej stronie internetowej.`);
                  }}
                  title="Skopiuj uniwersalny link do formularza reklamacji"
                >
                  🔗 Link publiczny
                </button>
                <button className="btn-primary" onClick={openNewForm}>➕ Nowa reklamacja</button>
              </div>
            </div>

            {filteredComplaints.length === 0 ? (
              <div className="empty-state small">
                <div className="empty-icon">📋</div>
                <p>Brak reklamacji</p>
              </div>
            ) : (
              <div className="complaints-grid">
                {filteredComplaints.map(c => {
                  const status = getComplaintStatus(c.status);
                  const type = getComplaintType(c.typ);
                  const daysLeft = getComplaintDaysLeft(c.dataUtworzenia);
                  const deadline = getDeadlineStyle(daysLeft);
                  
                  return (
                    <div key={c.id} className="complaint-card" onClick={() => { setSelectedComplaint(c); setView('detail'); }}>
                      <div className="complaint-card-header">
                        <div className="complaint-card-title">
                          <span className="complaint-number">{c.numer}</span>
                          <span className="status-badge small" style={{ background: status.bgColor, color: status.color }}>
                            {status.name}
                          </span>
                          {c.priorytet === 'wysoki' && <span className="priority-badge high">🔴</span>}
                        </div>
                        {!['rozwiazana', 'odrzucona'].includes(c.status) && deadline && (
                          <span className={`deadline-badge ${deadline.urgent ? 'blink' : ''}`} style={{ background: deadline.bg, color: deadline.color }}>
                            ⏰ {deadline.label}
                          </span>
                        )}
                      </div>
                      <div className="complaint-card-body">
                        <div className="complaint-type">{type.icon} {type.name}</div>
                        <div className="complaint-order">📦 {c.nrZamowienia}</div>
                        <div className="complaint-client">👤 {c.klient}</div>
                        <p className="complaint-desc-preview">{c.opis}</p>
                        {c.zdjecia?.length > 0 && <div className="complaint-photos-count">📷 {c.zdjecia.length} zdjęć</div>}
                      </div>
                      <div className="complaint-card-footer">
                        <span>📅 {formatDate(c.dataUtworzenia)}</span>
                        <span className="complaint-creator-info">{c.utworzonePrzez?.rolaLabel || c.utworzonePrzez?.nazwa}</span>
                        <span>💬 {c.komentarze?.length || 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== FORMULARZ NOWEJ/EDYCJI REKLAMACJI ==========
  if (view === 'form') {
    return (
      <div className="modal-overlay">
        <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{editingComplaint ? '✏️ Edytuj reklamację' : '➕ Nowa reklamacja'}</h2>
            <button className="btn-close" onClick={() => { resetForm(); setView('list'); }}>×</button>
          </div>
          <div className="modal-body">
            <div className="complaint-form-layout">
              <div className="complaint-form-main">
                <div className="form-section">
                  <h3>📦 Wybierz zamówienie</h3>
                  <div className="form-group">
                    <label>ZAMÓWIENIE *</label>
                    <select value={formData.orderId} onChange={e => setFormData({...formData, orderId: e.target.value})}>
                      <option value="">-- Wybierz zamówienie --</option>
                      {orders.map(o => (
                        <option key={o.id} value={o.id}>{o.nrWlasny} - {o.klient?.imie} - {o.towar?.substring(0, 30)}...</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-section">
                  <h3>📋 Szczegóły reklamacji</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>TYP REKLAMACJI *</label>
                      <select value={formData.typ} onChange={e => setFormData({...formData, typ: e.target.value})}>
                        {COMPLAINT_TYPES.map(t => (
                          <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>PRIORYTET</label>
                      <select value={formData.priorytet} onChange={e => setFormData({...formData, priorytet: e.target.value})}>
                        <option value="niski">🟢 Niski</option>
                        <option value="normalny">🟡 Normalny</option>
                        <option value="wysoki">🔴 Wysoki</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>OPIS PROBLEMU *</label>
                    <textarea value={formData.opis} onChange={e => setFormData({...formData, opis: e.target.value})} rows={4} placeholder="Opisz szczegółowo problem..." />
                  </div>
                </div>

                <div className="form-section">
                  <h3>💬 Wiadomość od klienta</h3>
                  <div className="form-group">
                    <label>TREŚĆ WIADOMOŚCI KLIENTA</label>
                    <textarea value={formData.wiadomoscKlienta} onChange={e => setFormData({...formData, wiadomoscKlienta: e.target.value})} rows={3} placeholder="Wklej lub przepisz wiadomość od klienta..." />
                  </div>
                  <div className="form-group">
                    <label>OCZEKIWANIA KLIENTA</label>
                    <textarea value={formData.oczekiwaniaKlienta} onChange={e => setFormData({...formData, oczekiwaniaKlienta: e.target.value})} rows={2} placeholder="Czego oczekuje klient? (zwrot, wymiana, naprawa...)" />
                  </div>
                </div>

                <div className="form-section">
                  <h3>📷 Zdjęcia od klienta</h3>
                  <div className="photos-upload-area">
                    {formData.zdjecia.map(photo => (
                      <div key={photo.id} className="photo-thumb">
                        <img src={photo.url} alt="Reklamacja" />
                        <button className="photo-remove" onClick={() => setFormData({...formData, zdjecia: formData.zdjecia.filter(p => p.id !== photo.id)})}>×</button>
                      </div>
                    ))}
                    <label className="photo-add-btn">
                      📷 Dodaj
                      <input type="file" accept="image/*" multiple style={{display: 'none'}} onChange={handlePhotoUpload} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="complaint-form-sidebar">
                <h4>📦 Podgląd zamówienia</h4>
                {selectedOrder ? (
                  <div className="order-preview-card">
                    <div className="order-preview-header">
                      <span className="country-flag">{getCountry(selectedOrder.kraj)?.flag}</span>
                      <span className="order-number">{selectedOrder.nrWlasny}</span>
                    </div>
                    <p className="order-preview-product">{selectedOrder.towar}</p>
                    <div className="order-preview-details">
                      <div className="detail-row"><span className="detail-label">Klient:</span><span>{selectedOrder.klient?.imie || '—'}</span></div>
                      <div className="detail-row"><span className="detail-label">Telefon:</span><span>{selectedOrder.klient?.telefon || '—'}</span></div>
                      <div className="detail-row"><span className="detail-label">Adres:</span><span>{selectedOrder.klient?.adres || '—'}</span></div>
                      <div className="detail-row"><span className="detail-label">Cena:</span><span>{formatCurrency(selectedOrder.platnosci?.cenaCalkowita, selectedOrder.platnosci?.waluta)}</span></div>
                      <div className="detail-row"><span className="detail-label">Status:</span><span>{getStatus(selectedOrder.status)?.name}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="order-preview-empty">Wybierz zamówienie aby zobaczyć szczegóły</div>
                )}
                <div className="deadline-info-box">
                  <strong>⏰ Termin rozpatrzenia</strong>
                  <p>Masz 14 dni na rozpatrzenie reklamacji od momentu jej utworzenia.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={() => { resetForm(); setView('list'); }}>← Wróć</button>
            <button className="btn-primary" onClick={handleSaveComplaint}>
              {editingComplaint ? '💾 Zapisz zmiany' : '✅ Utwórz reklamację'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== SZCZEGÓŁY REKLAMACJI ==========
  if (view === 'detail' && selectedComplaint) {
    const status = getComplaintStatus(selectedComplaint.status);
    const type = getComplaintType(selectedComplaint.typ);
    const daysLeft = getComplaintDaysLeft(selectedComplaint.dataUtworzenia);
    const deadline = getDeadlineStyle(daysLeft);

    return (
      <div className="modal-overlay">
        <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="complaint-detail-header">
              <h2>📋 {selectedComplaint.numer}</h2>
              <span className="status-badge" style={{ background: status.bgColor, color: status.color }}>{status.name}</span>
              {!['rozwiazana', 'odrzucona'].includes(selectedComplaint.status) && deadline && (
                <span className={`deadline-badge ${deadline.urgent ? 'blink' : ''}`} style={{ background: deadline.bg, color: deadline.color }}>⏰ {deadline.label}</span>
              )}
            </div>
            <button className="btn-close" onClick={() => setView('list')}>×</button>
          </div>
          <div className="modal-body">
            <div className="complaint-detail-layout">
              <div className="complaint-detail-main">
                {/* Opis reklamacji */}
                <div className="detail-section-card">
                  <div className="detail-section-header">
                    <h4>{type.icon} {type.name}</h4>
                    <select value={selectedComplaint.status} onChange={e => handleStatusChange(selectedComplaint, e.target.value)} className="status-select" style={{ background: status.bgColor, color: status.color }}>
                      {COMPLAINT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                    </select>
                  </div>
                  <p className="detail-description">{selectedComplaint.opis}</p>
                  
                  {selectedComplaint.wiadomoscKlienta && (
                    <div className="detail-expectations customer-message">
                      <strong>💬 Wiadomość od klienta:</strong>
                      <p>{selectedComplaint.wiadomoscKlienta}</p>
                    </div>
                  )}
                  
                  {selectedComplaint.oczekiwaniaKlienta && (
                    <div className="detail-expectations">
                      <strong>Oczekiwania klienta:</strong>
                      <p>{selectedComplaint.oczekiwaniaKlienta}</p>
                    </div>
                  )}
                </div>

                {/* CZAT Z KLIENTEM - zamiast osobnych sekcji Zdjęcia i Komentarze */}
                <div className="detail-section-card" style={{background: '#F8FAFC'}}>
                  <h4 style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px'}}>
                    💬 Czat z klientem
                    {selectedComplaint.wiadomosci?.length > 0 && (
                      <span style={{background: '#6366F1', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '12px'}}>
                        {selectedComplaint.wiadomosci.length}
                      </span>
                    )}
                  </h4>
                  
                  {/* Lista wiadomości */}
                  <div style={{
                    maxHeight: '400px', 
                    overflowY: 'auto', 
                    marginBottom: '15px',
                    padding: '10px',
                    background: 'white',
                    borderRadius: '10px',
                    border: '1px solid #E5E7EB'
                  }}>
                    {(selectedComplaint.wiadomosci || []).map((msg, idx) => {
                      const isClient = msg.autor === 'klient';
                      return (
                        <div 
                          key={msg.id || idx}
                          style={{
                            display: 'flex',
                            justifyContent: isClient ? 'flex-start' : 'flex-end',
                            marginBottom: '12px'
                          }}
                        >
                          <div style={{
                            maxWidth: '75%',
                            background: isClient ? '#F3F4F6' : 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            color: isClient ? '#374151' : 'white',
                            padding: '12px 16px',
                            borderRadius: isClient ? '4px 16px 16px 16px' : '16px 16px 4px 16px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                          }}>
                            <div style={{fontSize: '11px', opacity: 0.8, marginBottom: '4px', fontWeight: '500'}}>
                              {isClient ? `👤 ${msg.autorNazwa || 'Klient'}` : `🏢 ${msg.autorNazwa || 'Obsługa'}`} • {formatDateTime(msg.data)}
                            </div>
                            <div style={{fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap'}}>{msg.tresc}</div>
                            
                            {/* Zdjęcia w wiadomości */}
                            {msg.zdjecia && msg.zdjecia.length > 0 && (
                              <div style={{display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap'}}>
                                {msg.zdjecia.map((photo, pIdx) => {
                                  // Obsługa różnych formatów zdjęć (URL lub obiekt)
                                  const photoUrl = typeof photo === 'string' ? photo : photo.url;
                                  return (
                                    <img 
                                      key={pIdx}
                                      src={photoUrl}
                                      alt={`Zdjęcie ${pIdx + 1}`}
                                      style={{
                                        width: '80px', 
                                        height: '80px', 
                                        objectFit: 'cover', 
                                        borderRadius: '8px', 
                                        cursor: 'pointer',
                                        border: isClient ? '2px solid #D1D5DB' : '2px solid rgba(255,255,255,0.3)'
                                      }}
                                      onClick={() => setLightboxPhoto(photoUrl)}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {(!selectedComplaint.wiadomosci || selectedComplaint.wiadomosci.length === 0) && (
                      <p style={{textAlign: 'center', color: '#9CA3AF', padding: '30px'}}>Brak wiadomości</p>
                    )}
                  </div>
                  
                  {/* Pole do pisania wiadomości z możliwością dodania zdjęć */}
                  {!['rozwiazana', 'odrzucona'].includes(selectedComplaint.status) && (
                    <div>
                      {/* Podgląd zdjęć do wysłania */}
                      {chatPhotos.length > 0 && (
                        <div style={{display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap'}}>
                          {chatPhotos.map((photo, idx) => (
                            <div key={idx} style={{position: 'relative'}}>
                              <img 
                                src={photo} 
                                alt={`Do wysłania ${idx + 1}`}
                                style={{width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #6366F1'}}
                              />
                              <button
                                onClick={() => removeChatPhoto(idx)}
                                style={{
                                  position: 'absolute',
                                  top: '-6px',
                                  right: '-6px',
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  background: '#DC2626',
                                  color: 'white',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div style={{display: 'flex', gap: '10px', alignItems: 'flex-end'}}>
                        <textarea 
                          value={newComment} 
                          onChange={e => setNewComment(e.target.value)} 
                          placeholder="Napisz wiadomość do klienta..." 
                          rows={2}
                          style={{
                            flex: 1,
                            padding: '12px',
                            border: '2px solid #E5E7EB',
                            borderRadius: '10px',
                            fontSize: '14px',
                            resize: 'none'
                          }}
                        />
                        <label style={{
                          padding: '12px',
                          background: '#F3F4F6',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '2px solid #E5E7EB'
                        }}>
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            style={{display: 'none'}}
                            onChange={handleChatPhotoUpload}
                          />
                          📷
                        </label>
                        <button 
                          className="btn-primary" 
                          onClick={handleAddComment} 
                          disabled={(!newComment.trim() && chatPhotos.length === 0) || uploadingChatPhotos}
                          style={{
                            padding: '12px 20px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          {uploadingChatPhotos ? '⏳' : '📤'} Wyślij
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {['rozwiazana', 'odrzucona'].includes(selectedComplaint.status) && (
                    <div style={{
                      background: selectedComplaint.status === 'rozwiazana' ? '#D1FAE5' : '#F3F4F6',
                      padding: '12px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      color: selectedComplaint.status === 'rozwiazana' ? '#065F46' : '#6B7280'
                    }}>
                      {selectedComplaint.status === 'rozwiazana' ? '✅ Reklamacja rozwiązana' : '❌ Reklamacja odrzucona'} - czat zamknięty
                    </div>
                  )}
                </div>

                {/* LIGHTBOX - powiększone zdjęcie */}
                {lightboxPhoto && (
                  <div 
                    onClick={() => setLightboxPhoto(null)}
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0,0,0,0.9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 10000,
                      cursor: 'pointer'
                    }}
                  >
                    <button
                      onClick={() => setLightboxPhoto(null)}
                      style={{
                        position: 'absolute',
                        top: '20px',
                        right: '20px',
                        background: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        fontSize: '24px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >×</button>
                    <img 
                      src={lightboxPhoto} 
                      alt="Powiększone zdjęcie"
                      style={{
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        objectFit: 'contain',
                        borderRadius: '8px'
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                )}

                {/* Rozwiązanie */}
                {selectedComplaint.status === 'rozwiazana' && selectedComplaint.rozwiazanie ? (
                  <div className="detail-section-card resolution-section">
                    <h4>✅ Rozwiązanie</h4>
                    <p className="detail-description">{selectedComplaint.rozwiazanie}</p>
                    <span className="resolution-date">Rozwiązano: {formatDateTime(selectedComplaint.dataRozwiazania)}</span>
                  </div>
                ) : !['rozwiazana', 'odrzucona'].includes(selectedComplaint.status) && (
                  <div className="detail-section-card">
                    <h4>✅ Rozwiąż reklamację</h4>
                    <div className="resolve-form">
                      <textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Opisz rozwiązanie reklamacji..." rows={3} />
                      <button className="btn-success" onClick={handleResolve} disabled={!resolution.trim()}>✅ Oznacz jako rozwiązaną</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="complaint-detail-sidebar">
                {/* Zamówienie */}
                <div className="sidebar-card">
                  <h4>📦 Zamówienie</h4>
                  {complaintOrder ? (
                    <div className="sidebar-info">
                      <div className="info-row"><strong>{getCountry(complaintOrder.kraj)?.flag} {complaintOrder.nrWlasny}</strong></div>
                      <div className="info-row info-product"><span className="info-label">Produkt:</span>{complaintOrder.towar}</div>
                      <div className="info-row"><span className="info-label">Status:</span>
                        <span className="status-badge small" style={{ background: getStatus(complaintOrder.status)?.bgColor, color: getStatus(complaintOrder.status)?.color }}>
                          {getStatus(complaintOrder.status)?.icon} {getStatus(complaintOrder.status)?.name}
                        </span>
                      </div>
                      <div className="info-row"><span className="info-label">Cena:</span><strong>{formatCurrency(complaintOrder.platnosci?.cenaCalkowita, complaintOrder.platnosci?.waluta)}</strong></div>
                    </div>
                  ) : (
                    <p className="no-data">Zamówienie usunięte</p>
                  )}
                </div>

                {/* Klient */}
                {complaintOrder?.klient && (
                  <div className="sidebar-card">
                    <h4>👤 Klient</h4>
                    <div className="sidebar-info">
                      <div className="info-row"><strong>{complaintOrder.klient.imie}</strong></div>
                      {complaintOrder.klient.telefon && <div className="info-row"><a href={`tel:${complaintOrder.klient.telefon}`}>📞 {complaintOrder.klient.telefon}</a></div>}
                      {complaintOrder.klient.email && <div className="info-row"><a href={`mailto:${complaintOrder.klient.email}`}>✉️ {complaintOrder.klient.email}</a></div>}
                      {complaintOrder.klient.adres && <div className="info-row info-address">📍 {complaintOrder.klient.adres}</div>}
                    </div>
                  </div>
                )}

                {/* Termin */}
                <div className={`sidebar-card ${['rozwiazana', 'odrzucona'].includes(selectedComplaint.status) ? 'resolved' : deadline?.urgent ? 'urgent' : 'warning'}`}>
                  <h4>⏰ Termin</h4>
                  <div className="sidebar-info">
                    <div className="info-row deadline-status">
                      <strong>
                        {['rozwiazana', 'odrzucona'].includes(selectedComplaint.status) ? '✅ Zakończona' : daysLeft <= 0 ? '⚠️ Termin minął!' : `Pozostało ${daysLeft} dni`}
                      </strong>
                    </div>
                    <div className="info-row info-date">Utworzono: {formatDate(selectedComplaint.dataUtworzenia)}</div>
                    {selectedComplaint.dataRozwiazania && <div className="info-row info-date resolved">Rozwiązano: {formatDate(selectedComplaint.dataRozwiazania)}</div>}
                  </div>
                </div>

                {/* Priorytet */}
                <div className="sidebar-card">
                  <h4>⚡ Priorytet</h4>
                  <span className={`priority-tag ${selectedComplaint.priorytet}`}>
                    {selectedComplaint.priorytet === 'wysoki' ? '🔴 Wysoki' : selectedComplaint.priorytet === 'normalny' ? '🟡 Normalny' : '🟢 Niski'}
                  </span>
                </div>

                {/* Dodana przez */}
                <div className="sidebar-card creator-card">
                  <h4>✍️ Dodana przez</h4>
                  <div className="sidebar-info">
                    <div className="info-row"><strong>{selectedComplaint.utworzonePrzez?.nazwa || 'Nieznany'}</strong></div>
                    <div className="info-row creator-role">{selectedComplaint.utworzonePrzez?.rolaLabel || 'Użytkownik'}</div>
                    <div className="info-row info-date">📅 {formatDateTime(selectedComplaint.dataUtworzenia)}</div>
                  </div>
                </div>

                {/* Usuń */}
                <button className="btn-primary btn-full" onClick={() => openEditForm(selectedComplaint)} style={{ marginBottom: '10px' }}>
                  ✏️ Edytuj reklamację
                </button>
                
                {/* PRZYCISK - Wyślij do producenta */}
                {complaintOrder && (
                  <button 
                    className="btn-warning btn-full" 
                    onClick={() => {
                      // Znajdź producenta z produktu lub zamówienia
                      const producerId = complaintOrder.produkty?.[0]?.producent || complaintOrder.zaladunek;
                      const producer = producerId ? Object.values(producers || {}).find(p => p.id === producerId) : null;
                      
                      if (!producer) {
                        alert('❌ Brak przypisanego producenta do tego zamówienia. Najpierw przypisz producenta w zamówieniu.');
                        return;
                      }
                      
                      if (!producer.email) {
                        alert(`❌ Producent "${producer.name}" nie ma przypisanego adresu email. Dodaj email w ustawieniach producenta.`);
                        return;
                      }
                      
                      // Przygotuj treść wiadomości
                      const klientMsg = selectedComplaint.wiadomoscKlienta || selectedComplaint.opis || '';
                      const zdjecia = selectedComplaint.zdjecia || [];
                      
                      // Link do podglądu zdjęć reklamacji dla producenta
                      const complaintToken = selectedComplaint.complaintToken || selectedComplaint.id;
                      const photosLink = `${window.location.origin}/reklamacja/${complaintToken}?view=producer`;
                      
                      const subject = `⚠️ REKLAMACJA ${selectedComplaint.numer} - Zamówienie ${complaintOrder.nrWlasny}`;
                      
                      const body = `
════════════════════════════════════════════════════════
                    ⚠️  R E K L A M A C J A  ⚠️
════════════════════════════════════════════════════════

📋 NUMER REKLAMACJI:  ${selectedComplaint.numer}
📦 NUMER ZAMÓWIENIA:  ${complaintOrder.nrWlasny}
📅 DATA ZGŁOSZENIA:   ${new Date(selectedComplaint.dataUtworzenia).toLocaleDateString('pl-PL')}

────────────────────────────────────────────────────────
                    SZCZEGÓŁY PROBLEMU
────────────────────────────────────────────────────────

🔴 TYP REKLAMACJI:
   ${selectedComplaint.typ || 'Reklamacja'}

📝 OPIS PROBLEMU:
   ${selectedComplaint.opis || 'Brak opisu'}

${klientMsg && klientMsg !== selectedComplaint.opis ? `💬 DODATKOWA WIADOMOŚĆ OD KLIENTA:
   ${klientMsg}

` : ''}${selectedComplaint.oczekiwaniaKlienta ? `🎯 OCZEKIWANIA KLIENTA:
   ${selectedComplaint.oczekiwaniaKlienta}

` : ''}────────────────────────────────────────────────────────
                    DANE PRODUKTU
────────────────────────────────────────────────────────

📦 PRODUKT:
   ${complaintOrder.towar || complaintOrder.produkty?.[0]?.towar || '—'}

👤 KLIENT:
   ${complaintOrder.klient?.imie || '—'}

📍 ADRES DOSTAWY:
   ${complaintOrder.klient?.adres || '—'}

${zdjecia.length > 0 ? `────────────────────────────────────────────────────────
                    📷 ZDJĘCIA (${zdjecia.length})
────────────────────────────────────────────────────────

🔗 LINK DO PODGLĄDU ZDJĘĆ:
   ${photosLink}

` : ''}════════════════════════════════════════════════════════

Prosimy o zajęcie stanowiska w sprawie tej reklamacji
i przekazanie informacji zwrotnej.

W razie pytań pozostajemy do dyspozycji.

Z poważaniem,
Zespół Herraton
`;
                      
                      // Otwórz klienta pocztowego
                      window.location.href = `mailto:${producer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                      
                      // Zapisz w historii reklamacji
                      onSave({
                        ...selectedComplaint,
                        historia: [...(selectedComplaint.historia || []), {
                          data: new Date().toISOString(),
                          uzytkownik: currentUser.name,
                          akcja: `Otwarto email do producenta: ${producer.name}`
                        }]
                      }, selectedComplaint.id);
                    }}
                    style={{ marginBottom: '10px', background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}
                  >
                    📧 Wyślij reklamację do producenta
                  </button>
                )}
                
                <button className="btn-danger btn-full" onClick={() => { if (window.confirm('Usunąć reklamację?')) { onDelete(selectedComplaint.id); setView('list'); } }}>
                  🗑️ Usuń reklamację
                </button>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={() => setView('list')}>← Wróć do listy</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// ============================================
// MODAL EMAIL
// ============================================

const EmailModal = ({ order, producer, onClose }) => {
  const [emailType, setEmailType] = useState('inquiry'); // inquiry, order
  
  // Filtruj produkty tylko dla tego producenta
  const getProducerProducts = () => {
    if (!order.produkty || order.produkty.length === 0) {
      // Stare zamówienie bez produktów
      return order.towar || 'Brak opisu';
    }
    
    // Filtruj produkty przypisane do tego producenta
    const producerProducts = order.produkty.filter(p => p.producent === producer?.id);
    
    if (producerProducts.length === 0) {
      // Fallback - pokaż wszystkie produkty
      return order.towar || 'Brak opisu';
    }
    
    // Formatuj listę produktów tego producenta (BEZ numeru w nawiasie - będzie osobno)
    return producerProducts.map(p => {
      return p.towar;
    }).join('\n');
  };
  
  // Pobierz numery zamówień dla produktów tego producenta
  const getProducerOrderNumbers = () => {
    if (!order.produkty || order.produkty.length === 0) {
      return order.nrWlasny || 'BRAK';
    }
    
    const producerProducts = order.produkty.filter(p => p.producent === producer?.id);
    
    if (producerProducts.length === 0) {
      return order.nrWlasny || 'BRAK';
    }
    
    // Zwróć numery podzamówień tego producenta
    const orderNumbers = producerProducts.map(p => p.nrPodzamowienia || order.nrWlasny).filter(Boolean);
    return orderNumbers.length > 0 ? orderNumbers.join(', ') : order.nrWlasny || 'BRAK';
  };
  
  // Pobierz datę odbioru dla produktów tego producenta
  const getProducerDeliveryDate = () => {
    if (!order.produkty || order.produkty.length === 0) {
      return formatDate(order.dataOdbioru);
    }
    
    const producerProducts = order.produkty.filter(p => p.producent === producer?.id);
    if (producerProducts.length > 0 && producerProducts[0].dataOdbioru) {
      return formatDate(producerProducts[0].dataOdbioru);
    }
    
    return formatDate(order.dataOdbioru) || '—';
  };
  
  const productDescription = getProducerProducts();
  const deliveryDate = getProducerDeliveryDate();
  const orderNumbers = getProducerOrderNumbers();
  
  const inquiryBody = `Dzień dobry,

Pytanie o zamówienie nr ${orderNumbers} - termin: ${deliveryDate}.

Opis: ${productDescription}

Proszę o informację o statusie realizacji.

Z poważaniem`;

  const orderBody = `Dzień dobry,

Zlecam realizację zamówienia:

Nr zamówienia: ${orderNumbers}
Opis: ${productDescription}
Termin odbioru: ${deliveryDate || 'Do ustalenia'}

Proszę o potwierdzenie przyjęcia zlecenia.

Z poważaniem`;

  const body = emailType === 'inquiry' ? inquiryBody : orderBody;
  const subject = emailType === 'inquiry' 
    ? `Zapytanie - zamówienie ${orderNumbers}` 
    : `ZLECENIE - zamówienie ${orderNumbers}`;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📧 Kontakt z producentem</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="contact-info">
            <strong>{producer?.name}</strong>
            <span>📧 {producer?.email || '—'}</span>
            <span>📞 {producer?.phone || '—'}</span>
            {producer?.address && <span>📍 {producer.address}</span>}
          </div>

          <div className="email-type-selector">
            <button className={`email-type-btn ${emailType === 'inquiry' ? 'active' : ''}`} onClick={() => setEmailType('inquiry')}>
              ❓ Zapytanie o produkt
            </button>
            <button className={`email-type-btn ${emailType === 'order' ? 'active' : ''}`} onClick={() => setEmailType('order')}>
              📦 Zleć zamówienie
            </button>
          </div>

          <div className="email-preview">
            <label>Podgląd wiadomości:</label>
            <pre>{body}</pre>
          </div>

          <div className="contact-actions">
            {producer?.phone && <a href={`tel:${producer.phone}`} className="btn-secondary">📞 Zadzwoń</a>}
            {producer?.email && (
              <a href={`mailto:${producer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} className="btn-primary">
                ✉️ Wyślij {emailType === 'order' ? 'zlecenie' : 'zapytanie'}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MODAL ZBIORCZEGO EMAILA
// ============================================

const BulkEmailModal = ({ orders, producer, onClose }) => {
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [emailType, setEmailType] = useState('inquiry');

  // Funkcja do pobierania tylko produktów danego producenta z zamówienia
  const getProducerProductsFromOrder = (order) => {
    if (!order.produkty || order.produkty.length === 0) {
      return order.towar || 'brak opisu';
    }
    
    const producerProducts = order.produkty.filter(p => p.producent === producer?.id);
    if (producerProducts.length === 0) {
      return order.towar || 'brak opisu';
    }
    
    return producerProducts.map(p => {
      const prefix = order.produkty.length > 1 ? `[${p.nrPodzamowienia || ''}] ` : '';
      return `${prefix}${p.towar}`;
    }).join('; ');
  };

  // Funkcja do pobierania daty odbioru dla produktów danego producenta
  const getProducerDeliveryDate = (order) => {
    if (!order.produkty || order.produkty.length === 0) {
      return formatDate(order.dataOdbioru) || 'brak';
    }
    
    const producerProducts = order.produkty.filter(p => p.producent === producer?.id);
    if (producerProducts.length > 0 && producerProducts[0].dataOdbioru) {
      return formatDate(producerProducts[0].dataOdbioru);
    }
    
    return formatDate(order.dataOdbioru) || 'brak';
  };

  const toggleOrder = (orderId) => {
    setSelectedOrders(prev => prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]);
  };

  const selectAll = () => {
    setSelectedOrders(selectedOrders.length === orders.length ? [] : orders.map(o => o.id));
  };

  const generateBody = () => {
    const selected = orders.filter(o => selectedOrders.includes(o.id));
    
    if (emailType === 'inquiry') {
      const ordersList = selected.map(o => {
        const productDesc = getProducerProductsFromOrder(o);
        const deliveryDate = getProducerDeliveryDate(o);
        return `• Nr ${o.nrWlasny} - ${productDesc.substring(0, 50)}${productDesc.length > 50 ? '...' : ''} (termin: ${deliveryDate})`;
      }).join('\n');

      return `Dzień dobry,

Proszę o informację o statusie realizacji następujących zamówień:

${ordersList}

Proszę o informację zwrotną.

Z poważaniem`;
    } else {
      const ordersList = selected.map(o => {
        const productDesc = getProducerProductsFromOrder(o);
        const deliveryDate = getProducerDeliveryDate(o);
        return `━━━━━━━━━━━━━━━━━━━━━━
Nr zamówienia: ${o.nrWlasny}
Opis: ${productDesc}
Termin odbioru: ${deliveryDate || 'Do ustalenia'}`;
      }).join('\n\n');

      return `Dzień dobry,

Zlecam realizację następujących zamówień:

${ordersList}

━━━━━━━━━━━━━━━━━━━━━━

Proszę o potwierdzenie przyjęcia zleceń.

Z poważaniem`;
    }
  };

  const body = generateBody();
  const subject = emailType === 'inquiry'
    ? `Zapytanie zbiorcze - ${selectedOrders.length} zamówień`
    : `ZLECENIE ZBIORCZE - ${selectedOrders.length} zamówień`;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📧 Zbiorczy email do: {producer?.name}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="email-type-selector">
            <button className={`email-type-btn ${emailType === 'inquiry' ? 'active' : ''}`} onClick={() => setEmailType('inquiry')}>
              ❓ Zbiorcze zapytanie
            </button>
            <button className={`email-type-btn ${emailType === 'order' ? 'active' : ''}`} onClick={() => setEmailType('order')}>
              📦 Zbiorcze zlecenie
            </button>
          </div>

          <div className="bulk-orders-section">
            <div className="bulk-orders-header">
              <h3>Wybierz zamówienia ({selectedOrders.length}/{orders.length})</h3>
              <button className="btn-secondary small" onClick={selectAll}>
                {selectedOrders.length === orders.length ? '☐ Odznacz wszystko' : '☑ Zaznacz wszystko'}
              </button>
            </div>
            <div className="bulk-orders-list">
              {orders.map(order => (
                <label key={order.id} className={`bulk-order-item ${selectedOrders.includes(order.id) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selectedOrders.includes(order.id)} onChange={() => toggleOrder(order.id)} />
                  <div className="bulk-order-info">
                    <span className="bulk-order-number">{order.nrWlasny}</span>
                    <span className="bulk-order-desc">{order.towar?.substring(0, 40)}...</span>
                    <span className="bulk-order-date">📅 {formatDate(order.dataOdbioru)}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {selectedOrders.length > 0 && (
            <div className="email-preview">
              <label>Podgląd wiadomości:</label>
              <pre>{body}</pre>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Anuluj</button>
          {producer?.email && selectedOrders.length > 0 && (
            <a href={`mailto:${producer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} className="btn-primary" onClick={onClose}>
              ✉️ Wyślij {emailType === 'order' ? 'zlecenie' : 'zapytanie'} ({selectedOrders.length})
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// KARTA ZAMÓWIENIA
// ============================================

const OrderCard = ({ order, onEdit, onStatusChange, onEmailClick, onClick, producers, drivers, onDelete, isAdmin, isContractor, exchangeRates, currentUser, onProductStatusChange }) => {
  const [showProducerMenu, setShowProducerMenu] = useState(false);
  const status = getStatus(order.status);
  const country = getCountry(order.kraj);
  
  // Data odbioru - sprawdź główne pole LUB pierwszy produkt
  const pickupDate = order.dataOdbioru || order.produkty?.[0]?.dataOdbioru;
  const days = getDaysUntilPickup(pickupDate);

  // Sprawdź czy użytkownik może usunąć zamówienie
  const canDelete = isAdmin || order.utworzonePrzez?.id === currentUser?.id || order.kontrahentId === currentUser?.id;
  // Nie pokazuj pilności dla zamówień w transporcie, dostarczonych, odebranych lub gotowych do odbioru
  const showUrgency = !['w_transporcie', 'dostarczone', 'odebrane', 'gotowe_do_odbioru'].includes(order.status);
  const urgency = showUrgency ? getUrgencyStyle(days) : null;
  const producer = Object.values(producers).find(p => p.id === order.zaladunek);
  
  // Kierowca - sprawdź główne przypisanie LUB kierowcę z pierwszego produktu
  const driverId = order.przypisanyKierowca || order.produkty?.[0]?.kierowca;
  const driver = drivers.find(d => d.id === driverId);
  
  // Czy to zamówienie łączone (wiele produktów)?
  const hasMultipleProducts = order.produkty && order.produkty.length > 1;
  
  // Pobierz unikalnych producentów z produktów
  const getUniqueProducers = () => {
    if (!order.produkty || order.produkty.length === 0) {
      return producer ? [producer] : [];
    }
    
    const producerIds = [...new Set(order.produkty.map(p => p.producent).filter(Boolean))];
    return producerIds.map(id => Object.values(producers).find(p => p.id === id)).filter(Boolean);
  };
  
  const uniqueProducers = getUniqueProducers();

  // Konwersja do PLN
  const convertToPLN = (amount, currency) => {
    if (!amount || currency === 'PLN' || !exchangeRates) return amount || 0;
    return (amount || 0) * (exchangeRates[currency] || 1);
  };

  // Prawidłowe wyliczenie marży - ZAWSZE W PLN
  const calcMarzaPLN = () => {
    const cenaBrutto = order.platnosci?.cenaCalkowita || 0;
    const vatRate = order.koszty?.vatRate || 23;
    const vatMultiplier = 1 + vatRate / 100;
    
    // Cena netto od klienta w oryginalnej walucie
    const cenaNetto = cenaBrutto / vatMultiplier;
    
    // Konwertuj cenę do PLN
    const cenaNettoPLN = convertToPLN(cenaNetto, order.platnosci?.waluta);
    
    // Koszty - suma z produktów lub ze starego pola
    let zakupNettoPLN = 0;
    let transportNettoPLN = 0;
    
    if (order.produkty && order.produkty.length > 0) {
      order.produkty.forEach(p => {
        // Koszt zakupu
        if (p.koszty?.zakupNetto) {
          zakupNettoPLN += convertToPLN(p.koszty.zakupNetto, p.koszty?.waluta || 'PLN');
        }
        // Koszt transportu
        if (p.koszty?.transportNetto) {
          transportNettoPLN += convertToPLN(p.koszty.transportNetto, p.koszty?.transportWaluta || 'PLN');
        }
      });
    } else {
      // Stare zamówienie bez produktów
      const zakupNetto = order.koszty?.zakupNetto || 0;
      zakupNettoPLN = convertToPLN(zakupNetto, order.koszty?.waluta);
      
      const transportNetto = order.koszty?.transportNetto || order.koszty?.transport || 0;
      transportNettoPLN = convertToPLN(transportNetto, order.koszty?.transportWaluta || order.koszty?.waluta);
    }
    
    // Marża w PLN = Cena netto - Zakup netto - Transport netto
    let marzaPLN = cenaNettoPLN - zakupNettoPLN - transportNettoPLN;
    
    // Oblicz sumę rabatów - preferuj rabatyKierowcow jako źródło prawdy
    let sumaRabatow = 0;
    
    // 1. Sprawdź rabatyKierowcow (główne źródło prawdy dla rabatów)
    if (order.rabatyKierowcow) {
      sumaRabatow = Object.values(order.rabatyKierowcow).filter(r => r && r.kwota > 0).reduce((sum, r) => sum + r.kwota, 0);
    }
    
    // 2. Jeśli brak w rabatyKierowcow, sprawdź produkty (dla starych zamówień)
    if (sumaRabatow === 0 && order.produkty && order.produkty.length > 0) {
      // Zbierz unikalne rabaty per kierowca z produktów
      const rabatyPerKierowca = {};
      order.produkty.forEach(p => {
        if (p.rabat && p.rabat.kwota > 0 && p.rabat.kierowcaId) {
          // Zapisz tylko jeden rabat per kierowca
          if (!rabatyPerKierowca[p.rabat.kierowcaId]) {
            rabatyPerKierowca[p.rabat.kierowcaId] = p.rabat.kwota;
          }
        }
      });
      sumaRabatow = Object.values(rabatyPerKierowca).reduce((sum, kwota) => sum + kwota, 0);
    }
    
    // 3. Fallback na stary rabatPrzyDostawie
    if (sumaRabatow === 0 && order.rabatPrzyDostawie?.kwota > 0) {
      sumaRabatow = order.rabatPrzyDostawie.kwota;
    }
    
    // Odejmij rabat od marży (rabat jest brutto, więc przeliczamy na netto)
    if (sumaRabatow > 0) {
      const rabatNetto = sumaRabatow / vatMultiplier;
      const rabatPLN = convertToPLN(rabatNetto, order.platnosci?.waluta);
      marzaPLN -= rabatPLN;
    }
    
    return Math.round(marzaPLN * 100) / 100;
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(order.id);
  };

  // Styl ramki karty według pilności
  const cardBorderStyle = urgency ? {
    borderLeft: `4px solid ${urgency.color}`,
    boxShadow: `0 2px 8px ${urgency.bg}`
  } : {};

  return (
    <div className={`order-card ${urgency?.blink ? 'urgency-blink' : ''}`} onClick={() => onClick(order)} style={cardBorderStyle}>
      <div className="order-card-header">
        <div className="order-card-title">
          <span className="country-flag">{country?.flag}</span>
          <span className="order-number">{order.nrWlasny || '—'}</span>
          {hasMultipleProducts && <span className="multi-product-badge">📦 {order.produkty.length}</span>}
          {order.potwierdzoneByClient && <span style={{background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600'}}>✓ Potwierdzone</span>}
          {order.wyslanieDoPotwierdzenia && !order.potwierdzoneByClient && <span style={{background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600'}}>⏳ Czeka</span>}
        </div>
      </div>

      <div className="order-card-body">
        {/* Jeśli wiele produktów - pokaż listę z osobnymi statusami */}
        {hasMultipleProducts ? (
          <div className="order-products-list">
            {order.produkty.map((prod, idx) => {
              const prodStatus = getStatus(prod.status);
              const prodProducer = Object.values(producers).find(p => p.id === prod.producent);
              const prodDriver = drivers.find(d => d.id === prod.kierowca);
              const prodDays = getDaysUntilPickup(prod.dataOdbioru);
              // Nie pokazuj pilności dla gotowe_do_odbioru i dalszych
              const showProdUrgency = !['gotowe_do_odbioru', 'odebrane', 'w_transporcie', 'dostarczone'].includes(prod.status);
              const prodUrgency = showProdUrgency ? getUrgencyStyle(prodDays) : null;
              
              // Styl ramki produktu według pilności
              const prodBorderStyle = prodUrgency ? {
                borderLeft: `4px solid ${prodUrgency.color}`,
                background: `linear-gradient(to right, ${prodUrgency.bg}40, transparent)`
              } : {};
              
              return (
                <div 
                  key={prod.id || idx} 
                  className={`order-product-item clickable ${prodUrgency?.blink ? 'urgency-blink' : ''}`}
                  style={prodBorderStyle}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Otwórz modal z wybranym produktem
                    onClick(order, idx);
                  }}
                >
                  <div className="product-item-header">
                    <span className="product-item-nr">{prod.nrPodzamowienia || `#${idx + 1}`}</span>
                    <select
                      value={prod.status || 'nowe'}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        e.stopPropagation();
                        if (onProductStatusChange) {
                          onProductStatusChange(order.id, idx, e.target.value);
                        }
                      }}
                      className="status-select small"
                      style={{ background: prodStatus?.bgColor, color: prodStatus?.color }}
                    >
                      {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                    </select>
                  </div>
                  <div className="product-item-desc">{prod.towar?.substring(0, 60) || '—'}{prod.towar?.length > 60 ? '...' : ''}</div>
                  <div className="product-item-tags">
                    {prodProducer && <span className="mini-tag producer">🏭 {prodProducer.name}</span>}
                    {prod.producentNazwa && <span className="mini-tag producer">🏭 {prod.producentNazwa}</span>}
                    {prodDriver && <span className="mini-tag driver">🚚 {prodDriver.name}</span>}
                    {prod.dataOdbioru && (
                      <span 
                        className={`mini-tag date ${prodUrgency?.blink ? 'blink' : ''}`}
                        style={prodUrgency ? { background: prodUrgency.bg, color: prodUrgency.color } : {}}
                      >
                        📅 {formatDate(prod.dataOdbioru)} {prodUrgency && `(${prodUrgency.label})`}
                      </span>
                    )}
                  </div>
                  {/* Wskaźnik protokołu dla tego produktu */}
                  {(prod.protokol?.zdjeciaOdbioru?.length > 0 || prod.protokol?.zdjeciaDostawy?.length > 0 || prod.protokol?.podpis) && (
                    <div className="product-protocol-indicators">
                      {prod.protokol?.zdjeciaOdbioru?.length > 0 && <span className="mini-indicator">📷O</span>}
                      {prod.protokol?.zdjeciaDostawy?.length > 0 && <span className="mini-indicator">📷D</span>}
                      {prod.protokol?.podpis && <span className="mini-indicator">✍️</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Przycisk podglądu całego zamówienia */}
            <button 
              className="view-all-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClick(order, null); // null = wszystkie produkty
              }}
            >
              👁️ Podgląd całego zamówienia
            </button>
          </div>
        ) : (
          <div className={`order-single-product ${urgency?.blink ? 'urgency-blink' : ''}`} style={urgency ? { borderLeft: `4px solid ${urgency.color}`, background: `linear-gradient(to right, ${urgency.bg}40, transparent)`, padding: '12px', borderRadius: '8px', marginBottom: '10px' } : { padding: '12px', background: '#F9FAFB', borderRadius: '8px', marginBottom: '10px' }}>
            <div className="product-item-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
              <span className="product-item-nr" style={{fontWeight: '600', color: '#374151'}}>{order.produkty?.[0]?.nrPodzamowienia || order.nrWlasny}</span>
              <select
                value={order.status}
                onClick={e => e.stopPropagation()}
                onChange={e => { e.stopPropagation(); onStatusChange(order.id, e.target.value); }}
                className="status-select small"
                style={{ background: status?.bgColor, color: status?.color }}
              >
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>
            <p className="order-product" style={{margin: '0 0 8px 0', fontSize: '14px', color: '#1F2937'}}>{order.towar || order.produkty?.[0]?.towar || 'Brak opisu'}</p>
            <div className="order-tags">
              {producer && !isContractor && <span className="mini-tag producer">🏭 {producer.name}</span>}
              {pickupDate && (
                <span 
                  className={`mini-tag date ${urgency?.blink ? 'blink' : ''}`}
                  style={urgency ? { background: urgency.bg, color: urgency.color, fontWeight: '600' } : {}}
                >
                  📅 {formatDate(pickupDate)} {urgency && `(${urgency.label})`}
                </span>
              )}
              {driver && <span className="mini-tag driver">🚚 {driver.name}</span>}
            </div>
          </div>
        )}

        <div className="order-client order-client-info">
          <div className="client-name">{order.klient?.imie || '—'}</div>
          <div className="client-address">📍 {order.klient?.adres || '—'}</div>
        </div>

        <div className="order-payment order-price">
          {order.platnosci?.cenaCalkowita > 0 && (
            <span>Cena: <strong>{formatCurrency(order.platnosci.cenaCalkowita, order.platnosci.waluta)}</strong></span>
          )}
          {order.platnosci?.doZaplaty > 0 && (
            <span className="unpaid">
              Do zapłaty: <strong>{formatCurrency(order.platnosci.doZaplaty, order.platnosci.waluta)}</strong>
            </span>
          )}
          {order.platnosci?.doZaplaty === 0 && order.platnosci?.cenaCalkowita > 0 && (
            <span className="paid-badge">✓ Opłacone</span>
          )}
          {/* Info o rabacie - nowa logika */}
          {(() => {
            // Zbierz sumę rabatów - preferuj rabatyKierowcow
            let sumaRabatow = 0;
            
            // 1. Sprawdź rabatyKierowcow (główne źródło prawdy)
            if (order.rabatyKierowcow) {
              sumaRabatow = Object.values(order.rabatyKierowcow).filter(r => r && r.kwota > 0).reduce((sum, r) => sum + r.kwota, 0);
            }
            
            // 2. Jeśli brak, sprawdź produkty (unikalne per kierowca)
            if (sumaRabatow === 0 && order.produkty && order.produkty.length > 0) {
              const rabatyPerKierowca = {};
              order.produkty.forEach(p => {
                if (p.rabat && p.rabat.kwota > 0 && p.rabat.kierowcaId) {
                  if (!rabatyPerKierowca[p.rabat.kierowcaId]) {
                    rabatyPerKierowca[p.rabat.kierowcaId] = p.rabat.kwota;
                  }
                }
              });
              sumaRabatow = Object.values(rabatyPerKierowca).reduce((sum, k) => sum + k, 0);
            }
            
            // 3. Fallback na stary rabatPrzyDostawie
            if (sumaRabatow === 0 && order.rabatPrzyDostawie?.kwota > 0) {
              sumaRabatow = order.rabatPrzyDostawie.kwota;
            }
            
            if (sumaRabatow > 0 && order.platnosci?.doZaplaty >= 0) {
              const originalDoZaplaty = order.platnosci?.originalDoZaplaty || (order.platnosci?.doZaplaty + sumaRabatow);
              return (
                <small className="payment-discount-info">
                  <br/>
                  <span className="original-amount">Było: {formatCurrency(originalDoZaplaty, order.platnosci?.waluta)}</span>
                  <span className="discount-applied"> → Rabat: -{formatCurrency(sumaRabatow, order.platnosci?.waluta)}</span>
                </small>
              );
            }
            return null;
          })()}
          {/* Marża - tylko dla admina - ZAWSZE W PLN */}
          {isAdmin && (order.koszty?.zakupNetto > 0 || order.koszty?.zakupBrutto > 0 || (order.produkty?.some(p => p.koszty?.zakupNetto > 0))) && (
            <span className={calcMarzaPLN() >= 0 ? 'margin-badge positive' : 'margin-badge negative'}>
              📊 Marża: <strong>{formatCurrency(calcMarzaPLN(), 'PLN')}</strong>
              {(() => {
                // Sprawdź czy jest jakiś rabat - filtruj null
                let maRabat = false;
                if (order.produkty) {
                  maRabat = order.produkty.some(p => p.rabat?.kwota > 0);
                }
                if (!maRabat && order.rabatyKierowcow) {
                  maRabat = Object.values(order.rabatyKierowcow).filter(r => r).some(r => r.kwota > 0);
                }
                if (!maRabat && order.rabatPrzyDostawie?.kwota > 0) {
                  maRabat = true;
                }
                return maRabat ? <small className="discount-note"> (po rabacie)</small> : null;
              })()}
            </span>
          )}
        </div>

        {order.uwagi && <div className="order-notes">📝 {order.uwagi}</div>}

        {(order.zdjeciaOdbioru?.length > 0 || order.zdjeciaDostawy?.length > 0 || order.podpisKlienta) && (
          <div className="order-indicators">
            {order.zdjeciaOdbioru?.length > 0 && <span className="indicator">📷 Odbiór ({order.zdjeciaOdbioru.length})</span>}
            {order.zdjeciaDostawy?.length > 0 && <span className="indicator">📷 Dostawa ({order.zdjeciaDostawy.length})</span>}
            {order.podpisKlienta && <span className="indicator">✍️ Podpis</span>}
          </div>
        )}

        <div className="order-card-footer order-date">
          <span className="order-creator">👤 {order.utworzonePrzez?.nazwa || '?'} • {formatDate(order.utworzonePrzez?.data)}</span>
          <div className="order-actions order-buttons">
            <button onClick={e => { e.stopPropagation(); onEdit(order); }} className="btn-icon">✏️</button>
            {/* Przycisk email - obsługa wielu producentów */}
            {uniqueProducers.length > 0 && !isContractor && (
              <div className="email-btn-wrapper" style={{ position: 'relative' }}>
                {uniqueProducers.length === 1 ? (
                  // Jeden producent - bezpośredni email
                  <button 
                    onClick={e => { e.stopPropagation(); onEmailClick(order, uniqueProducers[0]); }} 
                    className="btn-icon btn-email"
                    title={`Email do: ${uniqueProducers[0]?.name}`}
                  >📧</button>
                ) : (
                  // Wielu producentów - dropdown
                  <>
                    <button 
                      onClick={e => { e.stopPropagation(); setShowProducerMenu(!showProducerMenu); }} 
                      className="btn-icon btn-email"
                      title="Wybierz producenta"
                    >📧▼</button>
                    {showProducerMenu && (
                      <div 
                        className="producer-email-dropdown"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="dropdown-header">Wybierz producenta:</div>
                        {uniqueProducers.map(prod => (
                          <button 
                            key={prod.id}
                            className="dropdown-item"
                            onClick={() => { 
                              onEmailClick(order, prod); 
                              setShowProducerMenu(false); 
                            }}
                          >
                            🏭 {prod.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {canDelete && <button onClick={handleDelete} className="btn-icon btn-delete-small">🗑️</button>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL KIEROWCY - POPRAWIONE ZDJĘCIA MOBILNE
// ============================================

const DriverPanel = ({ user, orders, producers, onUpdateOrder, onAddNotification, onLogout, onUpdateUser, settlements = [], users = [] }) => {
  const [activeTab, setActiveTab] = useState('pickup');
  const [showNotes, setShowNotes] = useState(null);
  const [showSignature, setShowSignature] = useState(null);
  const [showDiscount, setShowDiscount] = useState(null);
  const [notes, setNotes] = useState('');
  const [estPickup, setEstPickup] = useState('');
  const [estDelivery, setEstDelivery] = useState('');
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Nowe state dla rabatu i uwag klienta
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [clientRemarks, setClientRemarks] = useState('');
  const [showPhotoManager, setShowPhotoManager] = useState(null);
  const [protocolLanguage, setProtocolLanguage] = useState('pl'); // Język protokołu
  
  // State dla wysyłania potwierdzenia dostawy
  const [showDeliveryConfirmation, setShowDeliveryConfirmation] = useState(null);
  const [deliveryEmailLanguage, setDeliveryEmailLanguage] = useState('pl');
  
  // State dla modala zmiany statusu (odebrane, w_transporcie)
  const [showStatusChangeEmail, setShowStatusChangeEmail] = useState(null); // { order, oldStatus, newStatus }
  
  // Filtrowanie po statusie w zakładce "Do odbioru"
  const [pickupStatusFilter, setPickupStatusFilter] = useState('all'); // all, potwierdzone, w_produkcji, gotowe_do_odbioru

  // State dla planowanych wyjazdów - rozbudowane
  const [showTripsModal, setShowTripsModal] = useState(false);
  const [newPickupDateFrom, setNewPickupDateFrom] = useState(''); // Odbiory od
  const [newPickupDateTo, setNewPickupDateTo] = useState(''); // Odbiory do
  const [newTripDate, setNewTripDate] = useState(''); // Data wyjazdu
  const [newTripDestination, setNewTripDestination] = useState('');
  const [newTripNote, setNewTripNote] = useState('');
  const [editingTrip, setEditingTrip] = useState(null); // Do edycji wyjazdu

  // State dla cennika transportu kierowcy
  const [showTransportRatesModal, setShowTransportRatesModal] = useState(false);
  const [newRate, setNewRate] = useState({ name: '', priceNetto: '', priceBrutto: '', currency: 'EUR', country: 'DE', type: 'netto' });
  const [editingRate, setEditingRate] = useState(null);

  // Filtr po producentach
  const [producerFilterDriver, setProducerFilterDriver] = useState('all');

  // State dla rozliczeń kierowcy (tylko podgląd)
  const [showSettlementsModal, setShowSettlementsModal] = useState(false);
  
  // Menu rozwijane kierowcy
  const [showDriverMenu, setShowDriverMenu] = useState(false);

  // Planowane wyjazdy z profilu użytkownika
  const plannedTrips = user.plannedTrips || [];
  
  // Cennik transportu kierowcy
  const transportRates = user.transportRates || [];

  // Funkcja usunięcia rabatu przez kierowcę
  const handleDeleteDriverDiscount = async (order, productIndex) => {
    try {
      let updatedProdukty = order.produkty ? [...order.produkty] : [];
      
      if (productIndex !== undefined && productIndex !== null) {
        updatedProdukty = updatedProdukty.map((p, idx) => {
          if (idx === productIndex) {
            return {
              ...p,
              rabat: null
            };
          }
          return p;
        });
      }
      
      // Przelicz kwotę do zapłaty
      let sumaRabatow = 0;
      updatedProdukty.forEach(p => {
        if (p.rabat?.kwota > 0) sumaRabatow += p.rabat.kwota;
      });
      
      const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
      const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
      const originalDoZaplaty = cenaCalkowita - zaplacono;
      const newDoZaplaty = Math.max(0, originalDoZaplaty - sumaRabatow);
      
      // Usuń też z rabatyKierowcow
      let updatedRabatyKierowcow = order.rabatyKierowcow ? { ...order.rabatyKierowcow } : {};
      if (updatedRabatyKierowcow[user.id]) {
        updatedRabatyKierowcow[user.id] = null;
      }
      
      await onUpdateOrder(order.id, {
        produkty: updatedProdukty,
        rabatyKierowcow: updatedRabatyKierowcow,
        rabatPrzyDostawie: order.rabatPrzyDostawie?.kierowcaId === user.id ? null : order.rabatPrzyDostawie,
        platnosci: {
          ...order.platnosci,
          doZaplaty: newDoZaplaty,
          originalDoZaplaty: originalDoZaplaty,
          sumaRabatow: sumaRabatow,
          rabat: 0
        },
        historia: [...(order.historia || []), {
          data: new Date().toISOString(),
          uzytkownik: user.name,
          akcja: 'Kierowca usunął rabat'
        }]
      });
      
      alert('Rabat został usunięty!');
    } catch (error) {
      console.error('Błąd usuwania rabatu:', error);
      alert('Wystąpił błąd podczas usuwania rabatu');
    }
  };

  // Dodaj/Edytuj wyjazd
  const addTrip = async () => {
    if (!newTripDate) {
      alert('Podaj datę wyjazdu!');
      return;
    }
    if (!newPickupDateFrom) {
      alert('Podaj datę rozpoczęcia odbiorów!');
      return;
    }
    
    if (editingTrip) {
      // Edycja istniejącego
      const updatedTrips = plannedTrips.map(t => 
        t.id === editingTrip.id ? {
          ...t,
          pickupFrom: newPickupDateFrom,
          pickupTo: newPickupDateTo || newPickupDateFrom,
          departureDate: newTripDate,
          destination: newTripDestination || 'Nieokreślony',
          note: newTripNote
        } : t
      ).sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate));
      await onUpdateUser(user.id, { plannedTrips: updatedTrips });
      setEditingTrip(null);
    } else {
      // Nowy wyjazd
      const newTripObj = {
        id: Date.now().toString(),
        pickupFrom: newPickupDateFrom,
        pickupTo: newPickupDateTo || newPickupDateFrom,
        departureDate: newTripDate,
        destination: newTripDestination || 'Nieokreślony',
        note: newTripNote,
        createdAt: new Date().toISOString()
      };
      const updatedTrips = [...plannedTrips, newTripObj].sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate));
      await onUpdateUser(user.id, { plannedTrips: updatedTrips });
    }
    
    setNewPickupDateFrom('');
    setNewPickupDateTo('');
    setNewTripDate('');
    setNewTripDestination('');
    setNewTripNote('');
  };

  // Rozpocznij edycję wyjazdu
  const startEditTrip = (trip) => {
    setEditingTrip(trip);
    setNewPickupDateFrom(trip.pickupFrom || trip.date || '');
    setNewPickupDateTo(trip.pickupTo || '');
    setNewTripDate(trip.departureDate || trip.date || '');
    setNewTripDestination(trip.destination || '');
    setNewTripNote(trip.note || '');
  };

  // Anuluj edycję
  const cancelEditTrip = () => {
    setEditingTrip(null);
    setNewPickupDateFrom('');
    setNewPickupDateTo('');
    setNewTripDate('');
    setNewTripDestination('');
    setNewTripNote('');
  };

  // Usuń wyjazd
  const removeTrip = async (tripId) => {
    if (!window.confirm('Czy na pewno usunąć ten wyjazd?')) return;
    const updatedTrips = plannedTrips.filter(t => t.id !== tripId);
    await onUpdateUser(user.id, { plannedTrips: updatedTrips });
  };

  // Dodaj/Edytuj stawkę transportu
  const saveTransportRate = async () => {
    if (!newRate.name || (!newRate.priceNetto && !newRate.priceBrutto)) {
      alert('Podaj nazwę i cenę!');
      return;
    }
    
    // Oblicz drugą cenę jeśli podano tylko jedną
    let priceNetto = parseFloat(newRate.priceNetto) || 0;
    let priceBrutto = parseFloat(newRate.priceBrutto) || 0;
    
    if (newRate.type === 'netto' && priceNetto > 0) {
      priceBrutto = Math.round(priceNetto * 1.23 * 100) / 100;
    } else if (newRate.type === 'brutto' && priceBrutto > 0) {
      priceNetto = Math.round(priceBrutto / 1.23 * 100) / 100;
    }
    
    const rateData = {
      id: editingRate?.id || Date.now().toString(),
      name: newRate.name,
      priceNetto,
      priceBrutto,
      currency: newRate.currency,
      country: newRate.country
    };
    
    let updatedRates;
    if (editingRate) {
      updatedRates = transportRates.map(r => r.id === editingRate.id ? rateData : r);
    } else {
      updatedRates = [...transportRates, rateData];
    }
    
    await onUpdateUser(user.id, { transportRates: updatedRates });
    setNewRate({ name: '', priceNetto: '', priceBrutto: '', currency: 'EUR', country: 'DE', type: 'netto' });
    setEditingRate(null);
  };

  // Usuń stawkę
  const removeTransportRate = async (rateId) => {
    if (!window.confirm('Usunąć tę stawkę?')) return;
    const updatedRates = transportRates.filter(r => r.id !== rateId);
    await onUpdateUser(user.id, { transportRates: updatedRates });
  };

  // Najbliższy wyjazd (sprawdzamy datę wyjazdu)
  const today = new Date();
  today.setHours(0,0,0,0);
  const nextTrip = plannedTrips.find(t => {
    const depDate = new Date(t.departureDate || t.date);
    return depDate >= today;
  });

  // NOWA LOGIKA: Kierowca widzi zamówienia/produkty przypisane do niego
  // Zamówienie może mieć produkty przypisane do różnych kierowców
  const getMyOrdersAndProducts = () => {
    const result = [];
    
    orders.forEach(o => {
      // Czy to zamówienie łączone z produktami?
      if (o.produkty && o.produkty.length > 0) {
        // Sprawdź czy którykolwiek produkt jest przypisany do tego kierowcy
        const myProducts = o.produkty.filter(p => p.kierowca === user.id);
        
        // Lub jeśli zamówienie główne jest przypisane i produkty nie mają osobnych kierowców
        const hasMainAssignment = o.przypisanyKierowca === user.id;
        const productsWithoutDriver = o.produkty.filter(p => !p.kierowca);
        
        if (myProducts.length > 0 || (hasMainAssignment && productsWithoutDriver.length > 0)) {
          // Dodaj zamówienie z flagą które produkty są "moje"
          result.push({
            ...o,
            _myProductIndexes: o.produkty.map((p, idx) => {
              if (p.kierowca === user.id) return idx;
              if (!p.kierowca && hasMainAssignment) return idx;
              return -1;
            }).filter(idx => idx !== -1),
            _isPartial: myProducts.length < o.produkty.length || (hasMainAssignment && myProducts.length === 0 && productsWithoutDriver.length < o.produkty.length)
          });
        }
      } else {
        // Stare zamówienie bez tablicy produktów - sprawdź główne przypisanie
        if (o.przypisanyKierowca === user.id) {
          result.push({ ...o, _myProductIndexes: [0], _isPartial: false });
        }
      }
    });
    
    return result;
  };

  const myOrders = getMyOrdersAndProducts();
  
  // Funkcja sprawdzająca status dla kierowcy - bierze pod uwagę status produktów
  const getEffectiveStatus = (order) => {
    if (order.produkty && order.produkty.length > 0 && order._myProductIndexes) {
      // Dla zamówień łączonych - weź najniższy status z "moich" produktów
      const myProductStatuses = order._myProductIndexes.map(idx => order.produkty[idx]?.status || 'nowe');
      // Priorytet statusów (od najwcześniejszego do najpóźniejszego)
      const statusPriority = ['nowe', 'potwierdzone', 'w_produkcji', 'gotowe_do_odbioru', 'odebrane', 'w_transporcie', 'dostarczone'];
      return myProductStatuses.reduce((min, s) => {
        return statusPriority.indexOf(s) < statusPriority.indexOf(min) ? s : min;
      }, 'dostarczone');
    }
    return order.status;
  };

  const toPickup = myOrders.filter(o => {
    const effectiveStatus = getEffectiveStatus(o);
    return ['nowe', 'potwierdzone', 'w_produkcji', 'gotowe_do_odbioru'].includes(effectiveStatus);
  });
  const pickedUp = myOrders.filter(o => getEffectiveStatus(o) === 'odebrane');
  const inTransit = myOrders.filter(o => getEffectiveStatus(o) === 'w_transporcie');
  const delivered = myOrders.filter(o => getEffectiveStatus(o) === 'dostarczone');
  
  // Lista unikalnych producentów w zamówieniach kierowcy (do odbioru)
  const uniqueProducersInPickup = [...new Set(toPickup.map(o => o.zaladunek).filter(Boolean))];
  
  // Filtrowane zamówienia do odbioru (status + producent)
  let filteredToPickup = pickupStatusFilter === 'all' 
    ? toPickup 
    : toPickup.filter(o => getEffectiveStatus(o) === pickupStatusFilter);
  
  // Dodatkowy filtr po producencie
  if (producerFilterDriver !== 'all') {
    filteredToPickup = filteredToPickup.filter(o => o.zaladunek === producerFilterDriver);
  }

  // Liczba zamówień per producent
  const ordersPerProducer = uniqueProducersInPickup.reduce((acc, prodId) => {
    acc[prodId] = toPickup.filter(o => o.zaladunek === prodId).length;
    return acc;
  }, {});

  const tabs = [
    { id: 'pickup', label: 'Do odbioru', count: toPickup.length, icon: '📦' },
    { id: 'picked', label: 'Odebrane', count: pickedUp.length, icon: '🚚' },
    { id: 'transit', label: 'W transporcie', count: inTransit.length, icon: '🚗' },
    { id: 'delivered', label: 'Dostarczone', count: delivered.length, icon: '✔️' },
  ];

  const getTabOrders = () => {
    switch (activeTab) {
      case 'pickup': return filteredToPickup;
      case 'picked': return pickedUp;
      case 'transit': return inTransit;
      case 'delivered': return delivered;
      default: return [];
    }
  };

  // Zmiana statusu - obsługuje zarówno całe zamówienie jak i pojedyncze produkty
  const changeStatus = async (order, newStatus, productIndex = null) => {
    const statusName = getStatus(newStatus).name;
    
    // Jeśli to zamówienie łączone i mamy _myProductIndexes
    if (order.produkty && order.produkty.length > 0 && order._myProductIndexes) {
      const updatedProdukty = [...order.produkty];
      
      if (productIndex !== null) {
        // Zmiana statusu konkretnego produktu
        updatedProdukty[productIndex] = { ...updatedProdukty[productIndex], status: newStatus };
      } else {
        // Zmiana statusu wszystkich "moich" produktów
        order._myProductIndexes.forEach(idx => {
          if (idx >= 0 && idx < updatedProdukty.length) {
            updatedProdukty[idx] = { ...updatedProdukty[idx], status: newStatus };
          }
        });
      }
      
      // Sprawdź czy wszystkie produkty mają ten sam status - jeśli tak, zaktualizuj też główny
      const allSameStatus = updatedProdukty.every(p => p.status === newStatus);
      
      await onUpdateOrder(order.id, {
        ...order,
        produkty: updatedProdukty,
        status: allSameStatus ? newStatus : order.status,
        historia: [...(order.historia || []), { 
          data: new Date().toISOString(), 
          uzytkownik: user.name, 
          akcja: productIndex !== null 
            ? `Produkt ${updatedProdukty[productIndex]?.nrPodzamowienia || productIndex + 1}: ${statusName}`
            : `Status: ${statusName}` 
        }]
      });
    } else {
      // Stare zamówienie bez produktów
      await onUpdateOrder(order.id, {
        ...order,
        status: newStatus,
        historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: `Status: ${statusName}` }]
      });
    }
    
    onAddNotification({ icon: '🔄', title: `Status: ${order.nrWlasny}`, message: `Kierowca ${user.name} zmienił status na: ${statusName}`, orderId: order.id });
    
    // Dla statusów "odebrane" i "w_transporcie" - zapytaj o email
    if ((newStatus === 'odebrane' || newStatus === 'w_transporcie') && order.klient?.email) {
      setShowStatusChangeEmail({
        order,
        oldStatus: getStatus(order.status)?.name || order.status,
        newStatus: statusName,
        newStatusCode: newStatus
      });
    }
  };

  // Funkcja wysyłania emaila o zmianie statusu przez kierowcę
  const sendDriverStatusEmail = () => {
    const { order, oldStatus, newStatus, newStatusCode } = showStatusChangeEmail;
    
    // Tłumaczenia dla zmiany statusu
    const STATUS_EMAIL_TRANSLATIONS = {
      pl: {
        subject: 'Zmiana statusu zamówienia nr',
        greeting: 'Szanowny/a',
        intro: 'Informujemy o zmianie statusu Twojego zamówienia.',
        title: 'ZMIANA STATUSU ZAMÓWIENIA',
        orderNumber: 'Numer zamówienia',
        statusChanged: 'Status zmieniony',
        previous: 'Poprzedni',
        current: 'Aktualny',
        pickedUpInfo: 'Twoje zamówienie zostało odebrane od producenta i przygotowywane jest do transportu.',
        inTransitInfo: 'Twoje zamówienie jest w drodze! Wkrótce skontaktuje się z Tobą nasz kierowca.',
        questions: 'W razie pytań prosimy o kontakt.',
        regards: 'Pozdrawiamy',
        team: 'Zespół obsługi zamówień',
        noReply: 'Ta wiadomość została wysłana automatycznie. Prosimy nie odpowiadać na ten email.'
      },
      en: {
        subject: 'Order status change no.',
        greeting: 'Dear',
        intro: 'We inform you about the status change of your order.',
        title: 'ORDER STATUS CHANGE',
        orderNumber: 'Order number',
        statusChanged: 'Status changed',
        previous: 'Previous',
        current: 'Current',
        pickedUpInfo: 'Your order has been picked up from the manufacturer and is being prepared for transport.',
        inTransitInfo: 'Your order is on its way! Our driver will contact you soon.',
        questions: 'If you have any questions, please contact us.',
        regards: 'Best regards',
        team: 'Order Service Team',
        noReply: 'This message was sent automatically. Please do not reply to this email.'
      },
      de: {
        subject: 'Statusänderung der Bestellung Nr.',
        greeting: 'Sehr geehrte/r',
        intro: 'Wir informieren Sie über die Statusänderung Ihrer Bestellung.',
        title: 'BESTELLSTATUSÄNDERUNG',
        orderNumber: 'Bestellnummer',
        statusChanged: 'Status geändert',
        previous: 'Vorheriger',
        current: 'Aktueller',
        pickedUpInfo: 'Ihre Bestellung wurde beim Hersteller abgeholt und wird für den Transport vorbereitet.',
        inTransitInfo: 'Ihre Bestellung ist unterwegs! Unser Fahrer wird Sie bald kontaktieren.',
        questions: 'Bei Fragen kontaktieren Sie uns bitte.',
        regards: 'Mit freundlichen Grüßen',
        team: 'Bestellservice-Team',
        noReply: 'Diese Nachricht wurde automatisch gesendet. Bitte antworten Sie nicht auf diese E-Mail.'
      },
      es: {
        subject: 'Cambio de estado del pedido nº',
        greeting: 'Estimado/a',
        intro: 'Le informamos sobre el cambio de estado de su pedido.',
        title: 'CAMBIO DE ESTADO DEL PEDIDO',
        orderNumber: 'Número de pedido',
        statusChanged: 'Estado cambiado',
        previous: 'Anterior',
        current: 'Actual',
        pickedUpInfo: 'Su pedido ha sido recogido del fabricante y se está preparando para el transporte.',
        inTransitInfo: '¡Su pedido está en camino! Nuestro conductor se pondrá en contacto con usted pronto.',
        questions: 'Si tiene alguna pregunta, por favor contáctenos.',
        regards: 'Saludos cordiales',
        team: 'Equipo de servicio de pedidos',
        noReply: 'Este mensaje fue enviado automáticamente. Por favor no responda a este correo.'
      },
      nl: {
        subject: 'Statuswijziging bestelling nr.',
        greeting: 'Geachte',
        intro: 'Wij informeren u over de statuswijziging van uw bestelling.',
        title: 'BESTELSTATUSWIJZIGING',
        orderNumber: 'Bestelnummer',
        statusChanged: 'Status gewijzigd',
        previous: 'Vorige',
        current: 'Huidige',
        pickedUpInfo: 'Uw bestelling is opgehaald bij de fabrikant en wordt voorbereid voor transport.',
        inTransitInfo: 'Uw bestelling is onderweg! Onze chauffeur neemt binnenkort contact met u op.',
        questions: 'Als u vragen heeft, neem dan contact met ons op.',
        regards: 'Met vriendelijke groet',
        team: 'Bestelservice Team',
        noReply: 'Dit bericht is automatisch verzonden. Gelieve niet te antwoorden op deze e-mail.'
      }
    };
    
    const st = STATUS_EMAIL_TRANSLATIONS[deliveryEmailLanguage] || STATUS_EMAIL_TRANSLATIONS.pl;
    
    const subject = `${st.subject} ${order.nrWlasny}`;
    
    let additionalInfo = '';
    if (newStatusCode === 'odebrane') {
      additionalInfo = `\n\n📦 ${st.pickedUpInfo}`;
    } else if (newStatusCode === 'w_transporcie') {
      additionalInfo = `\n\n🚚 ${st.inTransitInfo}`;
    }
    
    const body = `${st.greeting} ${order.klient?.imie || 'Kliencie'},

${st.intro}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ${st.title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔢 ${st.orderNumber}: ${order.nrWlasny}

📊 ${st.statusChanged}:
   ❌ ${st.previous}: ${oldStatus}
   ✅ ${st.current}: ${newStatus}
${additionalInfo}

${st.questions}

${st.regards},
${st.team}

---
📧 ${st.noReply}`;

    // Wyślij przez MailerSend
    sendEmailViaMailerSend(
      order.klient.email,
      order.klient.imie,
      subject,
      body
    ).then(result => {
      if (result.success) {
        alert('✅ Email o zmianie statusu został wysłany!');
      } else {
        alert('❌ Błąd wysyłania emaila. Spróbuj ponownie.');
      }
    });
    
    setShowStatusChangeEmail(null);
  };

  // Zapisz rabat - per kierowca dla zamówień łączonych
  const saveDiscount = async () => {
    // showDiscount to teraz obiekt order z _myProductIndexes
    const orderWithIndexes = showDiscount;
    if (!orderWithIndexes) return;
    
    const order = orders.find(o => o.id === orderWithIndexes.id);
    if (!order) return;
    
    let myProductIndexes = orderWithIndexes._myProductIndexes || [];
    
    // Jeśli nie mamy _myProductIndexes, spróbuj znaleźć produkty tego kierowcy
    if (myProductIndexes.length === 0 && order.produkty && order.produkty.length > 0) {
      myProductIndexes = order.produkty
        .map((p, idx) => (p.kierowca === user.id || (!p.kierowca && order.przypisanyKierowca === user.id)) ? idx : -1)
        .filter(idx => idx !== -1);
    }
    
    const amount = parseFloat(discountAmount) || 0;
    if (amount <= 0) {
      alert('Podaj kwotę rabatu');
      return;
    }

    const mojePodzamowienia = myProductIndexes.length > 0 && order.produkty
      ? myProductIndexes.map(idx => order.produkty[idx]?.nrPodzamowienia || `#${idx+1}`).join(', ')
      : null;

    const rabat = {
      kwota: amount,
      powod: discountReason || 'Brak podanego powodu',
      data: new Date().toISOString(),
      kierowca: user.name,
      kierowcaId: user.id,
      podzamowienia: mojePodzamowienia
    };

    // Sprawdź czy to zamówienie łączone
    if (order.produkty && order.produkty.length > 0 && myProductIndexes.length > 0) {
      // Zapisz rabat tylko do PIERWSZEGO produktu kierowcy (nie do wszystkich!)
      const firstProductIndex = myProductIndexes[0];
      
      const updatedProdukty = order.produkty.map((prod, idx) => {
        if (idx === firstProductIndex) {
          // Zapisz rabat tylko do pierwszego produktu
          return {
            ...prod,
            rabat: rabat
          };
        } else if (myProductIndexes.includes(idx)) {
          // Usuń rabat z pozostałych produktów tego kierowcy (jeśli był)
          const { rabat: oldRabat, ...rest } = prod;
          return rest;
        }
        return prod;
      });

      // Zapisz też w zbiorze rabatów per kierowca - wyczyść stare null i dodaj nowy
      const rabatyKierowcow = {};
      // Przepisz istniejące rabaty (tylko te które nie są null)
      if (order.rabatyKierowcow) {
        Object.entries(order.rabatyKierowcow).forEach(([odDriver, r]) => {
          if (r && r.kwota > 0) {
            rabatyKierowcow[odDriver] = r;
          }
        });
      }
      // Dodaj nowy rabat tego kierowcy
      rabatyKierowcow[user.id] = rabat;

      // Oblicz sumę wszystkich rabatów - każdy kierowca ma tylko jeden rabat
      let sumaRabatow = 0;
      Object.values(rabatyKierowcow).forEach(r => {
        if (r && r.kwota > 0) sumaRabatow += r.kwota;
      });
      
      // Przelicz kwotę do zapłaty
      const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
      const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
      const originalDoZaplaty = cenaCalkowita - zaplacono;
      const newDoZaplaty = Math.max(0, originalDoZaplaty - sumaRabatow);

      await onUpdateOrder(order.id, {
        produkty: updatedProdukty,
        rabatyKierowcow: rabatyKierowcow,
        platnosci: {
          ...order.platnosci,
          doZaplaty: newDoZaplaty,
          originalDoZaplaty: originalDoZaplaty,
          sumaRabatow: sumaRabatow
        },
        historia: [...(order.historia || []), { 
          data: new Date().toISOString(), 
          uzytkownik: user.name, 
          akcja: `Rabat dla ${mojePodzamowienia || 'zamówienia'}: ${formatCurrency(amount, order.platnosci?.waluta)} - ${discountReason || 'brak powodu'}` 
        }]
      });
    } else {
      // Stare zamówienie - zapisz globalnie
      const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
      const zaliczka = order.platnosci?.zaliczka || 0;
      const zaplacono = order.platnosci?.zaplacono || zaliczka;
      const originalDoZaplaty = cenaCalkowita - zaplacono;
      const newDoZaplaty = Math.max(0, originalDoZaplaty - amount);

      await onUpdateOrder(order.id, {
        rabatPrzyDostawie: rabat,
        platnosci: {
          ...order.platnosci,
          doZaplaty: newDoZaplaty,
          originalDoZaplaty: originalDoZaplaty,
          rabat: amount
        },
        historia: [...(order.historia || []), { 
          data: new Date().toISOString(), 
          uzytkownik: user.name, 
          akcja: `Rabat przy dostawie: ${formatCurrency(amount, order.platnosci?.waluta)} - ${discountReason || 'brak powodu'}` 
        }]
      });
    }

    onAddNotification({ 
      icon: '💸', 
      title: `Rabat: ${order.nrWlasny}`, 
      message: `Kierowca ${user.name} udzielił rabatu ${formatCurrency(amount, order.platnosci?.waluta)} - ${discountReason}`, 
      orderId: order.id 
    });

    setShowDiscount(null);
    setDiscountAmount('');
    setDiscountReason('');
  };

  // Usuń zdjęcie
  const deletePhoto = async (orderId, type, photoIndex) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const field = type === 'pickup' ? 'zdjeciaOdbioru' : 'zdjeciaDostawy';
    const photos = [...(order[field] || [])];
    photos.splice(photoIndex, 1);

    await onUpdateOrder(orderId, {
      ...order,
      [field]: photos,
      historia: [...(order.historia || []), { 
        data: new Date().toISOString(), 
        uzytkownik: user.name, 
        akcja: `Usunięto zdjęcie ${type === 'pickup' ? 'odbioru' : 'dostawy'}` 
      }]
    });
  };

  // POPRAWIONE - kompresja zdjęcia i lepsza obsługa iOS/Android
  const handlePhotoCapture = async (order, type, e) => {
    const file = e.target.files?.[0];
    
    // WAŻNE: Resetuj input żeby można było wybrać to samo zdjęcie ponownie
    e.target.value = '';
    
    if (!file) {
      console.log('Brak pliku');
      return;
    }

    console.log('Przetwarzanie pliku:', file.name, file.type, file.size);

    const orderId = order.id;
    const field = type === 'pickup' ? 'zdjeciaOdbioru' : 'zdjeciaDostawy';

    try {
      // Kompresja zdjęcia dla lepszej wydajności
      const compressImage = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          
          reader.onerror = () => {
            console.error('Błąd odczytu pliku');
            reject(new Error('Błąd odczytu pliku'));
          };
          
          reader.onload = (event) => {
            const img = new Image();
            
            img.onerror = () => {
              console.error('Błąd ładowania obrazu');
              // Jeśli nie można załadować jako obraz, użyj oryginalnego pliku
              resolve(event.target.result);
            };
            
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 1200;
                let width = img.width;
                let height = img.height;

                if (width > height && width > MAX_SIZE) {
                  height = (height * MAX_SIZE) / width;
                  width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                  width = (width * MAX_SIZE) / height;
                  height = MAX_SIZE;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const result = canvas.toDataURL('image/jpeg', 0.7);
                console.log('Kompresja zakończona, rozmiar:', Math.round(result.length / 1024), 'KB');
                resolve(result);
              } catch (canvasError) {
                console.error('Błąd canvas:', canvasError);
                resolve(event.target.result);
              }
            };
            
            img.src = event.target.result;
          };
          
          reader.readAsDataURL(file);
        });
      };

      const compressedUrl = await compressImage(file);
      const photo = { url: compressedUrl, timestamp: new Date().toISOString(), by: user.name };

      // Pobierz aktualny stan zamówienia z bazy
      const currentOrder = orders.find(o => o.id === orderId);
      if (!currentOrder) {
        console.error('Nie znaleziono zamówienia');
        return;
      }

      // Użyj _myProductIndexes z przekazanego order (zawiera informację które produkty są moje)
      let myProductIndexes = order._myProductIndexes || [];
      
      // Jeśli nie mamy _myProductIndexes, spróbuj znaleźć produkty tego kierowcy
      if (myProductIndexes.length === 0 && currentOrder.produkty && currentOrder.produkty.length > 0) {
        myProductIndexes = currentOrder.produkty
          .map((p, idx) => (p.kierowca === user.id || (!p.kierowca && currentOrder.przypisanyKierowca === user.id)) ? idx : -1)
          .filter(idx => idx !== -1);
      }

      // Sprawdź czy to zamówienie łączone i znajdź produkty tego kierowcy
      if (currentOrder.produkty && currentOrder.produkty.length > 0 && myProductIndexes.length > 0) {
        // Aktualizuj tylko MOJE produkty (używając zapisanych indeksów)
        const updatedProdukty = currentOrder.produkty.map((prod, idx) => {
          if (myProductIndexes.includes(idx)) {
            // Ten produkt należy do tego kierowcy - dodaj zdjęcie do protokołu
            const protokol = prod.protokol || {};
            const photos = protokol[field] || [];
            return {
              ...prod,
              protokol: {
                ...protokol,
                [field]: [...photos, photo]
              }
            };
          }
          return prod;
        });

        await onUpdateOrder(orderId, {
          produkty: updatedProdukty,
          historia: [...(currentOrder.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: `Dodano zdjęcie ${type === 'pickup' ? 'odbioru' : 'dostawy'} (produkt ${myProductIndexes.map(i => currentOrder.produkty[i]?.nrPodzamowienia || `#${i+1}`).join(', ')})` }]
        });
      } else {
        // Stare zamówienie bez produktów - zapisz globalnie
        const updatedPhotos = [...(currentOrder[field] || []), photo];

        await onUpdateOrder(orderId, {
          [field]: updatedPhotos,
          historia: [...(currentOrder.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: `Dodano zdjęcie ${type === 'pickup' ? 'odbioru' : 'dostawy'}` }]
        });
      }

      console.log('Zdjęcie zapisane pomyślnie');
      onAddNotification({ icon: '📷', title: `Zdjęcie: ${currentOrder.nrWlasny}`, message: `Kierowca ${user.name} dodał zdjęcie ${type === 'pickup' ? 'odbioru' : 'dostawy'}`, orderId: orderId });
    } catch (error) {
      console.error('Błąd dodawania zdjęcia:', error);
      alert('Błąd podczas dodawania zdjęcia. Spróbuj ponownie.');
    }

    e.target.value = '';
  };

  const openNotes = (orderWithIndexes) => {
    // orderWithIndexes może zawierać _myProductIndexes
    const order = orders.find(o => o.id === orderWithIndexes.id) || orderWithIndexes;
    const myProductIndexes = orderWithIndexes._myProductIndexes || [];
    
    setShowNotes({ ...order, _myProductIndexes: myProductIndexes });
    
    // Pobierz dane z produktów kierowcy lub z głównego zamówienia
    if (myProductIndexes.length > 0 && order.produkty) {
      const myProduct = order.produkty[myProductIndexes[0]];
      setNotes(myProduct?.uwagiKierowcy || order.uwagiKierowcow?.[user.id] || '');
      setEstPickup(myProduct?.szacowanyOdbior || '');
      setEstDelivery(myProduct?.szacowanaDostwa || '');
    } else {
      setNotes(order.uwagiKierowcy || '');
      setEstPickup(order.szacowanyOdbior || '');
      setEstDelivery(order.szacowanaDostwa || '');
    }
  };

  const saveNotes = async () => {
    if (!showNotes) return;
    const orderWithIndexes = showNotes;
    const order = orders.find(o => o.id === orderWithIndexes.id);
    if (!order) return;
    
    const myProductIndexes = orderWithIndexes._myProductIndexes || [];
    const hist = [...(order.historia || [])];
    
    // Jeśli kierowca ma przypisane produkty - zapisz dla nich
    if (myProductIndexes.length > 0 && order.produkty) {
      const mojePodzamowienia = myProductIndexes
        .map(idx => order.produkty[idx]?.nrPodzamowienia || `#${idx+1}`)
        .join(', ');
      
      const updatedProdukty = order.produkty.map((prod, idx) => {
        if (myProductIndexes.includes(idx)) {
          return {
            ...prod,
            uwagiKierowcy: notes,
            szacowanyOdbior: estPickup,
            szacowanaDostwa: estDelivery,
            kierowcaNazwa: user.name,
            kierowcaTelefon: user.phone || ''
          };
        }
        return prod;
      });
      
      if (notes) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Uwagi (${mojePodzamowienia}): ${notes}` });
      if (estPickup) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Szacowany odbiór (${mojePodzamowienia}): ${formatDate(estPickup)}` });
      if (estDelivery) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Szacowana dostawa (${mojePodzamowienia}): ${formatDate(estDelivery)}` });
      
      await onUpdateOrder(order.id, { 
        produkty: updatedProdukty,
        // Zapisz też w głównym dla kompatybilności (jeśli jeden kierowca)
        uwagiKierowcow: {
          ...(order.uwagiKierowcow || {}),
          [user.id]: notes
        },
        szacowaneDostawyKierowcow: {
          ...(order.szacowaneDostawyKierowcow || {}),
          [user.id]: { szacowanyOdbior: estPickup, szacowanaDostwa: estDelivery }
        },
        historia: hist 
      });
      
      if (notes) {
        onAddNotification({ icon: '📝', title: `Uwagi: ${order.nrWlasny}`, message: `Kierowca ${user.name} (${mojePodzamowienia}): ${notes}`, orderId: order.id });
      }
    } else {
      // Stare zamówienie bez produktów
      if (notes !== order.uwagiKierowcy) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Uwagi: ${notes}` });
      if (estPickup !== order.szacowanyOdbior) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Szacowany odbiór: ${formatDate(estPickup)}` });
      if (estDelivery !== order.szacowanaDostwa) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Szacowana dostawa: ${formatDate(estDelivery)}` });

      await onUpdateOrder(order.id, { ...order, uwagiKierowcy: notes, szacowanyOdbior: estPickup, szacowanaDostwa: estDelivery, historia: hist });

      if (notes && notes !== order.uwagiKierowcy) {
        onAddNotification({ icon: '📝', title: `Uwagi: ${order.nrWlasny}`, message: `Kierowca ${user.name}: ${notes}`, orderId: order.id });
      }
    }
    setShowNotes(null);
  };

  const startDraw = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
  };

  const saveSignature = async () => {
    // showSignature teraz zawiera całe order z _myProductIndexes
    const orderWithIndexes = showSignature;
    if (!orderWithIndexes) return;
    
    // Pobierz aktualny stan z bazy
    const order = orders.find(o => o.id === orderWithIndexes.id);
    if (!order) return;
    
    let myProductIndexes = orderWithIndexes._myProductIndexes || [];
    
    // Jeśli nie mamy _myProductIndexes, spróbuj znaleźć produkty tego kierowcy
    if (myProductIndexes.length === 0 && order.produkty && order.produkty.length > 0) {
      myProductIndexes = order.produkty
        .map((p, idx) => (p.kierowca === user.id || (!p.kierowca && order.przypisanyKierowca === user.id)) ? idx : -1)
        .filter(idx => idx !== -1);
    }
    
    const dataUrl = canvasRef.current.toDataURL();
    const now = new Date();
    
    const podpisData = { url: dataUrl, timestamp: now.toISOString(), by: user.name };
    
    // Dane protokołu odbioru
    const protokolOdbioruData = {
      dataDostawy: now.toISOString(),
      godzinaDostawy: now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
      kierowca: user.name,
      kierowcaId: user.id,
      podpis: podpisData,
      uwagiKlienta: clientRemarks || '',
      jezyk: protocolLanguage,
      klient: {
        imie: order.klient?.imie || '',
        adres: order.klient?.adres || '',
        telefon: order.klient?.telefon || '',
        email: order.klient?.email || ''
      },
      nrZamowienia: order.nrWlasny || ''
    };
    
    // Sprawdź czy to zamówienie łączone
    if (order.produkty && order.produkty.length > 0 && myProductIndexes.length > 0) {
      // Aktualizuj tylko MOJE produkty (używając zapisanych indeksów)
      const updatedProdukty = order.produkty.map((prod, idx) => {
        if (myProductIndexes.includes(idx)) {
          // Ten produkt należy do tego kierowcy
          const protokol = prod.protokol || {};
          return {
            ...prod,
            protokol: {
              ...protokol,
              podpis: podpisData,
              uwagiKlienta: clientRemarks || '',
              dataDostawy: now.toISOString(),
              godzinaDostawy: now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
              kierowca: user.name,
              jezyk: protocolLanguage
            }
          };
        }
        return prod;
      });

      // Tworzenie umowy odbioru dla produktów tego kierowcy
      const mojeProduktOpisy = myProductIndexes
        .map(idx => order.produkty[idx]?.towar)
        .filter(Boolean)
        .join('; ');
      
      const mojePodzamowienia = myProductIndexes
        .map(idx => order.produkty[idx]?.nrPodzamowienia || `#${idx+1}`)
        .join(', ');
      
      const umowaOdbioru = {
        dataDostawy: now.toISOString(),
        godzinaDostawy: now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
        klient: {
          imie: order.klient?.imie || '',
          adres: order.klient?.adres || '',
          telefon: order.klient?.telefon || '',
          email: order.klient?.email || ''
        },
        produkt: mojeProduktOpisy,
        podzamowienia: mojePodzamowienia,
        nrZamowienia: order.nrWlasny || '',
        kierowca: user.name,
        uwagiKlienta: clientRemarks || '',
        akceptacjaBezUwag: !clientRemarks || clientRemarks.trim() === '',
        podpis: podpisData,
        jezyk: protocolLanguage
      };
      
      // Protokół dla tego kierowcy
      const protokolKierowcy = {
        ...protokolOdbioruData,
        produkty: mojePodzamowienia,
        produktyOpis: mojeProduktOpisy
      };

      await onUpdateOrder(order.id, {
        produkty: updatedProdukty,
        // Zapisz też umowę dla tego kierowcy
        umowyOdbioru: {
          ...(order.umowyOdbioru || {}),
          [user.id]: umowaOdbioru
        },
        // Protokoły odbioru dla każdego kierowcy
        protokolyOdbioru: {
          ...(order.protokolyOdbioru || {}),
          [user.id]: protokolKierowcy
        },
        // Główny protokół odbioru (dla kompatybilności)
        protokolOdbioru: protokolOdbioruData,
        // Główny podpis (dla kompatybilności)
        podpisKlienta: podpisData,
        historia: [...(order.historia || []), { 
          data: now.toISOString(), 
          uzytkownik: user.name, 
          akcja: `Podpis klienta dla ${mojePodzamowienia}${clientRemarks ? ` (z uwagami: ${clientRemarks})` : ' (bez uwag)'}` 
        }]
      });
    } else {
      // Stare zamówienie bez produktów
      const umowaOdbioru = {
        dataDostawy: now.toISOString(),
        godzinaDostawy: now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
        klient: {
          imie: order.klient?.imie || '',
          adres: order.klient?.adres || '',
          telefon: order.klient?.telefon || '',
          email: order.klient?.email || ''
        },
        produkt: order.towar || '',
        nrZamowienia: order.nrWlasny || '',
        kierowca: user.name,
        uwagiKlienta: clientRemarks || '',
        akceptacjaBezUwag: !clientRemarks || clientRemarks.trim() === '',
        podpis: podpisData,
        jezyk: protocolLanguage,
        trescUmowy: `Potwierdzam odbiór zamówienia nr ${order.nrWlasny}. Produkt: ${order.towar || 'brak opisu'}. ${!clientRemarks ? 'Nie zgłaszam uwag do produktu ani do dostawy.' : `Uwagi: ${clientRemarks}`}`
      };

      await onUpdateOrder(order.id, {
        ...order,
        podpisKlienta: podpisData,
        umowaOdbioru: umowaOdbioru,
        protokolOdbioru: {
          ...protokolOdbioruData,
          produkt: order.towar || ''
        },
        historia: [...(order.historia || []), { 
          data: now.toISOString(), 
          uzytkownik: user.name, 
          akcja: `Podpis klienta${clientRemarks ? ` (z uwagami: ${clientRemarks})` : ' (bez uwag)'}` 
        }]
      });
    }
    
    onAddNotification({ 
      icon: '✍️', 
      title: `Podpis: ${order.nrWlasny}`, 
      message: `Kierowca ${user.name} zebrał podpis klienta${clientRemarks ? ' (z uwagami)' : ''}`, 
      orderId: order.id 
    });
    setShowSignature(null);
    setClientRemarks('');
  };

  // Otwórz modal podpisu
  // Otwórz modal podpisu - przekazuj całe order z _myProductIndexes
  const openSignatureModal = (order) => {
    setClientRemarks('');
    setShowSignature(order); // Przekazuj całe order zamiast tylko orderId
  };

  useEffect(() => {
    if (showSignature && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    }
  }, [showSignature]);

  const confirmDelivery = async (orderWithIndexes) => {
    // orderWithIndexes może zawierać _myProductIndexes
    const order = orders.find(o => o.id === orderWithIndexes.id) || orderWithIndexes;
    const myProductIndexes = orderWithIndexes._myProductIndexes || [];
    const now = new Date();
    
    // Jeśli kierowca ma przypisane produkty - zaktualizuj tylko jego produkty
    if (myProductIndexes.length > 0 && order.produkty && order.produkty.length > 0) {
      const mojePodzamowienia = myProductIndexes
        .map(idx => order.produkty[idx]?.nrPodzamowienia || `#${idx+1}`)
        .join(', ');
      
      // Zaktualizuj status tylko MOICH produktów
      const updatedProdukty = order.produkty.map((p, idx) => {
        if (myProductIndexes.includes(idx)) {
          return {
            ...p,
            status: 'dostarczone',
            dataDostarczenia: now.toISOString(),
            dostawaPotwierdzonaPrzez: user.name
          };
        }
        return p;
      });
      
      // Sprawdź czy WSZYSTKIE produkty są teraz dostarczone
      const allDelivered = updatedProdukty.every(p => p.status === 'dostarczone' || p.status === 'zakonczone');
      
      // Dane potwierdzenia dla tego kierowcy
      const potwierdzenieKierowcy = {
        data: now.toISOString(),
        kierowca: user.name,
        kierowcaId: user.id,
        produkty: mojePodzamowienia
      };
      
      await onUpdateOrder(order.id, {
        produkty: updatedProdukty,
        // Główny status zmień na 'dostarczone' TYLKO jeśli wszystkie produkty są dostarczone
        status: allDelivered ? 'dostarczone' : order.status,
        // Zapisz potwierdzenia dla każdego kierowcy osobno
        potwierdzeniaDostaw: {
          ...(order.potwierdzeniaDostaw || {}),
          [user.id]: potwierdzenieKierowcy
        },
        // Główne potwierdzenie tylko gdy wszystko dostarczone
        ...(allDelivered ? {
          potwierdzenieDostawy: { data: now.toISOString(), kierowca: user.name },
          dataDostarczenia: now.toISOString()
        } : {}),
        historia: [...(order.historia || []), { 
          data: now.toISOString(), 
          uzytkownik: user.name, 
          akcja: `Dostawa potwierdzona (${mojePodzamowienia})${allDelivered ? ' - zamówienie kompletne' : ''}` 
        }]
      });
      
      onAddNotification({ 
        icon: '✔️', 
        title: `Dostarczono: ${order.nrWlasny}`, 
        message: `Kierowca ${user.name} potwierdził dostawę (${mojePodzamowienia}) do ${order.klient?.imie}${allDelivered ? ' - KOMPLET' : ''}`, 
        orderId: order.id 
      });
      
      // Jeśli klient ma email - pokaż modal z pytaniem o wysłanie potwierdzenia
      if (order.klient?.email) {
        setShowDeliveryConfirmation({ ...order, produkty: updatedProdukty, _deliveredProducts: mojePodzamowienia, _allDelivered: allDelivered });
        setDeliveryEmailLanguage(protocolLanguage);
      }
    } else {
      // Stare zamówienie bez produktów - zmień cały status
      await onUpdateOrder(order.id, {
        ...order,
        status: 'dostarczone',
        potwierdzenieDostawy: { data: now.toISOString(), kierowca: user.name },
        dataDostarczenia: now.toISOString(),
        historia: [...(order.historia || []), { data: now.toISOString(), uzytkownik: user.name, akcja: 'Dostawa potwierdzona' }]
      });
      
      onAddNotification({ icon: '✔️', title: `Dostarczono: ${order.nrWlasny}`, message: `Kierowca ${user.name} potwierdził dostawę do ${order.klient?.imie}`, orderId: order.id });
      
      // Jeśli klient ma email - pokaż modal z pytaniem o wysłanie potwierdzenia
      if (order.klient?.email) {
        setShowDeliveryConfirmation(order);
        setDeliveryEmailLanguage(protocolLanguage);
      }
    }
  };

  // Tłumaczenia emaila dostawy
  const DELIVERY_EMAIL_TRANSLATIONS = {
    pl: {
      subject: 'Potwierdzenie dostawy zamówienia nr',
      greeting: 'Szanowny/a',
      client: 'Kliencie',
      intro: 'Potwierdzamy dostawę Twojego zamówienia.',
      title: 'POTWIERDZENIE DOSTAWY',
      orderNumber: 'Numer zamówienia',
      deliveryDate: 'Data dostawy',
      driver: 'Kierowca',
      product: 'Produkt',
      paymentTitle: 'POTWIERDZENIE PŁATNOŚCI',
      paidToDriver: 'została zapłacona kierowcy dnia',
      protocolInfo: 'W załączniku przesyłamy protokół odbioru towaru.',
      photosInfo: 'Zdjęcia z dostawy dostępne są w systemie.',
      thanks: 'Dziękujemy za zakupy!',
      welcome: 'Zapraszamy ponownie.',
      regards: 'Pozdrawiamy',
      team: 'Zespół obsługi zamówień'
    },
    en: {
      subject: 'Delivery confirmation for order no.',
      greeting: 'Dear',
      client: 'Customer',
      intro: 'We confirm the delivery of your order.',
      title: 'DELIVERY CONFIRMATION',
      orderNumber: 'Order number',
      deliveryDate: 'Delivery date',
      driver: 'Driver',
      product: 'Product',
      paymentTitle: 'PAYMENT CONFIRMATION',
      paidToDriver: 'was paid to the driver on',
      protocolInfo: 'Please find attached the goods receipt protocol.',
      photosInfo: 'Delivery photos are available in the system.',
      thanks: 'Thank you for your purchase!',
      welcome: 'We look forward to serving you again.',
      regards: 'Best regards',
      team: 'Order Service Team'
    },
    de: {
      subject: 'Lieferbestätigung für Bestellung Nr.',
      greeting: 'Sehr geehrte/r',
      client: 'Kunde',
      intro: 'Wir bestätigen die Lieferung Ihrer Bestellung.',
      title: 'LIEFERBESTÄTIGUNG',
      orderNumber: 'Bestellnummer',
      deliveryDate: 'Lieferdatum',
      driver: 'Fahrer',
      product: 'Produkt',
      paymentTitle: 'ZAHLUNGSBESTÄTIGUNG',
      paidToDriver: 'wurde am folgenden Tag an den Fahrer bezahlt',
      protocolInfo: 'Im Anhang finden Sie das Warenempfangsprotokoll.',
      photosInfo: 'Lieferfotos sind im System verfügbar.',
      thanks: 'Vielen Dank für Ihren Einkauf!',
      welcome: 'Wir freuen uns auf Ihren nächsten Besuch.',
      regards: 'Mit freundlichen Grüßen',
      team: 'Bestellservice-Team'
    },
    es: {
      subject: 'Confirmación de entrega del pedido nº',
      greeting: 'Estimado/a',
      client: 'Cliente',
      intro: 'Confirmamos la entrega de su pedido.',
      title: 'CONFIRMACIÓN DE ENTREGA',
      orderNumber: 'Número de pedido',
      deliveryDate: 'Fecha de entrega',
      driver: 'Conductor',
      product: 'Producto',
      paymentTitle: 'CONFIRMACIÓN DE PAGO',
      paidToDriver: 'fue pagado al conductor el día',
      protocolInfo: 'Adjuntamos el protocolo de recepción de mercancías.',
      photosInfo: 'Las fotos de la entrega están disponibles en el sistema.',
      thanks: '¡Gracias por su compra!',
      welcome: 'Esperamos volver a atenderle.',
      regards: 'Saludos cordiales',
      team: 'Equipo de servicio de pedidos'
    },
    nl: {
      subject: 'Leveringsbevestiging voor bestelling nr.',
      greeting: 'Geachte',
      client: 'Klant',
      intro: 'Wij bevestigen de levering van uw bestelling.',
      title: 'LEVERINGSBEVESTIGING',
      orderNumber: 'Bestelnummer',
      deliveryDate: 'Leverdatum',
      driver: 'Chauffeur',
      product: 'Product',
      paymentTitle: 'BETALINGSBEVESTIGING',
      paidToDriver: 'is op de volgende datum aan de chauffeur betaald',
      protocolInfo: 'In de bijlage vindt u het ontvangstprotocol.',
      photosInfo: 'Leveringsfoto\'s zijn beschikbaar in het systeem.',
      thanks: 'Bedankt voor uw aankoop!',
      welcome: 'Wij zien u graag terug.',
      regards: 'Met vriendelijke groet',
      team: 'Bestelservice Team'
    }
  };

  // Generuj HTML dokumentu potwierdzenia dostawy
  const generateDeliveryConfirmationHTML = (order) => {
    const walutaSymbol = CURRENCIES.find(c => c.code === order.platnosci?.waluta)?.symbol || 'zł';
    const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
    const dataPlatnosci = order.potwierdzenieDostawy?.data || new Date().toISOString();
    
    // Pobierz rabat z nowej logiki - preferuj rabatyKierowcow
    let rabatKwota = 0;
    let rabatPowod = '';
    
    // 1. Sprawdź rabatyKierowcow (główne źródło prawdy)
    if (order.rabatyKierowcow) {
      Object.values(order.rabatyKierowcow).forEach(r => {
        if (r && r.kwota > 0) {
          rabatKwota += r.kwota;
          if (!rabatPowod && r.powod) rabatPowod = r.powod;
        }
      });
    }
    
    // 2. Jeśli brak, sprawdź produkty (unikalne per kierowca)
    if (rabatKwota === 0 && order.produkty && order.produkty.length > 0) {
      const rabatyPerKierowca = {};
      order.produkty.forEach(p => {
        if (p.rabat && p.rabat.kwota > 0 && p.rabat.kierowcaId) {
          if (!rabatyPerKierowca[p.rabat.kierowcaId]) {
            rabatyPerKierowca[p.rabat.kierowcaId] = p.rabat;
          }
        }
      });
      Object.values(rabatyPerKierowca).forEach(r => {
        rabatKwota += r.kwota;
        if (!rabatPowod && r.powod) rabatPowod = r.powod;
      });
    }
    
    // 3. Fallback na stary rabatPrzyDostawie
    if (rabatKwota === 0 && order.rabatPrzyDostawie?.kwota > 0) {
      rabatKwota = order.rabatPrzyDostawie.kwota;
      rabatPowod = order.rabatPrzyDostawie.powod || '';
    }
    
    const hasDiscount = rabatKwota > 0;
    const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
    const originalDoZaplaty = order.platnosci?.originalDoZaplaty || (cenaCalkowita - zaplacono);
    const faktyczniePobrano = Math.max(0, originalDoZaplaty - rabatKwota);
    const clientRemarks = order.umowaOdbioru?.uwagiKlienta || order.uwagiKlienta || '';
    
    const signatureUrl = order.podpisKlienta 
      ? (typeof order.podpisKlienta === 'string' ? order.podpisKlienta : order.podpisKlienta.url)
      : null;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Potwierdzenie dostawy - ${order.nrWlasny}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #6366F1; }
          .header h1 { color: #1E1B4B; font-size: 28px; margin-bottom: 8px; }
          .header .order-number { color: #6366F1; font-size: 18px; font-weight: 600; }
          .header .date { color: #6B7280; font-size: 14px; margin-top: 8px; }
          .section { margin-bottom: 25px; }
          .section-title { background: #F3F4F6; padding: 10px 15px; border-radius: 8px; font-weight: 600; color: #374151; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
          .section-content { padding: 0 15px; }
          .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB; }
          .info-row:last-child { border-bottom: none; }
          .info-label { color: #6B7280; }
          .info-value { font-weight: 500; color: #1F2937; }
          .payment-box { background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%); border-radius: 12px; padding: 20px; margin-top: 10px; }
          .payment-row { display: flex; justify-content: space-between; padding: 10px 0; }
          .payment-row.total { border-top: 2px solid #6366F1; margin-top: 10px; padding-top: 15px; font-size: 18px; font-weight: 700; color: #1E1B4B; }
          .payment-row.discount { color: #059669; }
          .payment-row.collected { background: #D1FAE5; padding: 12px; border-radius: 8px; margin-top: 10px; }
          .remarks-box { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; border-radius: 0 8px 8px 0; }
          .signature-box { text-align: center; margin-top: 20px; padding: 20px; border: 2px dashed #D1D5DB; border-radius: 12px; }
          .signature-box img { max-width: 300px; max-height: 150px; }
          .signature-label { color: #6B7280; font-size: 12px; margin-top: 10px; }
          .footer { margin-top: 30px; text-align: center; padding-top: 20px; border-top: 1px solid #E5E7EB; color: #6B7280; font-size: 12px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
          .badge-success { background: #D1FAE5; color: #065F46; }
          .badge-warning { background: #FEF3C7; color: #92400E; }
          @media print { 
            body { padding: 0; background: white; } 
            .container { box-shadow: none; padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ POTWIERDZENIE DOSTAWY</h1>
            <div class="order-number">Zamówienie: ${order.nrWlasny}</div>
            <div class="date">Data dostawy: ${formatDate(dataPlatnosci)} | Kierowca: ${user.name}</div>
          </div>

          <div class="section">
            <div class="section-title">👤 Dane odbiorcy</div>
            <div class="section-content">
              <div class="info-row">
                <span class="info-label">Imię i nazwisko:</span>
                <span class="info-value">${order.klient?.imie || '—'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Adres dostawy:</span>
                <span class="info-value">${order.klient?.adres || '—'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Telefon:</span>
                <span class="info-value">${order.klient?.telefon || '—'}</span>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">📦 Zamówiony towar</div>
            <div class="section-content">
              <p style="white-space: pre-wrap; line-height: 1.6;">${order.towar || 'Brak opisu'}</p>
            </div>
          </div>

          <div class="section">
            <div class="section-title">💰 Podsumowanie płatności</div>
            <div class="payment-box">
              <div class="payment-row">
                <span>Wartość zamówienia:</span>
                <span><strong>${cenaCalkowita.toFixed(2)} ${walutaSymbol}</strong></span>
              </div>
              ${zaplacono > 0 ? `
              <div class="payment-row">
                <span>Wpłacona zaliczka:</span>
                <span><span class="badge badge-success">✓ ${zaplacono.toFixed(2)} ${walutaSymbol}</span></span>
              </div>
              ` : ''}
              <div class="payment-row">
                <span>Pozostało do zapłaty:</span>
                <span>${originalDoZaplaty.toFixed(2)} ${walutaSymbol}</span>
              </div>
              ${hasDiscount ? `
              <div class="payment-row discount">
                <span>🎁 Udzielono rabatu (${rabatPowod || 'brak powodu'}):</span>
                <span><strong>-${rabatKwota.toFixed(2)} ${walutaSymbol}</strong></span>
              </div>
              ` : ''}
              <div class="payment-row total collected">
                <span>✅ Pobrano od klienta:</span>
                <span>${faktyczniePobrano.toFixed(2)} ${walutaSymbol}</span>
              </div>
            </div>
          </div>

          ${clientRemarks ? `
          <div class="section">
            <div class="section-title">📝 Uwagi klienta</div>
            <div class="remarks-box">
              ${clientRemarks}
            </div>
          </div>
          ` : ''}

          ${signatureUrl ? `
          <div class="section">
            <div class="section-title">✍️ Podpis klienta</div>
            <div class="signature-box">
              <img src="${signatureUrl}" alt="Podpis klienta" />
              <div class="signature-label">Podpisano elektronicznie: ${formatDateTime(order.podpisKlienta?.timestamp || dataPlatnosci)}</div>
            </div>
          </div>
          ` : ''}

          <div class="footer">
            <p>Dokument wygenerowany automatycznie przez system Herraton</p>
            <p>${new Date().toLocaleString('pl-PL')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Drukuj potwierdzenie dostawy
  const printDeliveryConfirmation = (order) => {
    const html = generateDeliveryConfirmationHTML(order);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
    setShowDeliveryConfirmation(null);
  };

  // Pobierz potwierdzenie jako HTML (można otworzyć i zapisać jako PDF)
  const downloadDeliveryConfirmation = (order) => {
    const html = generateDeliveryConfirmationHTML(order);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Potwierdzenie_dostawy_${order.nrWlasny}_${formatDate(new Date())}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('📥 Plik został pobrany!\\n\\nAby zapisać jako PDF:\\n1. Otwórz pobrany plik w przeglądarce\\n2. Naciśnij Ctrl+P (lub Cmd+P na Mac)\\n3. Wybierz "Zapisz jako PDF"');
    setShowDeliveryConfirmation(null);
  };

  // Funkcja wysyłania potwierdzenia dostawy
  const sendDeliveryConfirmationEmail = (order) => {
    const t = DELIVERY_EMAIL_TRANSLATIONS[deliveryEmailLanguage] || DELIVERY_EMAIL_TRANSLATIONS.pl;
    const walutaSymbol = CURRENCIES.find(c => c.code === order.platnosci?.waluta)?.symbol || 'zł';
    const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
    const dataPlatnosci = order.potwierdzenieDostawy?.data || new Date().toISOString();
    const hasPhotos = order.zdjeciaDostawy && order.zdjeciaDostawy.length > 0;
    const hasSignature = order.podpisKlienta;
    
    // Pobierz URL podpisu
    const signatureUrl = order.podpisKlienta 
      ? (typeof order.podpisKlienta === 'string' ? order.podpisKlienta : order.podpisKlienta.url)
      : null;
    
    // Pobierz rabat z nowej logiki - preferuj rabatyKierowcow
    let rabatKwota = 0;
    let rabatPowod = '';
    let rabatKierowca = '';
    let rabatData = '';
    
    // 1. Sprawdź rabatyKierowcow (główne źródło prawdy)
    if (order.rabatyKierowcow) {
      Object.values(order.rabatyKierowcow).forEach(r => {
        if (r && r.kwota > 0) {
          rabatKwota += r.kwota;
          if (!rabatPowod && r.powod) rabatPowod = r.powod;
          if (!rabatKierowca && r.kierowca) rabatKierowca = r.kierowca;
          if (!rabatData && r.data) rabatData = r.data;
        }
      });
    }
    
    // 2. Jeśli brak, sprawdź produkty (unikalne per kierowca)
    if (rabatKwota === 0 && order.produkty && order.produkty.length > 0) {
      const rabatyPerKierowca = {};
      order.produkty.forEach(p => {
        if (p.rabat && p.rabat.kwota > 0 && p.rabat.kierowcaId) {
          if (!rabatyPerKierowca[p.rabat.kierowcaId]) {
            rabatyPerKierowca[p.rabat.kierowcaId] = p.rabat;
          }
        }
      });
      Object.values(rabatyPerKierowca).forEach(r => {
        rabatKwota += r.kwota;
        if (!rabatPowod && r.powod) rabatPowod = r.powod;
        if (!rabatKierowca && r.kierowca) rabatKierowca = r.kierowca;
        if (!rabatData && r.data) rabatData = r.data;
      });
    }
    
    // 3. Fallback na stary rabatPrzyDostawie
    if (rabatKwota === 0 && order.rabatPrzyDostawie?.kwota > 0) {
      rabatKwota = order.rabatPrzyDostawie.kwota;
      rabatPowod = order.rabatPrzyDostawie.powod || '';
      rabatKierowca = order.rabatPrzyDostawie.kierowca || '';
      rabatData = order.rabatPrzyDostawie.data || '';
    }
    
    const hasDiscount = rabatKwota > 0;
    
    const subject = `${t.subject} ${order.nrWlasny}`;
    
    // Obliczenia płatności - POPRAWIONE
    const zaplaconoPrzedDostawa = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
    
    // Oryginalna kwota do zapłaty (PRZED rabatem) = cena - zaliczka
    const originalDoZaplaty = order.platnosci?.originalDoZaplaty || (cenaCalkowita - zaplaconoPrzedDostawa);
    
    // Faktycznie pobrana kwota (PO rabacie)
    const faktyczniePobrano = Math.max(0, originalDoZaplaty - rabatKwota);
    
    const dataZaplatyKierowcy = order.platnosci?.dataPlatnosciKierowcy || order.potwierdzenieDostawy?.data || dataPlatnosci;
    
    // Pełne podsumowanie płatności
    let paymentSummary = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 PODSUMOWANIE PŁATNOŚCI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Wartość zamówienia: ${cenaCalkowita.toFixed(2)} ${walutaSymbol}`;

    // Pokaż zaliczkę jeśli była wpłacona
    if (zaplaconoPrzedDostawa > 0) {
      paymentSummary += `
💳 Wpłacona zaliczka: ${zaplaconoPrzedDostawa.toFixed(2)} ${walutaSymbol} ✓`;
    }
    
    // Oryginalna kwota do zapłaty (przed rabatem)
    paymentSummary += `
📋 Pozostało do zapłaty: ${originalDoZaplaty.toFixed(2)} ${walutaSymbol}`;

    // Dodaj info o rabacie jeśli był
    if (hasDiscount && rabatKwota > 0) {
      paymentSummary += `

🎁 Udzielono rabatu: -${rabatKwota.toFixed(2)} ${walutaSymbol}
   ├─ Udzielony przez: ${rabatKierowca || user.name}
   ├─ Data: ${formatDate(rabatData || dataPlatnosci)}
   └─ Powód: ${rabatPowod || 'Nie podano'}`;
    }
    
    // Kwota faktycznie pobrana od klienta
    if (faktyczniePobrano > 0) {
      paymentSummary += `

✅ Pobrano od klienta: ${faktyczniePobrano.toFixed(2)} ${walutaSymbol}
   └─ Zapłacono kierowcy ${user.name} dnia ${formatDate(dataZaplatyKierowcy)}`;
    } else if (originalDoZaplaty === 0) {
      paymentSummary += `

✅ Zamówienie w pełni opłacone zaliczką`;
    }
    
    // Wersja tekstowa (fallback)
    const textBody = `${t.greeting} ${order.klient?.imie || t.client},

${t.intro}

${t.orderNumber}: ${order.nrWlasny}
${t.deliveryDate}: ${formatDate(dataPlatnosci)}
${t.driver}: ${user.name}

${t.product}:
${order.towar || '-'}
${paymentSummary}

${t.thanks}
${t.welcome}

${t.regards},
${t.team}`;

    // Wersja HTML (ładna jak PDF)
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; text-align: center;">
              <div style="font-size: 40px; margin-bottom: 10px;">✅</div>
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">${t.title}</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Zamówienie: ${order.nrWlasny}</p>
              <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 14px;">Data dostawy: ${formatDate(dataPlatnosci)} | Kierowca: ${user.name}</p>
            </td>
          </tr>
          
          <!-- Greeting -->
          <tr>
            <td style="padding: 30px 30px 20px 30px;">
              <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
                ${t.greeting} <strong>${order.klient?.imie || t.client}</strong>,
              </p>
              <p style="margin: 15px 0 0 0; color: #6B7280; font-size: 15px; line-height: 1.6;">
                ${t.intro}
              </p>
            </td>
          </tr>
          
          <!-- Dane odbiorcy -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <div style="background-color: #F3F4F6; border-radius: 10px; padding: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #1F2937; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">👤 Dane odbiorcy</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Imię i nazwisko:</td>
                    <td style="padding: 8px 0; color: #1F2937; font-size: 14px; font-weight: 500; text-align: right;">${order.klient?.imie || '-'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6B7280; font-size: 14px; border-top: 1px solid #E5E7EB;">Adres dostawy:</td>
                    <td style="padding: 8px 0; color: #1F2937; font-size: 14px; font-weight: 500; text-align: right; border-top: 1px solid #E5E7EB;">${order.klient?.adres || '-'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6B7280; font-size: 14px; border-top: 1px solid #E5E7EB;">Telefon:</td>
                    <td style="padding: 8px 0; color: #1F2937; font-size: 14px; font-weight: 500; text-align: right; border-top: 1px solid #E5E7EB;">${order.klient?.telefon || '-'}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          
          <!-- Zamówiony towar -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <div style="background-color: #FEF3C7; border-radius: 10px; padding: 20px; border-left: 4px solid #F59E0B;">
                <h3 style="margin: 0 0 10px 0; color: #92400E; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">📦 Zamówiony towar</h3>
                <p style="margin: 0; color: #78350F; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${order.towar || '-'}</p>
              </div>
            </td>
          </tr>
          
          <!-- Podsumowanie płatności -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <div style="background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%); border-radius: 10px; padding: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #3730A3; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">💰 Podsumowanie płatności</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 10px 0; color: #4B5563; font-size: 14px;">Wartość zamówienia:</td>
                    <td style="padding: 10px 0; color: #1F2937; font-size: 16px; font-weight: 600; text-align: right;">${cenaCalkowita.toFixed(2)} ${walutaSymbol}</td>
                  </tr>
                  ${zaplaconoPrzedDostawa > 0 ? `
                  <tr>
                    <td style="padding: 10px 0; color: #4B5563; font-size: 14px; border-top: 1px solid #C7D2FE;">Wpłacona zaliczka:</td>
                    <td style="padding: 10px 0; text-align: right; border-top: 1px solid #C7D2FE;">
                      <span style="background-color: #10B981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 500;">✓ ${zaplaconoPrzedDostawa.toFixed(2)} ${walutaSymbol}</span>
                    </td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 10px 0; color: #4B5563; font-size: 14px; border-top: 1px solid #C7D2FE;">Pozostało do zapłaty:</td>
                    <td style="padding: 10px 0; color: #1F2937; font-size: 14px; text-align: right; border-top: 1px solid #C7D2FE;">${originalDoZaplaty.toFixed(2)} ${walutaSymbol}</td>
                  </tr>
                  ${hasDiscount ? `
                  <tr>
                    <td style="padding: 10px 0; color: #DC2626; font-size: 14px; border-top: 1px solid #C7D2FE;">🎁 Udzielono rabatu (${rabatPowod || 'brak powodu'}):</td>
                    <td style="padding: 10px 0; color: #DC2626; font-size: 14px; font-weight: 600; text-align: right; border-top: 1px solid #C7D2FE;">-${rabatKwota.toFixed(2)} ${walutaSymbol}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td colspan="2" style="padding-top: 15px; border-top: 2px solid #6366F1;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #10B981; border-radius: 8px;">
                        <tr>
                          <td style="padding: 15px; color: white; font-size: 14px; font-weight: 500;">✅ Pobrano od klienta:</td>
                          <td style="padding: 15px; color: white; font-size: 18px; font-weight: 700; text-align: right;">${faktyczniePobrano.toFixed(2)} ${walutaSymbol}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          
          ${signatureUrl ? `
          <!-- Podpis klienta -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <div style="background-color: #F9FAFB; border-radius: 10px; padding: 20px; text-align: center; border: 2px dashed #D1D5DB;">
                <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 14px;">✍️ Podpis klienta</h3>
                <img src="${signatureUrl}" alt="Podpis klienta" style="max-width: 200px; max-height: 100px; border-radius: 8px;" />
                <p style="margin: 10px 0 0 0; color: #9CA3AF; font-size: 12px;">Podpisano elektronicznie: ${formatDateTime(order.podpisKlienta?.timestamp || dataPlatnosci)}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          
          ${hasPhotos ? `
          <!-- Info o zdjęciach -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <div style="background-color: #DBEAFE; border-radius: 10px; padding: 15px; text-align: center;">
                <p style="margin: 0; color: #1E40AF; font-size: 14px;">📸 Zdjęcia dostawy (${order.zdjeciaDostawy.length}) dołączone w załącznikach</p>
              </div>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #F9FAFB; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #374151; font-size: 15px;">${t.thanks}</p>
              <p style="margin: 0 0 20px 0; color: #6B7280; font-size: 14px;">${t.welcome}</p>
              <p style="margin: 0; color: #9CA3AF; font-size: 13px;">${t.regards},<br><strong>${t.team}</strong></p>
            </td>
          </tr>
          
          <!-- Copyright -->
          <tr>
            <td style="padding: 20px; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">📧 Ta wiadomość została wysłana automatycznie przez system Herraton</p>
              <p style="margin: 5px 0 0 0; color: #D1D5DB; font-size: 11px;">${new Date().toLocaleString('pl-PL')}</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Przygotuj załączniki
    const attachments = [];
    
    // Dodaj zdjęcia jako załączniki (max 3 pierwsze, żeby nie przekroczyć limitu)
    if (hasPhotos && order.zdjeciaDostawy) {
      const maxPhotos = Math.min(order.zdjeciaDostawy.length, 3);
      for (let i = 0; i < maxPhotos; i++) {
        const photo = order.zdjeciaDostawy[i];
        if (photo && typeof photo === 'string' && photo.startsWith('data:image')) {
          // Wyciągnij base64 z data URL
          const base64Data = photo.split(',')[1];
          const mimeMatch = photo.match(/data:(image\/\w+);/);
          const extension = mimeMatch ? mimeMatch[1].split('/')[1] : 'jpg';
          
          attachments.push({
            filename: `dostawa_${order.nrWlasny}_zdjecie_${i + 1}.${extension}`,
            content: base64Data
          });
        }
      }
    }
    
    // Dodaj podpis jako załącznik jeśli jest
    if (hasSignature && order.podpisKlienta) {
      // Podpis może być stringiem (data URL) lub obiektem { url: '...' }
      const sigUrl = typeof order.podpisKlienta === 'string' 
        ? order.podpisKlienta 
        : order.podpisKlienta.url;
      
      if (sigUrl && typeof sigUrl === 'string' && sigUrl.includes(',')) {
        const signatureBase64 = sigUrl.split(',')[1];
        if (signatureBase64) {
          attachments.push({
            filename: `podpis_${order.nrWlasny}.png`,
            content: signatureBase64
          });
        }
      }
    }

    // Wyślij przez MailerSend z załącznikami - TERAZ Z HTML!
    sendEmailViaMailerSend(
      order.klient.email,
      order.klient.imie,
      subject,
      textBody,
      htmlBody,
      attachments
    ).then(result => {
      if (result.success) {
        const attachInfo = attachments.length > 0 ? ` (z ${attachments.length} załącznikami)` : '';
        alert(`✅ Email z potwierdzeniem dostawy został wysłany!${attachInfo}`);
      } else {
        alert('❌ Błąd wysyłania emaila. Spróbuj ponownie.');
      }
    });
    
    setShowDeliveryConfirmation(null);
  };

  return (
    <div className="driver-panel">
      <header className="header driver-header">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-logo">🚚</div>
            <div>
              <div className="header-title">Herraton</div>
              <div className="header-subtitle">Panel kierowcy • {user.name}</div>
            </div>
          </div>
          <div className="driver-header-actions">
            <div className="driver-settings-dropdown">
              <button className="btn-driver-menu" onClick={() => setShowDriverMenu(!showDriverMenu)}>
                ⚙️ Menu {showDriverMenu ? '▲' : '▼'}
              </button>
              {showDriverMenu && (
                <div className="driver-menu-dropdown">
                  <button onClick={() => { setShowTripsModal(true); setShowDriverMenu(false); }}>
                    📅 Zarządzaj wyjazdami
                  </button>
                  <button onClick={() => { setShowTransportRatesModal(true); setShowDriverMenu(false); }}>
                    💶 Stawki transportowe
                  </button>
                  <button onClick={() => { setShowSettlementsModal(true); setShowDriverMenu(false); }}>
                    💰 Moje rozliczenia
                  </button>
                </div>
              )}
            </div>
            <button className="btn-logout" onClick={onLogout}>Wyloguj</button>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="stats-grid driver-stats">
          <div className="stat-card">
            <div className="stat-value">{toPickup.length + pickedUp.length + inTransit.length}</div>
            <div className="stat-label">Do realizacji</div>
          </div>
          <div className="stat-card">
            <div className="stat-value success">{delivered.length}</div>
            <div className="stat-label">Dostarczonych</div>
          </div>
        </div>

        {/* Sekcja planowanych wyjazdów - tylko harmonogram */}
        <div className="driver-trips-section">
          <div className="trips-info">
            {nextTrip ? (
              <div className="next-trip-badge">
                <span className="trip-icon">🚗</span>
                <div className="trip-details">
                  <div className="trip-row">
                    <span className="trip-label">📦 Odbiory:</span>
                    <span className="trip-dates">
                      {formatDate(nextTrip.pickupFrom || nextTrip.date)}
                      {nextTrip.pickupTo && nextTrip.pickupTo !== nextTrip.pickupFrom && (
                        <> — {formatDate(nextTrip.pickupTo)}</>
                      )}
                    </span>
                  </div>
                  <div className="trip-row">
                    <span className="trip-label">🚗 Wyjazd:</span>
                    <span className="trip-date-main">{formatDate(nextTrip.departureDate || nextTrip.date)}</span>
                    {nextTrip.destination && <span className="trip-dest">→ {nextTrip.destination}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-trip-badge">
                <span>📅 Brak zaplanowanych wyjazdów</span>
              </div>
            )}
          </div>
        </div>

        <div className="driver-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`driver-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              <span className="tab-count">{t.count}</span>
              <span className="tab-label">{t.icon} {t.label}</span>
            </button>
          ))}
        </div>

        {/* Filtr statusów dla zakładki "Do odbioru" */}
        {activeTab === 'pickup' && (
          <div className="driver-filters-section">
            {/* Filtr statusów */}
            <div className="driver-status-filter">
              <span className="filter-label">Status:</span>
              <div className="filter-buttons">
                <button 
                  className={`filter-btn ${pickupStatusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setPickupStatusFilter('all')}
                >
                  Wszystkie ({toPickup.length})
                </button>
                <button 
                  className={`filter-btn ${pickupStatusFilter === 'gotowe_do_odbioru' ? 'active' : ''}`}
                  onClick={() => setPickupStatusFilter('gotowe_do_odbioru')}
                >
                  ✅ Gotowe ({toPickup.filter(o => o.status === 'gotowe_do_odbioru').length})
                </button>
                <button 
                  className={`filter-btn ${pickupStatusFilter === 'w_produkcji' ? 'active' : ''}`}
                  onClick={() => setPickupStatusFilter('w_produkcji')}
                >
                  🔨 W produkcji ({toPickup.filter(o => o.status === 'w_produkcji').length})
                </button>
              <button 
                className={`filter-btn ${pickupStatusFilter === 'potwierdzone' ? 'active' : ''}`}
                onClick={() => setPickupStatusFilter('potwierdzone')}
              >
                📋 Potwierdzone ({toPickup.filter(o => o.status === 'potwierdzone').length})
              </button>
            </div>
          </div>
          
          {/* Filtr producentów */}
          {uniqueProducersInPickup.length > 0 && (
            <div className="driver-producer-filter">
              <span className="filter-label">🏭 Producent:</span>
              <div className="filter-buttons producer-filter-buttons">
                <button 
                  className={`filter-btn ${producerFilterDriver === 'all' ? 'active' : ''}`}
                  onClick={() => setProducerFilterDriver('all')}
                >
                  Wszyscy ({toPickup.length})
                </button>
                {uniqueProducersInPickup.map(prodId => {
                  const prod = Object.values(producers).find(p => p.id === prodId);
                  return (
                    <button 
                      key={prodId}
                      className={`filter-btn ${producerFilterDriver === prodId ? 'active' : ''}`}
                      onClick={() => setProducerFilterDriver(prodId)}
                    >
                      {prod?.name || prodId} ({ordersPerProducer[prodId]})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        )}

        {getTabOrders().length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>Brak zamówień w tej kategorii</p>
          </div>
        ) : (
          <div className="driver-orders">
            {getTabOrders().map(order => {
              const status = getStatus(getEffectiveStatus(order));
              const producer = Object.values(producers).find(p => p.id === order.zaladunek);
              const country = getCountry(order.kraj);
              const hasMultipleProducts = order.produkty && order.produkty.length > 1 && order._myProductIndexes;

              return (
                <div key={order.id} className="driver-order-card">
                  <div className="driver-order-header">
                    <div className="driver-order-title">
                      <span className="country-flag">{country?.flag}</span>
                      <span className="order-number">{order.nrWlasny}</span>
                      {hasMultipleProducts && <span className="multi-badge">📦 {order._myProductIndexes.length}/{order.produkty.length}</span>}
                      {order._isPartial && <span className="partial-badge">część</span>}
                    </div>
                    {!hasMultipleProducts && (
                      <span className="status-badge" style={{ background: status.bgColor, color: status.color }}>
                        {status.icon} {status.name}
                      </span>
                    )}
                  </div>

                  {/* Jeśli zamówienie łączone - pokaż listę produktów z osobnymi statusami */}
                  {hasMultipleProducts ? (
                    <div className="driver-products-list">
                      {order._myProductIndexes.map(idx => {
                        const prod = order.produkty[idx];
                        if (!prod) return null;
                        const prodStatus = getStatus(prod.status);
                        const prodProducer = Object.values(producers).find(p => p.id === prod.producent);
                        return (
                          <div key={idx} className="driver-product-item">
                            <div className="product-item-row">
                              <span className="product-nr">{prod.nrPodzamowienia || `#${idx + 1}`}</span>
                              <select
                                value={prod.status || 'nowe'}
                                onChange={e => changeStatus(order, e.target.value, idx)}
                                className="status-select mini"
                                style={{ background: prodStatus?.bgColor, color: prodStatus?.color }}
                              >
                                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                              </select>
                            </div>
                            <div className="product-desc">{prod.towar?.substring(0, 80) || '—'}{prod.towar?.length > 80 ? '...' : ''}</div>
                            {(prodProducer || prod.producentNazwa) && activeTab === 'pickup' && (
                              <div className="product-producer-mini">
                                🏭 {prodProducer?.name || prod.producentNazwa}
                                {prodProducer?.address && <span className="addr"> • 📍 {prodProducer.address}</span>}
                                {prodProducer?.phone && <a href={`tel:${prodProducer.phone}`}> • 📞</a>}
                              </div>
                            )}
                            {prod.dataOdbioru && <div className="product-date">📅 Odbiór: {formatDate(prod.dataOdbioru)}</div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      {producer && activeTab === 'pickup' && (
                        <div className="driver-section producer-section">
                          <div className="section-title">🏭 Producent do odbioru</div>
                          <div className="section-name">{producer.name}</div>
                          <div className="section-detail">📍 {producer.address || 'Brak adresu'}</div>
                          <div className="section-contacts">
                            {producer.phone && <a href={`tel:${producer.phone}`}>📞 {producer.phone}</a>}
                            {producer.email && <a href={`mailto:${producer.email}`}>✉️ Email</a>}
                          </div>
                        </div>
                      )}
                      {/* Towar - dla zamówień nie-łączonych */}
                      {order.towar && (
                        <div className="driver-section product-section">
                          <div className="section-title">📦 Towar</div>
                          <div className="product-info-content">{order.towar}</div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="driver-section client-section expandable">
                    <div className="section-title">👤 Klient</div>
                    <div className="section-name">{order.klient?.imie || '—'}</div>
                    <div className="section-detail">📍 {order.klient?.adres || '—'}</div>
                    <div className="section-contacts">
                      {order.klient?.telefon && <a href={`tel:${order.klient.telefon}`}>📞 {order.klient.telefon}</a>}
                      {order.klient?.facebookUrl && <a href={order.klient.facebookUrl} target="_blank" rel="noopener noreferrer">📘 Facebook</a>}
                    </div>
                  </div>

                  {/* Kwota do pobrania - tylko dla produktów tego kierowcy */}
                  {(() => {
                    let myAmount = 0;
                    let metodaPobrania = null;
                    let notatkaKierowcy = null;
                    let mojRabat = 0;
                    let mojRabatInfo = null;
                    let mojRabatProductIndex = null;
                    let productWaluta = order.platnosci?.waluta || 'PLN'; // Domyślna waluta z zamówienia
                    const myProductIndexes = order._myProductIndexes || [];
                    
                    if (order.produkty && order.produkty.length > 0) {
                      // Zamówienie łączone - sumuj tylko produkty tego kierowcy
                      order.produkty.forEach((p, idx) => {
                        // Sprawdź czy to mój produkt (używając _myProductIndexes lub fallback)
                        const isMine = myProductIndexes.length > 0 
                          ? myProductIndexes.includes(idx)
                          : (p.kierowca === user.id || (!p.kierowca && order.przypisanyKierowca === user.id));
                        
                        if (isMine) {
                          if (p.doPobrania > 0) {
                            myAmount += p.doPobrania;
                          }
                          // Pobierz walutę z produktu (jeśli jest) lub z zamówienia
                          if (!productWaluta && (p.waluta || p.koszty?.waluta)) {
                            productWaluta = p.waluta || p.koszty?.waluta;
                          }
                          // Pobierz metodę pobrania i notatkę
                          if (p.metodaPobrania && !metodaPobrania) {
                            metodaPobrania = p.metodaPobrania;
                          }
                          if (p.notatkaKierowcy && !notatkaKierowcy) {
                            notatkaKierowcy = p.notatkaKierowcy;
                          }
                          // Pobierz rabat z produktu
                          if (p.rabat && p.rabat.kwota > 0) {
                            mojRabat += p.rabat.kwota;
                            mojRabatInfo = p.rabat;
                            mojRabatProductIndex = idx;
                          }
                        }
                      });
                    } else {
                      // Stare zamówienie - sprawdź czy jest przypisane do tego kierowcy
                      if (order.przypisanyKierowca === user.id) {
                        myAmount = order.platnosci?.doZaplaty || 0;
                        // Sprawdź rabat ze starej logiki
                        if (order.rabatPrzyDostawie?.kierowcaId === user.id) {
                          mojRabat = order.rabatPrzyDostawie.kwota || 0;
                          mojRabatInfo = order.rabatPrzyDostawie;
                        }
                      }
                    }
                    
                    // Sprawdź też rabat z rabatyKierowcow - upewnij się że nie jest null
                    if (!mojRabatInfo && order.rabatyKierowcow?.[user.id] && order.rabatyKierowcow[user.id]?.kwota > 0) {
                      mojRabat = order.rabatyKierowcow[user.id].kwota || 0;
                      mojRabatInfo = order.rabatyKierowcow[user.id];
                    }
                    
                    // Oblicz kwotę po rabacie
                    const kwotaPoRabacie = Math.max(0, myAmount - mojRabat);
                    
                    // Słownik metod pobrania
                    const metodaLabels = {
                      gotowka: { icon: '💵', name: 'Gotówka' },
                      przelew: { icon: '🏦', name: 'Przelew' },
                      karta: { icon: '💳', name: 'Karta' },
                      blik: { icon: '📱', name: 'BLIK' },
                      oplacone: { icon: '✅', name: 'Już opłacone' }
                    };
                    
                    if (myAmount > 0 || metodaPobrania === 'oplacone') {
                      return (
                        <div className={`driver-payment-alert ${metodaPobrania === 'oplacone' ? 'paid' : ''}`}>
                          <div className="payment-header">
                            <div className="payment-label">
                              {metodaPobrania === 'oplacone' ? '✅ Opłacone' : '💰 Do pobrania od klienta'}
                            </div>
                            {kwotaPoRabacie > 0 && (
                              <div className="payment-amount">
                                {formatCurrency(kwotaPoRabacie, productWaluta)}
                                {mojRabat > 0 && (
                                  <span className="original-amount-strike"> ({formatCurrency(myAmount, productWaluta)})</span>
                                )}
                              </div>
                            )}
                            {kwotaPoRabacie === 0 && mojRabat > 0 && (
                              <div className="payment-amount paid">✅ 0 (rabat pokrył całość)</div>
                            )}
                          </div>
                          
                          {/* Info o rabacie */}
                          {mojRabat > 0 && mojRabatInfo && (
                            <div className="payment-discount-applied">
                              <div className="discount-info-row">
                                <span>💸 Udzielono rabat: <strong>-{formatCurrency(mojRabat, productWaluta)}</strong></span>
                                <button 
                                  className="btn-delete-discount-driver"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm('Czy na pewno chcesz usunąć ten rabat?')) {
                                      handleDeleteDriverDiscount(order, mojRabatProductIndex);
                                    }
                                  }}
                                  title="Usuń rabat"
                                >
                                  🗑️
                                </button>
                              </div>
                              <span className="discount-reason-small">({mojRabatInfo.powod})</span>
                            </div>
                          )}
                          
                          {/* Metoda pobrania */}
                          {metodaPobrania && metodaPobrania !== 'oplacone' && kwotaPoRabacie > 0 && (
                            <div className="payment-method-info">
                              <span className="method-badge">
                                {metodaLabels[metodaPobrania]?.icon || '💵'} {metodaLabels[metodaPobrania]?.name || 'Gotówka'}
                              </span>
                            </div>
                          )}
                          
                          {(order.platnosci?.zaliczka > 0 || order.platnosci?.zaplacono > 0) && (
                            <div className="payment-advance-info">
                              💳 Klient wpłacił już zaliczkę: <strong>{formatCurrency(order.platnosci?.zaplacono || order.platnosci?.zaliczka, productWaluta)}</strong>
                            </div>
                          )}
                          
                          {/* Notatka dla kierowcy */}
                          {notatkaKierowcy && (
                            <div className="driver-instruction-note">
                              <span className="note-icon">📋</span>
                              <span className="note-text">{notatkaKierowcy}</span>
                            </div>
                          )}
                        </div>
                      );
                    }
                    
                    // Jeśli kwota = 0 i nie ma metody "oplacone", pokaż że opłacone
                    if (order.platnosci?.cenaCalkowita > 0) {
                      return (
                        <div className="driver-payment-ok">
                          <span>✅ Zapłacone w całości</span>
                          {notatkaKierowcy && (
                            <div className="driver-instruction-note small">
                              <span className="note-icon">📋</span>
                              <span className="note-text">{notatkaKierowcy}</span>
                            </div>
                          )}
                        </div>
                      );
                    }
                    
                    return null;
                  })()}

                  {(order.szacowanyOdbior || order.szacowanaDostwa) && (
                    <div className="driver-dates">
                      {order.szacowanyOdbior && <span>📅 Odbiór: {formatDate(order.szacowanyOdbior)}</span>}
                      {order.szacowanaDostwa && <span>📅 Dostawa: {formatDate(order.szacowanaDostwa)}</span>}
                    </div>
                  )}

                  {order.uwagiKierowcy && <div className="driver-notes">📝 Twoje uwagi: {order.uwagiKierowcy}</div>}

                  {(order.zdjeciaOdbioru?.length > 0 || order.zdjeciaDostawy?.length > 0 || order.podpisKlienta) && (
                    <div className="driver-indicators">
                      {order.zdjeciaOdbioru?.length > 0 && <span className="indicator">📷 Odbiór ({order.zdjeciaOdbioru.length})</span>}
                      {order.zdjeciaDostawy?.length > 0 && <span className="indicator">📷 Dostawa ({order.zdjeciaDostawy.length})</span>}
                      {order.podpisKlienta && <span className="indicator">✍️ Podpis</span>}
                    </div>
                  )}

                  {/* PRZYCISKI ZDJĘĆ - ulepszona obsługa Android/iOS */}
                  <div className="driver-actions">
                    {activeTab === 'pickup' && (
                      <>
                        <div className="photo-buttons">
                          <label 
                            htmlFor={`pickup-camera-${order.id}`}
                            className="btn-driver photo camera"
                            style={{ cursor: 'pointer' }}
                          >
                            📸 Aparat
                          </label>
                          <input 
                            id={`pickup-camera-${order.id}`} 
                            type="file" 
                            accept="image/*" 
                            capture="environment"
                            style={{ 
                              position: 'absolute', 
                              width: '1px', 
                              height: '1px', 
                              padding: 0, 
                              margin: '-1px', 
                              overflow: 'hidden', 
                              clip: 'rect(0,0,0,0)', 
                              whiteSpace: 'nowrap', 
                              border: 0 
                            }} 
                            onChange={(e) => handlePhotoCapture(order, 'pickup', e)} 
                          />
                          <label 
                            htmlFor={`pickup-gallery-${order.id}`}
                            className="btn-driver photo gallery"
                            style={{ cursor: 'pointer' }}
                          >
                            🖼️ Galeria
                          </label>
                          <input 
                            id={`pickup-gallery-${order.id}`} 
                            type="file" 
                            accept="image/*"
                            style={{ 
                              position: 'absolute', 
                              width: '1px', 
                              height: '1px', 
                              padding: 0, 
                              margin: '-1px', 
                              overflow: 'hidden', 
                              clip: 'rect(0,0,0,0)', 
                              whiteSpace: 'nowrap', 
                              border: 0 
                            }} 
                            onChange={(e) => handlePhotoCapture(order, 'pickup', e)} 
                          />
                        </div>
                        <button className="btn-driver notes" onClick={() => openNotes(order)}>📝 Uwagi / Daty</button>
                        <button className="btn-driver status" onClick={() => changeStatus(order, 'odebrane')}>✅ Oznacz jako odebrane</button>
                        {(order.zdjeciaOdbioru?.length > 0) && (
                          <button className="btn-driver photos-manage" onClick={() => setShowPhotoManager({ orderId: order.id, type: 'pickup' })}>🖼️ Zarządzaj zdjęciami</button>
                        )}
                      </>
                    )}
                    {activeTab === 'picked' && (
                      <>
                        <button className="btn-driver notes" onClick={() => openNotes(order)}>📝 Uwagi / Daty</button>
                        <button className="btn-driver status" onClick={() => changeStatus(order, 'w_transporcie')}>🚗 Rozpocznij transport</button>
                        <button className="btn-driver back" onClick={() => changeStatus(order, 'gotowe_do_odbioru')}>⬅️ Cofnij do odbioru</button>
                      </>
                    )}
                    {activeTab === 'transit' && (
                      <>
                        <div className="photo-buttons">
                          <label 
                            htmlFor={`delivery-camera-${order.id}`}
                            className="btn-driver photo camera"
                            style={{ cursor: 'pointer' }}
                          >
                            📸 Aparat
                          </label>
                          <input 
                            id={`delivery-camera-${order.id}`} 
                            type="file" 
                            accept="image/*" 
                            capture="environment"
                            style={{ 
                              position: 'absolute', 
                              width: '1px', 
                              height: '1px', 
                              padding: 0, 
                              margin: '-1px', 
                              overflow: 'hidden', 
                              clip: 'rect(0,0,0,0)', 
                              whiteSpace: 'nowrap', 
                              border: 0 
                            }} 
                            onChange={(e) => handlePhotoCapture(order, 'delivery', e)} 
                          />
                          <label 
                            htmlFor={`delivery-gallery-${order.id}`}
                            className="btn-driver photo gallery"
                            style={{ cursor: 'pointer' }}
                          >
                            🖼️ Galeria
                          </label>
                          <input 
                            id={`delivery-gallery-${order.id}`} 
                            type="file" 
                            accept="image/*"
                            style={{ 
                              position: 'absolute', 
                              width: '1px', 
                              height: '1px', 
                              padding: 0, 
                              margin: '-1px', 
                              overflow: 'hidden', 
                              clip: 'rect(0,0,0,0)', 
                              whiteSpace: 'nowrap', 
                              border: 0 
                            }} 
                            onChange={(e) => handlePhotoCapture(order, 'delivery', e)} 
                          />
                        </div>
                        <button className="btn-driver signature" onClick={() => openSignatureModal(order)}>✍️ Podpis klienta</button>
                        {/* Rabat - kierowca widzi i edytuje tylko swój */}
                        {(order.platnosci?.doZaplaty > 0 || (order.rabatyKierowcow && order.rabatyKierowcow[user.id]?.kwota > 0) || order.rabatPrzyDostawie?.kwota > 0) && (() => {
                          // Pobierz rabat tego kierowcy (z moich produktów)
                          const myProductIndexes = order._myProductIndexes || [];
                          const mojRabatZProduktu = myProductIndexes.length > 0 && order.produkty
                            ? order.produkty.find((p, idx) => myProductIndexes.includes(idx) && p.rabat?.kwota > 0)?.rabat
                            : null;
                          const mojRabat = mojRabatZProduktu || (order.rabatyKierowcow?.[user.id]?.kwota > 0 ? order.rabatyKierowcow[user.id] : null) || (order.rabatPrzyDostawie?.kierowcaId === user.id && order.rabatPrzyDostawie?.kwota > 0 ? order.rabatPrzyDostawie : null);
                          return (
                            <button className="btn-driver discount" onClick={() => { 
                              setDiscountAmount(mojRabat?.kwota?.toString() || ''); 
                              setDiscountReason(mojRabat?.powod || ''); 
                              setShowDiscount(order); // Przekazuj całe order z _myProductIndexes
                            }}>
                              💸 {mojRabat ? 'Edytuj mój rabat' : 'Udziel rabatu'}
                            </button>
                          );
                        })()}
                        <button className="btn-driver notes" onClick={() => openNotes(order)}>📝 Uwagi</button>
                        <button className="btn-driver confirm" onClick={() => confirmDelivery(order)}>✔️ Potwierdź dostawę</button>
                        <button className="btn-driver back" onClick={() => changeStatus(order, 'odebrane')}>⬅️ Cofnij</button>
                        {(order.zdjeciaDostawy?.length > 0) && (
                          <button className="btn-driver photos-manage" onClick={() => setShowPhotoManager({ orderId: order.id, type: 'delivery' })}>🖼️ Zarządzaj zdjęciami</button>
                        )}
                      </>
                    )}
                    {activeTab === 'delivered' && (
                      <>
                        <div className="delivered-info">
                          ✔️ Dostarczono: {formatDateTime(order.potwierdzenieDostawy?.data)}
                        </div>
                        <button className="btn-driver back" onClick={() => changeStatus(order, 'w_transporcie')}>⬅️ Cofnij do transportu</button>
                      </>
                    )}
                  </div>

                  {/* Wyświetl info o rabacie TYLKO TEGO KIEROWCY */}
                  {(() => {
                    const myProductIndexes = order._myProductIndexes || [];
                    const mojRabatZProduktu = myProductIndexes.length > 0 && order.produkty
                      ? order.produkty.find((p, idx) => myProductIndexes.includes(idx) && p.rabat?.kwota > 0)?.rabat
                      : null;
                    const mojRabat = mojRabatZProduktu || (order.rabatyKierowcow?.[user.id]?.kwota > 0 ? order.rabatyKierowcow[user.id] : null) || (order.rabatPrzyDostawie?.kierowcaId === user.id && order.rabatPrzyDostawie?.kwota > 0 ? order.rabatPrzyDostawie : null);
                    if (mojRabat && mojRabat.kwota > 0) {
                      return (
                        <div className="discount-info-card">
                          <span className="discount-badge">💸 Mój rabat: {formatCurrency(mojRabat.kwota, order.platnosci?.waluta)}</span>
                          <span className="discount-reason">{mojRabat.powod}</span>
                          {mojRabat.podzamowienia && <span className="discount-suborders">({mojRabat.podzamowienia})</span>}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal uwag */}
      {showNotes && (
        <div className="modal-overlay">
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📝 Uwagi i daty</h2>
              <button className="btn-close" onClick={() => setShowNotes(null)}>×</button>
            </div>
            <div className="modal-body">
              {/* Info o produktach kierowcy */}
              {showNotes._myProductIndexes?.length > 0 && showNotes.produkty && (
                <div style={{background: '#EEF2FF', padding: '12px', borderRadius: '8px', marginBottom: '15px'}}>
                  <p style={{margin: 0, fontSize: '13px', color: '#4F46E5', fontWeight: '600'}}>
                    📦 Twoje produkty: {showNotes._myProductIndexes.map(idx => 
                      showNotes.produkty[idx]?.nrPodzamowienia || `#${idx+1}`
                    ).join(', ')}
                  </p>
                </div>
              )}
              <div className="form-group">
                <label>Szacowana data odbioru od producenta</label>
                <input type="date" value={estPickup} onChange={e => setEstPickup(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Szacowana data dostawy do klienta</label>
                <input type="date" value={estDelivery} onChange={e => setEstDelivery(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Uwagi</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Wpisz uwagi..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNotes(null)}>Anuluj</button>
              <button className="btn-primary" onClick={saveNotes}>💾 Zapisz</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rabatu - z możliwością edycji */}
      {showDiscount && (
        <div className="modal-overlay">
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>💸 Udziel rabatu</h2>
              <button className="btn-close" onClick={() => setShowDiscount(null)}>×</button>
            </div>
            <div className="modal-body">
              {(() => {
                // showDiscount to teraz obiekt order z _myProductIndexes
                const orderWithIndexes = showDiscount;
                const order = orders.find(o => o.id === orderWithIndexes?.id);
                if (!order) return <p>Nie znaleziono zamówienia</p>;
                
                const myProductIndexes = orderWithIndexes._myProductIndexes || [];
                const mojePodzamowienia = myProductIndexes.length > 0 && order.produkty
                  ? myProductIndexes.map(idx => order.produkty[idx]?.nrPodzamowienia || `#${idx+1}`).join(', ')
                  : null;
                
                // Pobierz istniejący rabat z moich produktów
                const mojRabatZProduktu = myProductIndexes.length > 0 && order.produkty
                  ? order.produkty.find((p, idx) => myProductIndexes.includes(idx) && p.rabat?.kwota > 0)?.rabat
                  : null;
                const existingDiscount = mojRabatZProduktu || (order.rabatyKierowcow?.[user.id]?.kwota > 0 ? order.rabatyKierowcow[user.id] : null);
                
                // Oblicz oryginalną kwotę do zapłaty
                const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
                const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
                const originalDoZaplaty = order.platnosci?.originalDoZaplaty || (cenaCalkowita - zaplacono);
                
                return (
                  <>
                    <div className="discount-order-info">
                      <p><strong>Zamówienie:</strong> {order.nrWlasny}</p>
                      {mojePodzamowienia && (
                        <p><strong>Podzamówienie:</strong> {mojePodzamowienia}</p>
                      )}
                      <p><strong>Cena całkowita:</strong> {formatCurrency(cenaCalkowita, order.platnosci?.waluta)}</p>
                      {zaplacono > 0 && (
                        <p><strong>Już zapłacono (zaliczka):</strong> {formatCurrency(zaplacono, order.platnosci?.waluta)} ✓</p>
                      )}
                      <p><strong>Do zapłaty (przed rabatem):</strong> {formatCurrency(originalDoZaplaty, order.platnosci?.waluta)}</p>
                    </div>
                    
                    {existingDiscount && (
                      <div className="existing-discount-info">
                        <h4>📝 Twój aktualny rabat:</h4>
                        <p>Kwota: {formatCurrency(existingDiscount.kwota, order.platnosci?.waluta)}</p>
                        <p>Powód: {existingDiscount.powod}</p>
                        <p>Data: {formatDateTime(existingDiscount.data)}</p>
                      </div>
                    )}
                    
                    <div className="form-group">
                      <label>Kwota rabatu ({order.platnosci?.waluta || 'PLN'})</label>
                      <input 
                        type="number" 
                        value={discountAmount} 
                        onChange={e => setDiscountAmount(e.target.value)} 
                        placeholder="0.00"
                        step="0.01"
                      />
                    </div>
                    <div className="form-group">
                      <label>Powód rabatu *</label>
                      <textarea 
                        value={discountReason} 
                        onChange={e => setDiscountReason(e.target.value)} 
                        rows={3} 
                        placeholder="Opisz powód rabatu (np. drobne uszkodzenie, rekompensata za opóźnienie...)"
                      />
                    </div>
                    <div className="discount-summary">
                      {(() => {
                        const nowyRabat = parseFloat(discountAmount) || 0;
                        const nowaKwota = Math.max(0, originalDoZaplaty - nowyRabat);
                        return (
                          <p>Nowa kwota do zapłaty: <strong>{formatCurrency(nowaKwota, order.platnosci?.waluta)}</strong></p>
                        );
                      })()}
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => { setShowDiscount(null); setDiscountAmount(''); setDiscountReason(''); }}>Anuluj</button>
              <button className="btn-primary" onClick={saveDiscount}>💸 Zatwierdź rabat</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal zarządzania zdjęciami */}
      {showPhotoManager && (
        <div className="modal-overlay">
          <div className="modal-content modal-medium" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🖼️ Zarządzaj zdjęciami {showPhotoManager.type === 'pickup' ? 'odbioru' : 'dostawy'}</h2>
              <button className="btn-close" onClick={() => setShowPhotoManager(null)}>×</button>
            </div>
            <div className="modal-body">
              {(() => {
                const order = orders.find(o => o.id === showPhotoManager.orderId);
                const photos = order?.[showPhotoManager.type === 'pickup' ? 'zdjeciaOdbioru' : 'zdjeciaDostawy'] || [];
                return (
                  <div className="photo-manager-grid">
                    {photos.length === 0 ? (
                      <div className="empty-photos">Brak zdjęć</div>
                    ) : (
                      photos.map((photo, index) => (
                        <div key={index} className="photo-manager-item">
                          <img src={photo.url} alt={`Zdjęcie ${index + 1}`} />
                          <div className="photo-manager-info">
                            <span>{formatDateTime(photo.timestamp)}</span>
                          </div>
                          <button 
                            className="photo-delete-btn" 
                            onClick={() => {
                              if (window.confirm('Czy na pewno chcesz usunąć to zdjęcie?')) {
                                deletePhoto(showPhotoManager.orderId, showPhotoManager.type, index);
                              }
                            }}
                          >
                            🗑️ Usuń
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowPhotoManager(null)}>Zamknij</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal podpisu */}
      {showSignature && (
        <div className="modal-overlay">
          <div className="modal-content modal-medium" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>✍️ Protokół odbioru towaru</h2>
              <button className="btn-close" onClick={() => { setShowSignature(null); setClientRemarks(''); }}>×</button>
            </div>
            <div className="modal-body">
              {(() => {
                // showSignature to teraz obiekt order z _myProductIndexes
                const orderWithIndexes = showSignature;
                const order = orders.find(o => o.id === orderWithIndexes.id);
                const myProductIndexes = orderWithIndexes._myProductIndexes || [];
                const mojePodzamowienia = myProductIndexes.length > 0 && order?.produkty
                  ? myProductIndexes.map(idx => order.produkty[idx]?.nrPodzamowienia || `#${idx+1}`).join(', ')
                  : null;
                const now = new Date();
                return order && (
                  <>
                    {/* Informacja o podzamówieniach */}
                    {mojePodzamowienia && (
                      <div className="protocol-suborders-info">
                        <strong>📦 Protokół dla:</strong> {mojePodzamowienia}
                      </div>
                    )}

                    {/* Wybór języka protokołu */}
                    <div className="form-group protocol-language-group">
                      <label>🌍 Język protokołu:</label>
                      <select 
                        value={protocolLanguage} 
                        onChange={e => setProtocolLanguage(e.target.value)}
                        className="protocol-language-select"
                      >
                        <option value="pl">🇵🇱 Polski</option>
                        <option value="en">🇬🇧 English (+ kopia PL)</option>
                        <option value="de">🇩🇪 Deutsch (+ kopia PL)</option>
                        <option value="es">🇪🇸 Español (+ kopia PL)</option>
                        <option value="nl">🇳🇱 Nederlands (+ kopia PL)</option>
                      </select>
                      {protocolLanguage !== 'pl' && (
                        <small className="protocol-info-small">📋 Protokół będzie zawierał 2 kopie</small>
                      )}
                    </div>

                    {/* Treść umowy */}
                    <div className="delivery-contract">
                      <div className="contract-header">
                        <h3>📋 PROTOKÓŁ ODBIORU TOWARU</h3>
                        <p className="contract-date">Data: {now.toLocaleDateString('pl-PL')} | Godzina: {now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      
                      <div className="contract-section">
                        <h4>📦 Dane zamówienia</h4>
                        <p><strong>Nr zamówienia:</strong> {order.nrWlasny}</p>
                        <p><strong>Produkt:</strong> {order.towar || 'brak opisu'}</p>
                        {order.platnosci?.cenaCalkowita > 0 && (
                          <p><strong>Wartość:</strong> {formatCurrency(order.platnosci.cenaCalkowita, order.platnosci.waluta)}</p>
                        )}
                      </div>

                      <div className="contract-section">
                        <h4>👤 Dane odbiorcy</h4>
                        <p><strong>Imię i nazwisko:</strong> {order.klient?.imie || '—'}</p>
                        <p><strong>Adres dostawy:</strong> {order.klient?.adres || '—'}</p>
                        <p><strong>Telefon:</strong> {order.klient?.telefon || '—'}</p>
                      </div>

                      <div className="contract-section">
                        <h4>🚚 Dane dostawy</h4>
                        <p><strong>Kierowca:</strong> {user.name}</p>
                        <p><strong>Data dostawy:</strong> {now.toLocaleDateString('pl-PL')}</p>
                        <p><strong>Godzina dostawy:</strong> {now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>

                      <div className="contract-declaration">
                        <p>
                          Ja, niżej podpisany/a, potwierdzam odbiór powyższego towaru. 
                          Towar został sprawdzony w obecności kierowcy.
                        </p>
                      </div>
                    </div>

                    {/* Uwagi klienta */}
                    <div className="form-group remarks-section">
                      <label>📝 Uwagi do produktu lub dostawy (opcjonalnie)</label>
                      <textarea 
                        value={clientRemarks} 
                        onChange={e => setClientRemarks(e.target.value)} 
                        rows={3} 
                        placeholder="Jeśli klient ma uwagi dotyczące produktu lub dostawy, wpisz je tutaj..."
                      />
                      {!clientRemarks && (
                        <div className="no-remarks-info">
                          ✅ Brak uwag = klient akceptuje produkt bez zastrzeżeń
                        </div>
                      )}
                    </div>

                    {/* Podpis */}
                    <div className="signature-section">
                      <label>✍️ Podpis klienta</label>
                      <div className="signature-container">
                        <canvas
                          ref={canvasRef}
                          width={340}
                          height={170}
                          className="signature-canvas"
                          onMouseDown={startDraw}
                          onMouseMove={draw}
                          onMouseUp={stopDraw}
                          onMouseLeave={stopDraw}
                          onTouchStart={startDraw}
                          onTouchMove={draw}
                          onTouchEnd={stopDraw}
                        />
                        <div className="signature-line">Podpis powyżej potwierdza odbiór towaru</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={clearCanvas}>🗑️ Wyczyść podpis</button>
              <button className="btn-secondary" onClick={() => { setShowSignature(null); setClientRemarks(''); }}>Anuluj</button>
              <button className="btn-primary" onClick={saveSignature}>✅ Zatwierdź i zapisz</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal wysyłania potwierdzenia dostawy */}
      {showDeliveryConfirmation && (
        <div className="modal-overlay">
          <div className="modal-content modal-medium delivery-confirmation-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header delivery-confirmation-header">
              <h2>📋 Potwierdzenie dostawy</h2>
              <button className="btn-close" onClick={() => setShowDeliveryConfirmation(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="delivery-confirm-info">
                <p><strong>Zamówienie:</strong> {showDeliveryConfirmation.nrWlasny}</p>
                <p><strong>Klient:</strong> {showDeliveryConfirmation.klient?.imie}</p>
                <p><strong>Email:</strong> {showDeliveryConfirmation.klient?.email || 'Brak'}</p>
                
                <div className="form-group" style={{marginTop: '16px'}}>
                  <label>Język dokumentu:</label>
                  <select 
                    value={deliveryEmailLanguage} 
                    onChange={e => setDeliveryEmailLanguage(e.target.value)}
                    className="protocol-language-select"
                  >
                    <option value="pl">🇵🇱 Polski</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="de">🇩🇪 Deutsch</option>
                    <option value="es">🇪🇸 Español</option>
                    <option value="nl">🇳🇱 Nederlands</option>
                  </select>
                </div>

                <div className="delivery-confirm-content">
                  <p>✅ Potwierdzenie dostawy</p>
                  <p>📋 Protokół odbioru towaru</p>
                  <p>💰 Podsumowanie płatności</p>
                  {showDeliveryConfirmation.zdjeciaDostawy?.length > 0 && (
                    <p>📸 {showDeliveryConfirmation.zdjeciaDostawy.length} zdjęć z dostawy</p>
                  )}
                  {showDeliveryConfirmation.podpisKlienta && (
                    <p>✍️ Podpis klienta</p>
                  )}
                </div>
                
                <p className="delivery-confirm-question">
                  Co chcesz zrobić z potwierdzeniem?
                </p>
              </div>
            </div>
            <div className="modal-footer delivery-actions-footer">
              <button className="btn-secondary" onClick={() => setShowDeliveryConfirmation(null)}>
                ❌ Anuluj
              </button>
              <button className="btn-print" onClick={() => printDeliveryConfirmation(showDeliveryConfirmation)}>
                🖨️ Drukuj
              </button>
              <button className="btn-download" onClick={() => downloadDeliveryConfirmation(showDeliveryConfirmation)}>
                📥 Pobierz PDF
              </button>
              {showDeliveryConfirmation.klient?.email && (
                <button className="btn-primary" onClick={() => sendDeliveryConfirmationEmail(showDeliveryConfirmation)}>
                  📧 Wyślij email
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal zmiany statusu - odebrane/w_transporcie */}
      {showStatusChangeEmail && (
        <div className="modal-overlay">
          <div className="modal-content modal-small status-change-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header status-change-header">
              <h2>📧 Powiadomić klienta?</h2>
              <button className="btn-close" onClick={() => setShowStatusChangeEmail(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="status-change-info">
                <p className="status-change-order">
                  <strong>Zamówienie:</strong> {showStatusChangeEmail.order?.nrWlasny}
                </p>
                <p className="status-change-client">
                  <strong>Klient:</strong> {showStatusChangeEmail.order?.klient?.imie}
                </p>
                <p className="status-change-email">
                  <strong>Email:</strong> {showStatusChangeEmail.order?.klient?.email}
                </p>
                
                <div className="form-group" style={{marginTop: '16px'}}>
                  <label>Język wiadomości:</label>
                  <select 
                    value={deliveryEmailLanguage} 
                    onChange={e => setDeliveryEmailLanguage(e.target.value)}
                    className="protocol-language-select"
                  >
                    <option value="pl">🇵🇱 Polski</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="de">🇩🇪 Deutsch</option>
                    <option value="es">🇪🇸 Español</option>
                    <option value="nl">🇳🇱 Nederlands</option>
                  </select>
                </div>
                
                <div className="status-change-visual">
                  <div className="status-old">
                    <span className="status-label">Poprzedni</span>
                    <span className="status-value">{showStatusChangeEmail.oldStatus}</span>
                  </div>
                  <div className="status-arrow">→</div>
                  <div className="status-new">
                    <span className="status-label">Nowy</span>
                    <span className="status-value">{showStatusChangeEmail.newStatus}</span>
                  </div>
                </div>
                
                <p className="status-change-question">
                  Czy chcesz wysłać email do klienta z informacją o zmianie statusu?
                </p>
              </div>
            </div>
            <div className="modal-footer status-change-footer">
              <button className="btn-secondary" onClick={() => setShowStatusChangeEmail(null)}>
                ❌ Nie
              </button>
              <button className="btn-primary" onClick={sendDriverStatusEmail}>
                ✅ Tak, wyślij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal zarządzania wyjazdami */}
      {showTripsModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-medium trips-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📅 Moje planowane wyjazdy</h2>
              <button className="btn-close" onClick={() => { setShowTripsModal(false); cancelEditTrip(); }}>×</button>
            </div>
            <div className="modal-body">
              {/* Formularz dodawania/edycji wyjazdu */}
              <div className={`add-trip-form ${editingTrip ? 'editing' : ''}`}>
                <h3>{editingTrip ? '✏️ Edytuj wyjazd' : '➕ Zaplanuj nowy wyjazd'}</h3>
                
                <div className="trip-form-section">
                  <label className="section-label">📦 Okres odbiorów</label>
                  <div className="date-range-row">
                    <div className="form-group">
                      <label>Od dnia *</label>
                      <input
                        type="date"
                        value={newPickupDateFrom}
                        onChange={e => setNewPickupDateFrom(e.target.value)}
                      />
                    </div>
                    <span className="date-separator">—</span>
                    <div className="form-group">
                      <label>Do dnia</label>
                      <input
                        type="date"
                        value={newPickupDateTo}
                        onChange={e => setNewPickupDateTo(e.target.value)}
                        min={newPickupDateFrom}
                      />
                    </div>
                  </div>
                </div>

                <div className="trip-form-section">
                  <label className="section-label">🚗 Wyjazd</label>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Data wyjazdu *</label>
                      <input
                        type="date"
                        value={newTripDate}
                        onChange={e => setNewTripDate(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Kierunek / Trasa</label>
                      <input
                        type="text"
                        value={newTripDestination}
                        onChange={e => setNewTripDestination(e.target.value)}
                        placeholder="np. Niemcy, Holandia, Belgia..."
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Uwagi (widoczne dla admina)</label>
                  <textarea
                    value={newTripNote}
                    onChange={e => setNewTripNote(e.target.value)}
                    placeholder="np. Tylko małe przesyłki, pełny załadunek, max 5 zamówień..."
                    rows={2}
                  />
                </div>
                <div className="trip-form-buttons">
                  {editingTrip && (
                    <button className="btn-secondary" onClick={cancelEditTrip}>
                      ✖️ Anuluj
                    </button>
                  )}
                  <button className="btn-primary" onClick={addTrip}>
                    {editingTrip ? '💾 Zapisz zmiany' : '➕ Dodaj wyjazd'}
                  </button>
                </div>
              </div>

              {/* Lista zaplanowanych wyjazdów */}
              <div className="trips-list">
                <h3>📋 Zaplanowane wyjazdy ({plannedTrips.length})</h3>
                {plannedTrips.length === 0 ? (
                  <div className="empty-trips">
                    <p>Brak zaplanowanych wyjazdów</p>
                  </div>
                ) : (
                  <div className="trips-items">
                    {plannedTrips.map(trip => {
                      const depDate = new Date(trip.departureDate || trip.date);
                      const todayDate = new Date();
                      todayDate.setHours(0,0,0,0);
                      const isPast = depDate < todayDate;
                      const isToday = depDate.toDateString() === todayDate.toDateString();
                      const isEditing = editingTrip?.id === trip.id;
                      
                      return (
                        <div key={trip.id} className={`trip-item-extended ${isPast ? 'past' : ''} ${isToday ? 'today' : ''} ${isEditing ? 'editing' : ''}`}>
                          <div className="trip-item-info-extended">
                            <div className="trip-info-row">
                              <span className="trip-info-label">📦 Odbiory:</span>
                              <span className="trip-info-value">
                                {formatDate(trip.pickupFrom || trip.date)}
                                {trip.pickupTo && trip.pickupTo !== trip.pickupFrom && (
                                  <> — {formatDate(trip.pickupTo)}</>
                                )}
                              </span>
                            </div>
                            <div className="trip-info-row highlight">
                              <span className="trip-info-label">🚗 Wyjazd:</span>
                              <span className="trip-info-value">
                                {isToday ? '🔴 DZIŚ' : formatDate(trip.departureDate || trip.date)}
                              </span>
                            </div>
                            <div className="trip-info-row">
                              <span className="trip-info-label">📍 Kierunek:</span>
                              <span className="trip-info-value">{trip.destination || 'Nieokreślony'}</span>
                            </div>
                            {trip.note && (
                              <div className="trip-info-row">
                                <span className="trip-info-label">📝 Uwagi:</span>
                                <span className="trip-info-value note">{trip.note}</span>
                              </div>
                            )}
                          </div>
                          <div className="trip-item-actions">
                            <button 
                              className="btn-edit-small"
                              onClick={() => startEditTrip(trip)}
                              title="Edytuj"
                            >
                              ✏️
                            </button>
                            <button 
                              className="btn-delete-small"
                              onClick={() => removeTrip(trip.id)}
                              title="Usuń"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => { setShowTripsModal(false); cancelEditTrip(); }}>Zamknij</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal stawek transportu */}
      {showTransportRatesModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-medium rates-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>💶 Moje stawki transportu</h2>
              <button className="btn-close" onClick={() => { setShowTransportRatesModal(false); setEditingRate(null); }}>×</button>
            </div>
            <div className="modal-body">
              {/* Formularz dodawania stawki */}
              <div className="add-rate-form">
                <h3>{editingRate ? '✏️ Edytuj stawkę' : '➕ Dodaj stawkę'}</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nazwa (np. Narożnik L, Sofa 3-os)</label>
                    <input
                      type="text"
                      value={newRate.name}
                      onChange={e => setNewRate({...newRate, name: e.target.value})}
                      placeholder="Typ towaru..."
                    />
                  </div>
                  <div className="form-group">
                    <label>Kraj</label>
                    <select value={newRate.country} onChange={e => setNewRate({...newRate, country: e.target.value})}>
                      {COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Typ ceny</label>
                    <select value={newRate.type} onChange={e => setNewRate({...newRate, type: e.target.value})}>
                      <option value="netto">Netto</option>
                      <option value="brutto">Brutto</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{newRate.type === 'netto' ? 'Cena netto' : 'Cena brutto'}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newRate.type === 'netto' ? newRate.priceNetto : newRate.priceBrutto}
                      onChange={e => {
                        if (newRate.type === 'netto') {
                          setNewRate({...newRate, priceNetto: e.target.value});
                        } else {
                          setNewRate({...newRate, priceBrutto: e.target.value});
                        }
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Waluta</label>
                    <select value={newRate.currency} onChange={e => setNewRate({...newRate, currency: e.target.value})}>
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rate-form-buttons">
                  {editingRate && (
                    <button className="btn-secondary" onClick={() => { setEditingRate(null); setNewRate({ name: '', priceNetto: '', priceBrutto: '', currency: 'EUR', country: 'DE', type: 'netto' }); }}>
                      ✖️ Anuluj
                    </button>
                  )}
                  <button className="btn-primary" onClick={saveTransportRate}>
                    {editingRate ? '💾 Zapisz' : '➕ Dodaj'}
                  </button>
                </div>
              </div>

              {/* Lista stawek */}
              <div className="rates-list">
                <h3>📋 Twoje stawki ({transportRates.length})</h3>
                {transportRates.length === 0 ? (
                  <div className="empty-rates">
                    <p>Brak stawek. Dodaj swoje stawki transportu.</p>
                  </div>
                ) : (
                  <div className="rates-items">
                    {transportRates.map(rate => {
                      const country = getCountry(rate.country);
                      const currency = CURRENCIES.find(c => c.code === rate.currency);
                      return (
                        <div key={rate.id} className="rate-item">
                          <div className="rate-item-info">
                            <span className="rate-name">{rate.name}</span>
                            <span className="rate-country">{country?.flag} {country?.name}</span>
                          </div>
                          <div className="rate-item-price">
                            <span className="rate-price-netto">{rate.priceNetto?.toFixed(2)} {currency?.symbol} netto</span>
                            <span className="rate-price-brutto">({rate.priceBrutto?.toFixed(2)} brutto)</span>
                          </div>
                          <div className="rate-item-actions">
                            <button 
                              className="btn-edit-small"
                              onClick={() => {
                                setEditingRate(rate);
                                setNewRate({
                                  name: rate.name,
                                  priceNetto: rate.priceNetto?.toString() || '',
                                  priceBrutto: rate.priceBrutto?.toString() || '',
                                  currency: rate.currency,
                                  country: rate.country,
                                  type: 'netto'
                                });
                              }}
                            >
                              ✏️
                            </button>
                            <button 
                              className="btn-delete-small"
                              onClick={() => removeTransportRate(rate.id)}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => { setShowTransportRatesModal(false); setEditingRate(null); }}>Zamknij</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rozliczeń kierowcy - pełny podgląd */}
      {showSettlementsModal && (
        <DriverSettlementsModal
          settlements={settlements.filter(s => s.driverId === user.id)}
          formatDate={formatDate}
          onClose={() => setShowSettlementsModal(false)}
        />
      )}
    </div>
  );
};

// Komponent modala rozliczeń dla kierowcy - z obsługą wielu walut i rabatów
const DriverSettlementsModal = ({ settlements, formatDate, onClose }) => {
  const [viewingSettlement, setViewingSettlement] = useState(null);

  const formatCurrency = (amount, currency = 'PLN') => {
    const symbols = { PLN: 'zł', EUR: '€', GBP: '£', USD: '$', CHF: 'CHF' };
    return `${(amount || 0).toFixed(2)} ${symbols[currency] || currency}`;
  };

  const getCurrencySymbol = (currency) => {
    const symbols = { PLN: 'zł', EUR: '€', GBP: '£', USD: '$', CHF: 'CHF' };
    return symbols[currency] || currency;
  };

  // Widok szczegółów rozliczenia
  if (viewingSettlement) {
    return (
      <div className="modal-overlay">
        <div className="modal-content modal-large driver-settlements-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>💰 Szczegóły rozliczenia</h2>
            <button className="btn-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <button className="btn-back" onClick={() => setViewingSettlement(null)}>
              ← Powrót do listy
            </button>

            <div className="driver-settlement-detail">
              <div className="detail-header-row">
                <div className="detail-title">
                  <h3>Rozliczenie z {formatDate(viewingSettlement.createdAt)}</h3>
                  <span className={`status-badge ${viewingSettlement.status}`}>
                    {viewingSettlement.status === 'utworzone' ? '🆕 Oczekuje na rozliczenie' : '✅ Rozliczone'}
                  </span>
                </div>
              </div>

              {/* Podsumowanie po walutach */}
              <div className="driver-currency-summary">
                <h4>💰 Do oddania</h4>
                {viewingSettlement.totalsByCurrency ? (
                  <div className="currency-totals-grid">
                    {Object.entries(viewingSettlement.totalsByCurrency).map(([currency, values]) => (
                      <div key={currency} className="currency-total-card">
                        <div className="currency-header">
                          <span className="currency-flag">
                            {currency === 'EUR' ? '🇪🇺' : currency === 'GBP' ? '🇬🇧' : currency === 'PLN' ? '🇵🇱' : '💱'}
                          </span>
                          <span className="currency-code">{currency}</span>
                        </div>
                        <div className="currency-row">
                          <span>Pobrano:</span>
                          <span className="value">{formatCurrency(values.collected, currency)}</span>
                        </div>
                        <div className="currency-row">
                          <span>Transport:</span>
                          <span className="value minus">- {formatCurrency(values.transport, currency)}</span>
                        </div>
                        <div className="currency-row total">
                          <span>Do oddania:</span>
                          <span className={`value ${values.toReturn >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(values.toReturn, currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Stary format - jedna waluta
                  <div className="driver-settlement-summary">
                    <div className="summary-card collected">
                      <span className="label">💵 Pobrano od klientów</span>
                      <span className="amount">{formatCurrency(viewingSettlement.totalCollected, viewingSettlement.currency)}</span>
                    </div>
                    <div className="summary-card transport">
                      <span className="label">🚚 Twój koszt transportu</span>
                      <span className="amount">- {formatCurrency(viewingSettlement.totalTransportCost, viewingSettlement.currency)}</span>
                    </div>
                    <div className="summary-card total">
                      <span className="label">💰 DO ODDANIA</span>
                      <span className="amount">{formatCurrency(viewingSettlement.totalToReturn, viewingSettlement.currency)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista zamówień */}
              <div className="driver-settlement-orders">
                <h4>📦 Zamówienia w tym rozliczeniu ({viewingSettlement.ordersCount})</h4>
                <div className="orders-grid">
                  {(viewingSettlement.orderDetails || []).map((order, idx) => (
                    <div key={idx} className="order-detail-card">
                      <div className="order-detail-header">
                        <span className="order-number">{order.nrWlasny}</span>
                        <span className="order-date">📅 Dostawa: {formatDate(order.dataDostawy)}</span>
                      </div>
                      <div className="order-detail-client">
                        <div className="client-name">👤 {order.klient || 'Brak danych'}</div>
                        {order.adres && <div className="client-address">📍 {order.adres}</div>}
                      </div>
                      {order.towar && (
                        <div className="order-detail-product">
                          📦 {order.towar.substring(0, 80)}{order.towar.length > 80 ? '...' : ''}
                        </div>
                      )}

                      {/* Informacja o rabacie */}
                      {order.hasDiscount && (
                        <div className="order-discount-section">
                          <div className="discount-header">🏷️ RABAT UDZIELONY</div>
                          <div className="discount-details">
                            <div className="discount-row">
                              <span>Cena oryginalna:</span>
                              <span className="strikethrough">{formatCurrency(order.originalPrice, order.walutaPobrano)}</span>
                            </div>
                            <div className="discount-row highlight">
                              <span>Rabat:</span>
                              <span className="discount-amount">-{formatCurrency(order.discountAmount, order.walutaPobrano)}</span>
                            </div>
                            <div className="discount-reason">
                              <span>Powód:</span> {order.discountReason}
                            </div>
                            {order.discountBy && (
                              <div className="discount-by">
                                <span>Udzielony przez:</span> {order.discountBy}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="order-detail-amounts">
                        <div className="amount-line">
                          <span>Pobrano od klienta:</span>
                          <span className="value">{formatCurrency(order.pobrano, order.walutaPobrano || viewingSettlement.currency)}</span>
                        </div>
                        <div className="amount-line">
                          <span>Twój transport:</span>
                          <span className="value transport">- {formatCurrency(order.transport, order.walutaTransport || viewingSettlement.currency)}</span>
                        </div>
                        {(order.walutaPobrano === order.walutaTransport || !order.walutaPobrano) && (
                          <div className="amount-line result">
                            <span>Do oddania:</span>
                            <span className={`value ${(order.pobrano - order.transport) >= 0 ? 'positive' : 'negative'}`}>
                              {formatCurrency(order.pobrano - order.transport, order.walutaPobrano || viewingSettlement.currency)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Historia */}
              {viewingSettlement.history && viewingSettlement.history.length > 0 && (
                <div className="driver-settlement-history">
                  <h4>📜 Historia rozliczenia</h4>
                  <div className="history-timeline">
                    {viewingSettlement.history.map((h, idx) => (
                      <div key={idx} className="history-entry">
                        <span className="history-date">{formatDate(h.date)}</span>
                        <span className="history-action">{h.action}</span>
                        <span className="history-user">przez {h.user}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={() => setViewingSettlement(null)}>Powrót do listy</button>
          </div>
        </div>
      </div>
    );
  }

  // Widok listy rozliczeń
  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large driver-settlements-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💰 Moje rozliczenia</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {settlements.length === 0 ? (
            <div className="empty-settlements">
              <div className="empty-icon">📭</div>
              <p>Brak rozliczeń</p>
              <p className="subtitle">Twoje rozliczenia pojawią się tutaj po utworzeniu przez administratora.</p>
            </div>
          ) : (
            <div className="driver-settlements-list">
              {settlements.map(settlement => (
                <div 
                  key={settlement.id} 
                  className="driver-settlement-card"
                  onClick={() => setViewingSettlement(settlement)}
                >
                  <div className="card-header">
                    <div className="card-date">📅 {formatDate(settlement.createdAt)}</div>
                    <span className={`status-badge ${settlement.status}`}>
                      {settlement.status === 'utworzone' ? '🆕 Oczekuje' : '✅ Rozliczone'}
                    </span>
                  </div>
                  
                  <div className="card-orders-count">
                    📦 {settlement.ordersCount} zamówień
                  </div>

                  {/* Podsumowanie po walutach */}
                  <div className="card-currency-summary">
                    {settlement.totalsByCurrency ? (
                      Object.entries(settlement.totalsByCurrency).map(([currency, values]) => (
                        <div key={currency} className="currency-summary-item">
                          <span className="currency-label">{getCurrencySymbol(currency)} Do oddania:</span>
                          <span className={`currency-value ${values.toReturn >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(values.toReturn, currency)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="currency-summary-item total">
                        <span className="currency-label">💰 Do oddania:</span>
                        <span className="currency-value">{formatCurrency(settlement.totalToReturn, settlement.currency)}</span>
                      </div>
                    )}
                  </div>

                  <div className="card-footer">
                    <span className="click-hint">Kliknij aby zobaczyć szczegóły zamówień →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL ZAINTERESOWANYCH KLIENTÓW (Leads)
// ============================================

const LEAD_STATUSES = [
  { id: 'nowy', name: 'Nowy', icon: '🆕', color: '#3B82F6', bgColor: '#DBEAFE' },
  { id: 'w_kontakcie', name: 'W kontakcie', icon: '💬', color: '#8B5CF6', bgColor: '#EDE9FE' },
  { id: 'zainteresowany', name: 'Zainteresowany', icon: '⭐', color: '#F59E0B', bgColor: '#FEF3C7' },
  { id: 'negocjacje', name: 'Negocjacje', icon: '🤝', color: '#10B981', bgColor: '#D1FAE5' },
  { id: 'zamowil', name: 'Zamówił', icon: '✅', color: '#059669', bgColor: '#A7F3D0' },
  { id: 'rezygnacja', name: 'Rezygnacja', icon: '❌', color: '#EF4444', bgColor: '#FEE2E2' },
  { id: 'pozniej', name: 'Wróci później', icon: '⏰', color: '#6B7280', bgColor: '#F3F4F6' }
];

const LEAD_SOURCES = [
  { id: 'facebook', name: 'Facebook', icon: '📘' },
  { id: 'instagram', name: 'Instagram', icon: '📸' },
  { id: 'telefon', name: 'Telefon', icon: '📞' },
  { id: 'email', name: 'Email', icon: '📧' },
  { id: 'polecenie', name: 'Polecenie', icon: '👥' },
  { id: 'inny', name: 'Inny', icon: '📍' }
];

const getLeadStatus = (id) => LEAD_STATUSES.find(s => s.id === id) || LEAD_STATUSES[0];
const getLeadSource = (id) => LEAD_SOURCES.find(s => s.id === id) || LEAD_SOURCES[0];

const LeadsPanel = ({ leads, onSave, onDelete, onClose, currentUser, onConvertToOrder, users, orders, onViewOrder }) => {
  const [view, setView] = useState('list'); // list, form, detail
  const [filter, setFilter] = useState('active'); // active, all, zamowil, rezygnacja, mine
  const [searchQuery, setSearchQuery] = useState('');
  const [editingLead, setEditingLead] = useState(null);
  const [viewingLead, setViewingLead] = useState(null);
  const [newNote, setNewNote] = useState('');
  const [formData, setFormData] = useState({
    imie: '',
    telefon: '',
    email: '',
    facebookUrl: '',
    zrodlo: 'facebook',
    produkty: '',
    szacowanaKwota: '',
    waluta: 'PLN',
    notatki: '',
    przypomnienie: '',
    priorytet: 'normalny',
    przypisanyDo: ''
  });

  // Pracownicy do przypisania (admin + pracownicy)
  const assignableUsers = (users || []).filter(u => ['admin', 'worker'].includes(u.role));

  const resetForm = () => {
    setFormData({
      imie: '', telefon: '', email: '', facebookUrl: '', zrodlo: 'facebook',
      produkty: '', szacowanaKwota: '', waluta: 'PLN', notatki: '', przypomnienie: '', 
      priorytet: 'normalny', przypisanyDo: ''
    });
    setEditingLead(null);
  };

  const openEditForm = (lead) => {
    setEditingLead(lead);
    setFormData({
      imie: lead.imie || '',
      telefon: lead.telefon || '',
      email: lead.email || '',
      facebookUrl: lead.facebookUrl || '',
      zrodlo: lead.zrodlo || 'facebook',
      produkty: lead.produkty || '',
      szacowanaKwota: lead.szacowanaKwota || '',
      waluta: lead.waluta || 'PLN',
      notatki: lead.notatki || '',
      przypomnienie: lead.przypomnienie || '',
      priorytet: lead.priorytet || 'normalny',
      przypisanyDo: lead.przypisanyDo || ''
    });
    setView('form');
  };

  const openDetailView = (lead) => {
    setViewingLead(lead);
    setNewNote('');
    setView('detail');
  };

  const handleSave = async () => {
    if (!formData.imie.trim()) {
      alert('Podaj imię/nazwę klienta');
      return;
    }

    if (editingLead) {
      await onSave({
        ...editingLead,
        ...formData,
        ostatniaAktualizacja: new Date().toISOString(),
        historia: [...(editingLead.historia || []), {
          data: new Date().toISOString(),
          uzytkownik: currentUser.name,
          akcja: 'Zaktualizowano dane'
        }]
      }, editingLead.id);
    } else {
      await onSave({
        ...formData,
        status: 'nowy',
        dataUtworzenia: new Date().toISOString(),
        ostatniaAktualizacja: new Date().toISOString(),
        utworzonePrzez: { id: currentUser.id, nazwa: currentUser.name },
        historia: [{ data: new Date().toISOString(), uzytkownik: currentUser.name, akcja: 'Utworzono' }],
        kontakty: []
      });
    }
    resetForm();
    setView('list');
  };

  const handleStatusChange = async (lead, newStatus) => {
    await onSave({
      ...lead,
      status: newStatus,
      ostatniaAktualizacja: new Date().toISOString(),
      historia: [...(lead.historia || []), {
        data: new Date().toISOString(),
        uzytkownik: currentUser.name,
        akcja: `Status: ${getLeadStatus(newStatus).name}`
      }]
    }, lead.id);
  };

  // Dodaj notatkę do historii kontaktów
  const addNote = async (lead) => {
    if (!newNote.trim()) return;
    
    const updatedLead = {
      ...lead,
      ostatniaAktualizacja: new Date().toISOString(),
      kontakty: [...(lead.kontakty || []), {
        id: Date.now(),
        data: new Date().toISOString(),
        notatka: newNote.trim(),
        autor: currentUser.name,
        autorId: currentUser.id
      }],
      historia: [...(lead.historia || []), {
        data: new Date().toISOString(),
        uzytkownik: currentUser.name,
        akcja: `Dodano notatkę: "${newNote.trim().substring(0, 50)}${newNote.length > 50 ? '...' : ''}"`
      }]
    };
    
    await onSave(updatedLead, lead.id);
    setNewNote('');
    setViewingLead(updatedLead);
  };

  // Przypisz do pracownika
  const assignToUser = async (lead, userId) => {
    const assignedUser = assignableUsers.find(u => u.id === userId);
    await onSave({
      ...lead,
      przypisanyDo: userId,
      ostatniaAktualizacja: new Date().toISOString(),
      historia: [...(lead.historia || []), {
        data: new Date().toISOString(),
        uzytkownik: currentUser.name,
        akcja: userId ? `Przypisano do: ${assignedUser?.name || userId}` : 'Usunięto przypisanie'
      }]
    }, lead.id);
  };

  // Konwertuj do zamówienia z zapisaniem powiązania
  const handleConvertToOrder = async (lead) => {
    // Oznacz jako zamówione
    await onSave({
      ...lead,
      status: 'zamowil',
      ostatniaAktualizacja: new Date().toISOString(),
      historia: [...(lead.historia || []), {
        data: new Date().toISOString(),
        uzytkownik: currentUser.name,
        akcja: 'Utworzono zamówienie'
      }]
    }, lead.id);
    
    // Przekaż do funkcji tworzenia zamówienia
    onConvertToOrder(lead);
  };

  // Pobierz powiązane zamówienie
  const getLinkedOrder = (lead) => {
    if (!orders || !lead) return null;
    // Szukaj po imieniu klienta lub po polu linkedLeadId
    return orders.find(o => 
      o.linkedLeadId === lead.id || 
      (lead.status === 'zamowil' && o.klient?.imie === lead.imie && 
       new Date(o.dataZlecenia) >= new Date(lead.dataUtworzenia))
    );
  };

  // Filtrowanie
  const filteredLeads = leads.filter(l => {
    if (filter === 'active' && ['zamowil', 'rezygnacja'].includes(l.status)) return false;
    if (filter === 'zamowil' && l.status !== 'zamowil') return false;
    if (filter === 'rezygnacja' && l.status !== 'rezygnacja') return false;
    if (filter === 'mine' && l.przypisanyDo !== currentUser.id) return false;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = [l.imie, l.telefon, l.email, l.produkty, l.notatki].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Sortuj po przypomnieniu (najbliższe najpierw), potem po priorytecie
    if (a.przypomnienie && !b.przypomnienie) return -1;
    if (!a.przypomnienie && b.przypomnienie) return 1;
    if (a.przypomnienie && b.przypomnienie) return new Date(a.przypomnienie) - new Date(b.przypomnienie);
    if (a.priorytet === 'wysoki' && b.priorytet !== 'wysoki') return -1;
    if (a.priorytet !== 'wysoki' && b.priorytet === 'wysoki') return 1;
    return new Date(b.ostatniaAktualizacja) - new Date(a.ostatniaAktualizacja);
  });

  // Statystyki
  const stats = {
    total: leads.length,
    active: leads.filter(l => !['zamowil', 'rezygnacja'].includes(l.status)).length,
    hot: leads.filter(l => l.priorytet === 'wysoki' && !['zamowil', 'rezygnacja'].includes(l.status)).length,
    converted: leads.filter(l => l.status === 'zamowil').length,
    mine: leads.filter(l => l.przypisanyDo === currentUser.id && !['zamowil', 'rezygnacja'].includes(l.status)).length,
    totalValue: leads.filter(l => !['rezygnacja'].includes(l.status)).reduce((sum, l) => sum + (parseFloat(l.szacowanaKwota) || 0), 0)
  };

  // Przypomnienia na dziś
  const todayReminders = leads.filter(l => {
    if (!l.przypomnienie || ['zamowil', 'rezygnacja'].includes(l.status)) return false;
    const today = new Date().toISOString().split('T')[0];
    return l.przypomnienie <= today;
  });

  // ========== LISTA ==========
  if (view === 'list') {
    return (
      <div className="modal-overlay">
        <div className="modal-content modal-xlarge" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🎯 Zainteresowani klienci ({stats.active} aktywnych)</h2>
            <button className="btn-close" onClick={onClose}>×</button>
          </div>

          <div className="leads-stats">
            <div className="lead-stat-card">
              <span className="lead-stat-icon">📊</span>
              <div className="lead-stat-content">
                <span className="lead-stat-value">{stats.total}</span>
                <span className="lead-stat-label">Wszystkich</span>
              </div>
            </div>
            <div className="lead-stat-card hot">
              <span className="lead-stat-icon">🔥</span>
              <div className="lead-stat-content">
                <span className="lead-stat-value">{stats.hot}</span>
                <span className="lead-stat-label">Gorących</span>
              </div>
            </div>
            <div className="lead-stat-card success">
              <span className="lead-stat-icon">✅</span>
              <div className="lead-stat-content">
                <span className="lead-stat-value">{stats.converted}</span>
                <span className="lead-stat-label">Zamówiło</span>
              </div>
            </div>
            <div className="lead-stat-card value">
              <span className="lead-stat-icon">💰</span>
              <div className="lead-stat-content">
                <span className="lead-stat-value">{formatCurrency(stats.totalValue, 'PLN')}</span>
                <span className="lead-stat-label">Potencjał</span>
              </div>
            </div>
          </div>

          {todayReminders.length > 0 && (
            <div className="leads-reminders-bar">
              <span className="reminder-icon">⏰</span>
              <span>Masz <strong>{todayReminders.length}</strong> przypomnienie(ń) na dziś!</span>
            </div>
          )}

          <div className="leads-toolbar">
            <div className="leads-filters">
              <button className={`filter-chip ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>
                🎯 Aktywni ({stats.active})
              </button>
              <button className={`filter-chip ${filter === 'mine' ? 'active' : ''}`} onClick={() => setFilter('mine')}>
                👤 Moje ({stats.mine})
              </button>
              <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                📋 Wszyscy ({stats.total})
              </button>
              <button className={`filter-chip ${filter === 'zamowil' ? 'active' : ''}`} onClick={() => setFilter('zamowil')}>
                ✅ Zamówili ({stats.converted})
              </button>
              <button className={`filter-chip ${filter === 'rezygnacja' ? 'active' : ''}`} onClick={() => setFilter('rezygnacja')}>
                ❌ Rezygnacja
              </button>
            </div>
            <div className="leads-search">
              <input 
                type="text" 
                placeholder="🔍 Szukaj..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
              />
            </div>
            <button className="btn-primary" onClick={() => { resetForm(); setView('form'); }}>➕ Dodaj</button>
          </div>

          <div className="modal-body">
            {filteredLeads.length === 0 ? (
              <div className="empty-state small">
                <div className="empty-icon">🎯</div>
                <p>Brak zainteresowanych klientów</p>
              </div>
            ) : (
              <div className="leads-grid">
                {filteredLeads.map(lead => {
                  const status = getLeadStatus(lead.status);
                  const source = getLeadSource(lead.zrodlo);
                  const hasReminder = lead.przypomnienie && lead.przypomnienie <= new Date().toISOString().split('T')[0];
                  const assignedUser = assignableUsers.find(u => u.id === lead.przypisanyDo);
                  const linkedOrder = getLinkedOrder(lead);
                  
                  return (
                    <div key={lead.id} className={`lead-card ${hasReminder ? 'has-reminder' : ''} ${lead.priorytet === 'wysoki' ? 'hot' : ''}`}>
                      <div className="lead-card-header">
                        <div className="lead-card-title">
                          <span className="lead-name">{lead.imie}</span>
                          {lead.priorytet === 'wysoki' && <span className="hot-badge">🔥</span>}
                        </div>
                        <select 
                          value={lead.status} 
                          onChange={e => handleStatusChange(lead, e.target.value)}
                          className="lead-status-select"
                          style={{ background: status.bgColor, color: status.color }}
                          onClick={e => e.stopPropagation()}
                        >
                          {LEAD_STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                        </select>
                      </div>

                      <div className="lead-card-body" onClick={() => openDetailView(lead)}>
                        <div className="lead-source">
                          <span>{source.icon} {source.name}</span>
                          {lead.szacowanaKwota && (
                            <span className="lead-value">💰 {formatCurrency(parseFloat(lead.szacowanaKwota), lead.waluta)}</span>
                          )}
                        </div>
                        
                        {lead.produkty && <p className="lead-products">📦 {lead.produkty}</p>}
                        
                        <div className="lead-contacts">
                          {lead.telefon && <a href={`tel:${lead.telefon}`} onClick={e => e.stopPropagation()}>📞 {lead.telefon}</a>}
                          {lead.facebookUrl && (
                            <a href={lead.facebookUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                              📘 Facebook
                            </a>
                          )}
                        </div>

                        {/* Przypisany pracownik */}
                        {assignedUser && (
                          <div className="lead-assigned">
                            👤 Przypisany: <strong>{assignedUser.name}</strong>
                          </div>
                        )}

                        {/* Powiązane zamówienie */}
                        {linkedOrder && (
                          <div 
                            className="lead-linked-order" 
                            onClick={(e) => { e.stopPropagation(); onViewOrder && onViewOrder(linkedOrder); }}
                          >
                            📦 Zamówienie: <strong>{linkedOrder.nrWlasny}</strong>
                            <span className="view-order-hint">👁️ Kliknij by zobaczyć</span>
                          </div>
                        )}

                        {hasReminder && (
                          <div className="lead-reminder-badge">
                            ⏰ Przypomnienie: {formatDate(lead.przypomnienie)}
                          </div>
                        )}

                        {lead.kontakty?.length > 0 && (
                          <div className="lead-last-contact">
                            💬 Ostatni kontakt: {formatDate(lead.kontakty[lead.kontakty.length - 1].data)}
                            <span className="contact-count">({lead.kontakty.length} notatek)</span>
                          </div>
                        )}
                      </div>

                      <div className="lead-card-footer">
                        <div className="lead-footer-info">
                          <span>📅 {formatDate(lead.dataUtworzenia)}</span>
                          <span>👤 {lead.utworzonePrzez?.nazwa}</span>
                        </div>
                        <div className="lead-actions">
                          <button className="btn-icon" onClick={() => openDetailView(lead)} title="Szczegóły">👁️</button>
                          <button className="btn-icon" onClick={() => openEditForm(lead)} title="Edytuj">✏️</button>
                          {lead.status !== 'zamowil' && (
                            <button className="btn-icon btn-success-small" onClick={() => handleConvertToOrder(lead)} title="Utwórz zamówienie">📦</button>
                          )}
                          <button className="btn-icon btn-delete-small" onClick={() => { if(window.confirm('Usunąć?')) onDelete(lead.id); }} title="Usuń">🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== WIDOK SZCZEGÓŁOWY ==========
  if (view === 'detail' && viewingLead) {
    const status = getLeadStatus(viewingLead.status);
    const source = getLeadSource(viewingLead.zrodlo);
    const linkedOrder = getLinkedOrder(viewingLead);

    return (
      <div className="modal-overlay">
        <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>👤 {viewingLead.imie}</h2>
              <span className="status-badge" style={{ background: status.bgColor, color: status.color }}>
                {status.icon} {status.name}
              </span>
            </div>
            <button className="btn-close" onClick={() => setView('list')}>×</button>
          </div>

          <div className="modal-body">
            {/* Informacje podstawowe */}
            <div className="lead-detail-grid">
              <div className="lead-detail-section">
                <h3>📋 Dane kontaktowe</h3>
                <p><strong>Telefon:</strong> {viewingLead.telefon || '—'}</p>
                <p><strong>Email:</strong> {viewingLead.email || '—'}</p>
                <p><strong>Facebook:</strong> {viewingLead.facebookUrl ? (
                  <a href={viewingLead.facebookUrl} target="_blank" rel="noopener noreferrer">Otwórz 📘</a>
                ) : '—'}</p>
                <p><strong>Źródło:</strong> {source.icon} {source.name}</p>
              </div>
              
              <div className="lead-detail-section">
                <h3>💰 Informacje handlowe</h3>
                <p><strong>Zainteresowany:</strong> {viewingLead.produkty || '—'}</p>
                <p><strong>Szacowana kwota:</strong> {viewingLead.szacowanaKwota ? formatCurrency(parseFloat(viewingLead.szacowanaKwota), viewingLead.waluta) : '—'}</p>
                <p><strong>Priorytet:</strong> {viewingLead.priorytet === 'wysoki' ? '🔥 Wysoki' : viewingLead.priorytet === 'niski' ? '🟢 Niski' : '🟡 Normalny'}</p>
                <p><strong>Przypomnienie:</strong> {viewingLead.przypomnienie ? formatDate(viewingLead.przypomnienie) : '—'}</p>
              </div>
            </div>

            {/* Przypisanie do pracownika */}
            <div className="lead-detail-section assignment-section">
              <h3>👤 Przypisanie</h3>
              <div className="assignment-row">
                <span>Przypisany do:</span>
                <select 
                  value={viewingLead.przypisanyDo || ''} 
                  onChange={e => {
                    assignToUser(viewingLead, e.target.value);
                    setViewingLead({...viewingLead, przypisanyDo: e.target.value});
                  }}
                  className="assignment-select"
                >
                  <option value="">-- Nieprzypisany --</option>
                  {assignableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'Admin' : 'Pracownik'})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Powiązane zamówienie */}
            {linkedOrder && (
              <div className="lead-detail-section linked-order-section">
                <h3>📦 Powiązane zamówienie</h3>
                <div className="linked-order-card" onClick={() => onViewOrder && onViewOrder(linkedOrder)}>
                  <div className="linked-order-header">
                    <span className="order-number">{linkedOrder.nrWlasny}</span>
                    <span className="order-status" style={{ background: getStatus(linkedOrder.status).bgColor, color: getStatus(linkedOrder.status).color }}>
                      {getStatus(linkedOrder.status).icon} {getStatus(linkedOrder.status).name}
                    </span>
                  </div>
                  <p><strong>Produkt:</strong> {linkedOrder.towar}</p>
                  <p><strong>Wartość:</strong> {formatCurrency(linkedOrder.platnosci?.cenaCalkowita, linkedOrder.platnosci?.waluta)}</p>
                  <button className="btn-view-order">👁️ Zobacz szczegóły zamówienia</button>
                </div>
              </div>
            )}

            {/* Dodawanie notatki */}
            <div className="lead-detail-section notes-section">
              <h3>📝 Dodaj notatkę</h3>
              <div className="add-note-form">
                <textarea 
                  value={newNote} 
                  onChange={e => setNewNote(e.target.value)} 
                  rows={3} 
                  placeholder="Wpisz notatkę z rozmowy z klientem..."
                />
                <button 
                  className="btn-primary" 
                  onClick={() => addNote(viewingLead)}
                  disabled={!newNote.trim()}
                >
                  💾 Zapisz notatkę
                </button>
              </div>
            </div>

            {/* Historia kontaktów / notatek */}
            <div className="lead-detail-section">
              <h3>💬 Historia kontaktów ({viewingLead.kontakty?.length || 0})</h3>
              {(!viewingLead.kontakty || viewingLead.kontakty.length === 0) ? (
                <p className="empty-notes">Brak notatek. Dodaj pierwszą notatkę powyżej.</p>
              ) : (
                <div className="contacts-timeline">
                  {[...(viewingLead.kontakty || [])].reverse().map(c => (
                    <div key={c.id} className="contact-item">
                      <div className="contact-header">
                        <span className="contact-date">{formatDateTime(c.data)}</span>
                        <span className="contact-author">👤 {c.autor}</span>
                      </div>
                      <p className="contact-note">{c.notatka}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historia zmian */}
            {viewingLead.historia?.length > 0 && (
              <div className="lead-detail-section">
                <h3>📜 Historia zmian</h3>
                <div className="history-timeline">
                  {[...(viewingLead.historia || [])].reverse().map((h, i) => (
                    <div key={i} className="history-item">
                      <span className="history-date">{formatDateTime(h.data)}</span>
                      <span className="history-user">{h.uzytkownik}</span>
                      <span className="history-action">{h.akcja}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn-secondary" onClick={() => setView('list')}>← Wróć do listy</button>
            <button className="btn-primary" onClick={() => openEditForm(viewingLead)}>✏️ Edytuj</button>
            {viewingLead.status !== 'zamowil' && (
              <button className="btn-success" onClick={() => handleConvertToOrder(viewingLead)}>📦 Utwórz zamówienie</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== FORMULARZ ==========
  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingLead ? '✏️ Edytuj klienta' : '➕ Nowy zainteresowany'}</h2>
          <button className="btn-close" onClick={() => { resetForm(); setView('list'); }}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label>IMIĘ / NAZWA *</label>
              <input value={formData.imie} onChange={e => setFormData({...formData, imie: e.target.value})} placeholder="Jan Kowalski" />
            </div>
            <div className="form-group">
              <label>ŹRÓDŁO</label>
              <select value={formData.zrodlo} onChange={e => setFormData({...formData, zrodlo: e.target.value})}>
                {LEAD_SOURCES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>TELEFON</label>
              <input value={formData.telefon} onChange={e => setFormData({...formData, telefon: e.target.value})} placeholder="+48 123 456 789" />
            </div>
            <div className="form-group">
              <label>EMAIL</label>
              <input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="email@example.com" />
            </div>
            <div className="form-group full">
              <label>LINK DO FACEBOOK / MESSENGER</label>
              <input value={formData.facebookUrl} onChange={e => setFormData({...formData, facebookUrl: e.target.value})} placeholder="https://facebook.com/..." />
            </div>
            <div className="form-group full">
              <label>CZYM JEST ZAINTERESOWANY</label>
              <textarea value={formData.produkty} onChange={e => setFormData({...formData, produkty: e.target.value})} rows={3} placeholder="Opisz produkty, które interesują klienta..." />
            </div>
            <div className="form-group">
              <label>SZACOWANA KWOTA</label>
              <input type="number" value={formData.szacowanaKwota} onChange={e => setFormData({...formData, szacowanaKwota: e.target.value})} placeholder="0" />
            </div>
            <div className="form-group">
              <label>WALUTA</label>
              <select value={formData.waluta} onChange={e => setFormData({...formData, waluta: e.target.value})}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>PRIORYTET</label>
              <select value={formData.priorytet} onChange={e => setFormData({...formData, priorytet: e.target.value})}>
                <option value="niski">🟢 Niski</option>
                <option value="normalny">🟡 Normalny</option>
                <option value="wysoki">🔴 Wysoki (gorący lead)</option>
              </select>
            </div>
            <div className="form-group">
              <label>PRZYPISZ DO</label>
              <select value={formData.przypisanyDo} onChange={e => setFormData({...formData, przypisanyDo: e.target.value})}>
                <option value="">-- Nieprzypisany --</option>
                {assignableUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'Admin' : 'Pracownik'})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>PRZYPOMNIENIE</label>
              <input type="date" value={formData.przypomnienie} onChange={e => setFormData({...formData, przypomnienie: e.target.value})} />
            </div>
            <div className="form-group full">
              <label>NOTATKI</label>
              <textarea value={formData.notatki} onChange={e => setFormData({...formData, notatki: e.target.value})} rows={3} placeholder="Dodatkowe informacje..." />
            </div>
          </div>

          {editingLead && editingLead.kontakty?.length > 0 && (
            <div className="form-section">
              <h3>💬 Historia kontaktów</h3>
              <div className="contacts-timeline">
                {editingLead.kontakty.map(c => (
                  <div key={c.id} className="contact-item">
                    <span className="contact-date">{formatDateTime(c.data)}</span>
                    <span className="contact-author">{c.autor}</span>
                    <p className="contact-note">{c.notatka}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => { resetForm(); setView('list'); }}>← Wróć</button>
          <button className="btn-primary" onClick={handleSave}>
            {editingLead ? '💾 Zapisz zmiany' : '✅ Dodaj klienta'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL STATYSTYK MIESIĘCZNYCH (tylko admin)
// ============================================

// ============================================
// STATYSTYKI KONTRAHENTA - UPROSZCZONE
// ============================================

const ContractorStatisticsPanel = ({ orders, exchangeRates, onClose, user }) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  // Konwersja do PLN
  const convertToPLN = (amount, currency) => {
    if (!amount || currency === 'PLN' || !exchangeRates) return amount || 0;
    return (amount || 0) * (exchangeRates[currency] || 1);
  };

  // Tylko zamówienia kontrahenta
  const myOrders = orders.filter(o => o.kontrahentId === user?.id);

  // Oblicz obrót z tablicy zamówień (tylko brutto - bez marży!)
  const calcRevenueFromOrders = (ordersList) => {
    let obrotBrutto = 0;
    let zaplacono = 0;
    let doZaplaty = 0;
    
    ordersList.forEach(order => {
      const cenaBrutto = order.platnosci?.cenaCalkowita || 0;
      const cenaBruttoPLN = convertToPLN(cenaBrutto, order.platnosci?.waluta);
      obrotBrutto += cenaBruttoPLN;
      
      const zaplata = order.platnosci?.zaplacono || 0;
      zaplacono += convertToPLN(zaplata, order.platnosci?.waluta);
      
      const pozostalo = order.platnosci?.doZaplaty || 0;
      doZaplaty += convertToPLN(pozostalo, order.platnosci?.waluta);
    });

    return {
      zamowienia: ordersList.length,
      obrotBrutto: Math.round(obrotBrutto * 100) / 100,
      zaplacono: Math.round(zaplacono * 100) / 100,
      doZaplaty: Math.round(doZaplaty * 100) / 100
    };
  };

  // Statystyki dla miesiąca
  const getMonthStats = (month) => {
    const monthOrders = myOrders.filter(o => {
      const date = new Date(o.dataZlecenia || o.utworzonePrzez?.data);
      return date.getFullYear() === selectedYear && date.getMonth() === month;
    });
    return calcRevenueFromOrders(monthOrders);
  };

  // Statystyki roczne
  const yearOrders = myOrders.filter(o => {
    const date = new Date(o.dataZlecenia || o.utworzonePrzez?.data);
    return date.getFullYear() === selectedYear;
  });
  const yearStats = calcRevenueFromOrders(yearOrders);

  // Dostępne lata
  const years = [...new Set(myOrders.map(o => {
    const date = new Date(o.dataZlecenia || o.utworzonePrzez?.data);
    return date.getFullYear();
  }))].sort((a, b) => b - a);

  if (years.length === 0) years.push(new Date().getFullYear());

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-xlarge" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>📊 Moje statystyki</h2>
            <p className="modal-subtitle">Podsumowanie Twoich zamówień</p>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body statistics-body">
          {/* Filtr roku */}
          <div className="stats-filters">
            <div className="filter-group">
              <label>📅 Rok:</label>
              <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Podsumowanie roczne */}
          <div className="stats-summary contractor-summary">
            <div className="summary-card">
              <div className="summary-icon">📦</div>
              <div className="summary-value">{yearStats.zamowienia}</div>
              <div className="summary-label">Zamówień w {selectedYear}</div>
            </div>
            <div className="summary-card highlight">
              <div className="summary-icon">💰</div>
              <div className="summary-value">{formatCurrency(yearStats.obrotBrutto, 'PLN')}</div>
              <div className="summary-label">Obrót brutto</div>
            </div>
            <div className="summary-card success">
              <div className="summary-icon">✅</div>
              <div className="summary-value">{formatCurrency(yearStats.zaplacono, 'PLN')}</div>
              <div className="summary-label">Zapłacono</div>
            </div>
            <div className="summary-card warning">
              <div className="summary-icon">⏳</div>
              <div className="summary-value">{formatCurrency(yearStats.doZaplaty, 'PLN')}</div>
              <div className="summary-label">Do zapłaty</div>
            </div>
          </div>

          {/* Tabela miesięczna */}
          <div className="stats-table-container">
            <h3>📅 Zestawienie miesięczne</h3>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Miesiąc</th>
                  <th>Zamówień</th>
                  <th>Obrót brutto</th>
                  <th>Zapłacono</th>
                  <th>Do zapłaty</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((name, idx) => {
                  const stats = getMonthStats(idx);
                  if (stats.zamowienia === 0) return null;
                  return (
                    <tr key={idx}>
                      <td><strong>{name}</strong></td>
                      <td>{stats.zamowienia}</td>
                      <td>{formatCurrency(stats.obrotBrutto, 'PLN')}</td>
                      <td className="text-success">{formatCurrency(stats.zaplacono, 'PLN')}</td>
                      <td className={stats.doZaplaty > 0 ? 'text-danger' : ''}>{formatCurrency(stats.doZaplaty, 'PLN')}</td>
                    </tr>
                  );
                })}
                {yearStats.zamowienia === 0 && (
                  <tr>
                    <td colSpan="5" className="text-center">Brak zamówień w {selectedYear}</td>
                  </tr>
                )}
              </tbody>
              {yearStats.zamowienia > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td><strong>RAZEM {selectedYear}</strong></td>
                    <td><strong>{yearStats.zamowienia}</strong></td>
                    <td><strong>{formatCurrency(yearStats.obrotBrutto, 'PLN')}</strong></td>
                    <td className="text-success"><strong>{formatCurrency(yearStats.zaplacono, 'PLN')}</strong></td>
                    <td className={yearStats.doZaplaty > 0 ? 'text-danger' : ''}><strong>{formatCurrency(yearStats.doZaplaty, 'PLN')}</strong></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// STATYSTYKI - PEŁNE (dla admina)
// ============================================

const StatisticsPanel = ({ orders, exchangeRates, onClose, users }) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [countryFilter, setCountryFilter] = useState('all');
  const [creatorFilter, setCreatorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // NOWY FILTR STATUSU
  const [activeTab, setActiveTab] = useState('monthly'); // monthly, countries, creators
  
  const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  // Dostępne statusy do filtrowania
  const STATUS_OPTIONS = [
    { id: 'all', name: 'Wszystkie statusy' },
    { id: 'dostarczone', name: '✔️ Dostarczone' },
    { id: 'w_transporcie', name: '🚚 W transporcie' },
    { id: 'odebrane', name: '📦 Odebrane' },
    { id: 'gotowe_do_odbioru', name: '✅ Gotowe do odbioru' },
    { id: 'w_produkcji', name: '🔨 W produkcji' },
    { id: 'potwierdzone', name: '📋 Potwierdzone' },
    { id: 'nowe', name: '🆕 Nowe' },
    { id: 'wstrzymane', name: '⏸️ Wstrzymane' },
    { id: 'anulowane', name: '❌ Anulowane' }
  ];

  // Konwersja do PLN
  const convertToPLN = (amount, currency) => {
    if (!amount || currency === 'PLN' || !exchangeRates) return amount || 0;
    return (amount || 0) * (exchangeRates[currency] || 1);
  };

  // Filtruj zamówienia
  const getFilteredOrders = () => {
    return orders.filter(o => {
      const date = new Date(o.dataZlecenia || o.utworzonePrzez?.data);
      if (date.getFullYear() !== selectedYear) return false;
      if (countryFilter !== 'all' && o.kraj !== countryFilter) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false; // FILTR STATUSU
      if (creatorFilter !== 'all') {
        const creatorId = o.utworzonePrzez?.oddzial || o.kontrahentId;
        if (creatorId !== creatorFilter) return false;
      }
      return true;
    });
  };

  // Oblicz statystyki z tablicy zamówień - Z UWZGLĘDNIENIEM RABATÓW
  const calcStatsFromOrders = (ordersList) => {
    let obrotBrutto = 0;
    let obrotNetto = 0;
    let kosztTowaru = 0;
    let kosztTransportu = 0;
    let sumaRabatow = 0; // SUMA RABATÓW
    
    ordersList.forEach(order => {
      const vatRate = order.koszty?.vatRate || 23;
      const vatMultiplier = 1 + vatRate / 100;
      
      const cenaBrutto = order.platnosci?.cenaCalkowita || 0;
      const cenaBruttoPLN = convertToPLN(cenaBrutto, order.platnosci?.waluta);
      obrotBrutto += cenaBruttoPLN;
      obrotNetto += cenaBruttoPLN / vatMultiplier;
      
      const zakupNetto = order.koszty?.zakupNetto || 0;
      kosztTowaru += convertToPLN(zakupNetto, order.koszty?.waluta);
      
      const transportNetto = order.koszty?.transportNetto || 0;
      kosztTransportu += convertToPLN(transportNetto, order.koszty?.transportWaluta);
      
      // Dodaj rabat jeśli był udzielony
      if (order.rabatPrzyDostawie?.kwota > 0) {
        const rabatBrutto = order.rabatPrzyDostawie.kwota;
        const rabatNetto = rabatBrutto / vatMultiplier;
        const rabatPLN = convertToPLN(rabatNetto, order.platnosci?.waluta);
        sumaRabatow += rabatPLN;
      }
    });

    // Marża = Obrót netto - Koszty towaru - Koszty transportu - Rabaty
    const marza = obrotNetto - kosztTowaru - kosztTransportu - sumaRabatow;
    const marzaProc = obrotNetto > 0 ? (marza / obrotNetto * 100) : 0;

    return {
      zamowienia: ordersList.length,
      obrotBrutto: Math.round(obrotBrutto * 100) / 100,
      obrotNetto: Math.round(obrotNetto * 100) / 100,
      kosztTowaru: Math.round(kosztTowaru * 100) / 100,
      kosztTransportu: Math.round(kosztTransportu * 100) / 100,
      sumaRabatow: Math.round(sumaRabatow * 100) / 100, // NOWE POLE
      marza: Math.round(marza * 100) / 100,
      marzaProc: Math.round(marzaProc * 10) / 10
    };
  };

  // Oblicz statystyki dla miesiąca
  const getMonthStats = (month) => {
    const filteredOrders = getFilteredOrders();
    const monthOrders = filteredOrders.filter(o => {
      const date = new Date(o.dataZlecenia || o.utworzonePrzez?.data);
      return date.getMonth() === month;
    });
    return calcStatsFromOrders(monthOrders);
  };

  // Dane dla wszystkich miesięcy
  const monthlyData = MONTHS.map((name, index) => ({
    name,
    shortName: name.substring(0, 3),
    ...getMonthStats(index)
  }));

  // Podsumowanie roczne (z filtrami)
  const yearSummary = calcStatsFromOrders(getFilteredOrders());

  // Statystyki po krajach
  const getCountryStats = () => {
    const filteredOrders = getFilteredOrders();
    const countryMap = {};
    
    filteredOrders.forEach(o => {
      const kraj = o.kraj || 'PL';
      if (!countryMap[kraj]) countryMap[kraj] = [];
      countryMap[kraj].push(o);
    });

    return Object.entries(countryMap)
      .map(([kod, ordersList]) => {
        const country = COUNTRIES.find(c => c.code === kod) || { code: kod, name: kod, flag: '🏳️' };
        return {
          kod,
          name: country.name,
          flag: country.flag,
          ...calcStatsFromOrders(ordersList)
        };
      })
      .sort((a, b) => b.obrotNetto - a.obrotNetto);
  };

  // Statystyki po twórcach (pracownikach/kontrahentach)
  const getCreatorStats = () => {
    const filteredOrders = getFilteredOrders();
    const creatorMap = {};
    
    filteredOrders.forEach(o => {
      const creatorId = o.utworzonePrzez?.oddzial || o.kontrahentId || 'unknown';
      const creatorName = o.utworzonePrzez?.nazwa || 'Nieznany';
      if (!creatorMap[creatorId]) {
        creatorMap[creatorId] = { name: creatorName, orders: [] };
      }
      creatorMap[creatorId].orders.push(o);
    });

    return Object.entries(creatorMap)
      .map(([id, data]) => ({
        id,
        name: data.name,
        ...calcStatsFromOrders(data.orders)
      }))
      .sort((a, b) => b.obrotNetto - a.obrotNetto);
  };

  const countryStats = getCountryStats();
  const creatorStats = getCreatorStats();

  // Maksymalna wartość dla wykresu
  const maxValue = Math.max(...monthlyData.map(m => m.obrotNetto), 1);

  // Dostępne lata
  const years = [...new Set(orders.map(o => new Date(o.dataZlecenia || o.utworzonePrzez?.data).getFullYear()))].sort((a, b) => b - a);
  if (!years.includes(selectedYear)) years.unshift(selectedYear);

  // Dostępne kraje
  const availableCountries = [...new Set(orders.map(o => o.kraj || 'PL'))];

  // Dostępni twórcy
  const availableCreators = [...new Set(orders.map(o => ({
    id: o.utworzonePrzez?.oddzial || o.kontrahentId || 'unknown',
    name: o.utworzonePrzez?.nazwa || 'Nieznany'
  })).map(c => JSON.stringify(c)))].map(c => JSON.parse(c));

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-stats" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="stats-header-title">
            <h2>📊 Statystyki finansowe</h2>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* FILTRY */}
        <div className="stats-filters">
          <div className="filter-group">
            <label>📅 Rok:</label>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>🌍 Kraj:</label>
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
              <option value="all">Wszystkie kraje</option>
              {availableCountries.map(kod => {
                const c = COUNTRIES.find(x => x.code === kod) || { code: kod, flag: '🏳️', name: kod };
                return <option key={kod} value={kod}>{c.flag} {c.name}</option>;
              })}
            </select>
          </div>
          <div className="filter-group">
            <label>👤 Pracownik:</label>
            <select value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
              <option value="all">Wszyscy</option>
              {availableCreators.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>📊 Status:</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ZAKŁADKI */}
        <div className="stats-tabs">
          <button 
            className={`stats-tab ${activeTab === 'monthly' ? 'active' : ''}`}
            onClick={() => setActiveTab('monthly')}
          >
            📅 Miesięcznie
          </button>
          <button 
            className={`stats-tab ${activeTab === 'countries' ? 'active' : ''}`}
            onClick={() => setActiveTab('countries')}
          >
            🌍 Kraje
          </button>
          <button 
            className={`stats-tab ${activeTab === 'creators' ? 'active' : ''}`}
            onClick={() => setActiveTab('creators')}
          >
            👥 Pracownicy
          </button>
        </div>

        <div className="modal-body stats-body">
          {/* PODSUMOWANIE ROCZNE */}
          <div className="stats-summary">
            <div className="summary-card total">
              <div className="summary-icon">📈</div>
              <div className="summary-content">
                <span className="summary-label">Obrót (brutto)</span>
                <span className="summary-value">{formatCurrency(yearSummary.obrotBrutto, 'PLN')}</span>
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-icon">🧾</div>
              <div className="summary-content">
                <span className="summary-label">Obrót netto</span>
                <span className="summary-value">{formatCurrency(yearSummary.obrotNetto, 'PLN')}</span>
              </div>
            </div>
            <div className="summary-card expense">
              <div className="summary-icon">🏭</div>
              <div className="summary-content">
                <span className="summary-label">Koszty towaru</span>
                <span className="summary-value">{formatCurrency(yearSummary.kosztTowaru, 'PLN')}</span>
              </div>
            </div>
            <div className="summary-card expense">
              <div className="summary-icon">🚚</div>
              <div className="summary-content">
                <span className="summary-label">Koszty transportu</span>
                <span className="summary-value">{formatCurrency(yearSummary.kosztTransportu, 'PLN')}</span>
              </div>
            </div>
            {yearSummary.sumaRabatow > 0 && (
              <div className="summary-card expense discount">
                <div className="summary-icon">🎁</div>
                <div className="summary-content">
                  <span className="summary-label">Rabaty kierowców</span>
                  <span className="summary-value">{formatCurrency(yearSummary.sumaRabatow, 'PLN')}</span>
                </div>
              </div>
            )}
            <div className={`summary-card profit ${yearSummary.marza >= 0 ? 'positive' : 'negative'}`}>
              <div className="summary-icon">💰</div>
              <div className="summary-content">
                <span className="summary-label">ZYSK / MARŻA {yearSummary.sumaRabatow > 0 ? '(po rabatach)' : ''}</span>
                <span className="summary-value">
                  {formatCurrency(yearSummary.marza, 'PLN')}
                  <span className="summary-percent">({yearSummary.marzaProc.toFixed(1)}%)</span>
                </span>
              </div>
            </div>
            <div className="summary-card orders">
              <div className="summary-icon">📦</div>
              <div className="summary-content">
                <span className="summary-label">Zamówień</span>
                <span className="summary-value">{yearSummary.zamowienia}</span>
              </div>
            </div>
          </div>

          {/* ZAKŁADKA: MIESIĘCZNIE */}
          {activeTab === 'monthly' && (
            <>
              {/* WYKRES SŁUPKOWY */}
              <div className="stats-chart-section">
                <h3>📊 Przegląd miesięczny {selectedYear}</h3>
                <div className="chart-container">
                  <div className="chart-bars">
                    {monthlyData.map((m, i) => (
                      <div key={i} className="chart-bar-group">
                        <div className="chart-bar-container">
                          <div 
                            className="chart-bar obrot" 
                            style={{ height: `${(m.obrotNetto / maxValue) * 100}%` }}
                            title={`Obrót netto: ${formatCurrency(m.obrotNetto, 'PLN')}`}
                          >
                            <span className="bar-value">{m.obrotNetto > 0 ? Math.round(m.obrotNetto / 1000) + 'k' : ''}</span>
                          </div>
                          <div 
                            className={`chart-bar marza ${m.marza >= 0 ? 'positive' : 'negative'}`}
                            style={{ height: `${Math.abs(m.marza) / maxValue * 100}%` }}
                            title={`Marża: ${formatCurrency(m.marza, 'PLN')}`}
                          />
                        </div>
                        <span className="chart-label">{m.shortName}</span>
                      </div>
                    ))}
                  </div>
                  <div className="chart-legend">
                    <span className="legend-item"><span className="legend-color obrot"></span> Obrót netto</span>
                    <span className="legend-item"><span className="legend-color marza"></span> Marża</span>
                  </div>
                </div>
              </div>

              {/* TABELA MIESIĘCZNA */}
              <div className="stats-table-section">
                <h3>📋 Szczegółowe zestawienie miesięczne</h3>
                <div className="stats-table-wrapper">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Miesiąc</th>
                        <th>Zamówienia</th>
                        <th>Obrót brutto</th>
                        <th>Obrót netto</th>
                        <th>Koszt towaru</th>
                        <th>Koszt transportu</th>
                        <th>Marża</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((m, i) => (
                        <tr key={i} className={m.zamowienia === 0 ? 'empty' : ''}>
                          <td className="month-name">{m.name}</td>
                          <td className="center">{m.zamowienia}</td>
                          <td className="money">{formatCurrency(m.obrotBrutto, 'PLN')}</td>
                          <td className="money">{formatCurrency(m.obrotNetto, 'PLN')}</td>
                          <td className="money expense">{formatCurrency(m.kosztTowaru, 'PLN')}</td>
                          <td className="money expense">{formatCurrency(m.kosztTransportu, 'PLN')}</td>
                          <td className={`money ${m.marza >= 0 ? 'profit' : 'loss'}`}>{formatCurrency(m.marza, 'PLN')}</td>
                          <td className={`percent ${m.marza >= 0 ? 'profit' : 'loss'}`}>{m.marzaProc.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="summary-row">
                        <td><strong>RAZEM {selectedYear}</strong></td>
                        <td className="center"><strong>{yearSummary.zamowienia}</strong></td>
                        <td className="money"><strong>{formatCurrency(yearSummary.obrotBrutto, 'PLN')}</strong></td>
                        <td className="money"><strong>{formatCurrency(yearSummary.obrotNetto, 'PLN')}</strong></td>
                        <td className="money expense"><strong>{formatCurrency(yearSummary.kosztTowaru, 'PLN')}</strong></td>
                        <td className="money expense"><strong>{formatCurrency(yearSummary.kosztTransportu, 'PLN')}</strong></td>
                        <td className={`money ${yearSummary.marza >= 0 ? 'profit' : 'loss'}`}><strong>{formatCurrency(yearSummary.marza, 'PLN')}</strong></td>
                        <td className={`percent ${yearSummary.marza >= 0 ? 'profit' : 'loss'}`}><strong>{yearSummary.marzaProc.toFixed(1)}%</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ZAKŁADKA: KRAJE */}
          {activeTab === 'countries' && (
            <div className="stats-table-section">
              <h3>🌍 Statystyki według krajów ({selectedYear})</h3>
              
              {/* Karty krajów */}
              <div className="country-cards">
                {countryStats.slice(0, 6).map((c, i) => (
                  <div key={c.kod} className={`country-card ${i === 0 ? 'top' : ''}`}>
                    <div className="country-card-header">
                      <span className="country-flag-large">{c.flag}</span>
                      <span className="country-name">{c.name}</span>
                      {i === 0 && <span className="top-badge">🏆 TOP</span>}
                    </div>
                    <div className="country-card-stats">
                      <div className="country-stat">
                        <span className="stat-label">Zamówienia</span>
                        <span className="stat-value">{c.zamowienia}</span>
                      </div>
                      <div className="country-stat">
                        <span className="stat-label">Obrót netto</span>
                        <span className="stat-value">{formatCurrency(c.obrotNetto, 'PLN')}</span>
                      </div>
                      <div className="country-stat">
                        <span className="stat-label">Marża</span>
                        <span className={`stat-value ${c.marza >= 0 ? 'profit' : 'loss'}`}>
                          {formatCurrency(c.marza, 'PLN')} ({c.marzaProc.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tabela krajów */}
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Kraj</th>
                      <th>Zamówienia</th>
                      <th>Obrót brutto</th>
                      <th>Obrót netto</th>
                      <th>Koszt towaru</th>
                      <th>Koszt transportu</th>
                      <th>Marża</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryStats.map((c) => (
                      <tr key={c.kod}>
                        <td className="country-cell">
                          <span className="country-flag">{c.flag}</span>
                          <span>{c.name}</span>
                        </td>
                        <td className="center">{c.zamowienia}</td>
                        <td className="money">{formatCurrency(c.obrotBrutto, 'PLN')}</td>
                        <td className="money">{formatCurrency(c.obrotNetto, 'PLN')}</td>
                        <td className="money expense">{formatCurrency(c.kosztTowaru, 'PLN')}</td>
                        <td className="money expense">{formatCurrency(c.kosztTransportu, 'PLN')}</td>
                        <td className={`money ${c.marza >= 0 ? 'profit' : 'loss'}`}>{formatCurrency(c.marza, 'PLN')}</td>
                        <td className={`percent ${c.marza >= 0 ? 'profit' : 'loss'}`}>{c.marzaProc.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="summary-row">
                      <td><strong>RAZEM</strong></td>
                      <td className="center"><strong>{yearSummary.zamowienia}</strong></td>
                      <td className="money"><strong>{formatCurrency(yearSummary.obrotBrutto, 'PLN')}</strong></td>
                      <td className="money"><strong>{formatCurrency(yearSummary.obrotNetto, 'PLN')}</strong></td>
                      <td className="money expense"><strong>{formatCurrency(yearSummary.kosztTowaru, 'PLN')}</strong></td>
                      <td className="money expense"><strong>{formatCurrency(yearSummary.kosztTransportu, 'PLN')}</strong></td>
                      <td className={`money ${yearSummary.marza >= 0 ? 'profit' : 'loss'}`}><strong>{formatCurrency(yearSummary.marza, 'PLN')}</strong></td>
                      <td className={`percent ${yearSummary.marza >= 0 ? 'profit' : 'loss'}`}><strong>{yearSummary.marzaProc.toFixed(1)}%</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ZAKŁADKA: PRACOWNICY */}
          {activeTab === 'creators' && (
            <div className="stats-table-section">
              <h3>👥 Statystyki według pracowników/kontrahentów ({selectedYear})</h3>
              
              {/* Karty najlepszych pracowników */}
              <div className="creator-cards">
                {creatorStats.slice(0, 4).map((c, i) => (
                  <div key={c.id} className={`creator-card ${i === 0 ? 'top' : ''}`}>
                    <div className="creator-card-header">
                      <div className="creator-avatar">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤'}
                      </div>
                      <div className="creator-info">
                        <span className="creator-name">{c.name}</span>
                        <span className="creator-orders">{c.zamowienia} zamówień</span>
                      </div>
                    </div>
                    <div className="creator-card-stats">
                      <div className="creator-stat-row">
                        <span className="stat-label">Obrót netto:</span>
                        <span className="stat-value">{formatCurrency(c.obrotNetto, 'PLN')}</span>
                      </div>
                      <div className="creator-stat-row">
                        <span className="stat-label">Marża:</span>
                        <span className={`stat-value ${c.marza >= 0 ? 'profit' : 'loss'}`}>
                          {formatCurrency(c.marza, 'PLN')}
                        </span>
                      </div>
                      <div className="creator-stat-row">
                        <span className="stat-label">Rentowność:</span>
                        <span className={`stat-value ${c.marzaProc >= 20 ? 'profit' : c.marzaProc >= 0 ? '' : 'loss'}`}>
                          {c.marzaProc.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tabela pracowników */}
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Pracownik / Kontrahent</th>
                      <th>Zamówienia</th>
                      <th>Obrót brutto</th>
                      <th>Obrót netto</th>
                      <th>Koszt towaru</th>
                      <th>Koszt transportu</th>
                      <th>Marża</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creatorStats.map((c, i) => (
                      <tr key={c.id}>
                        <td className="center rank">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </td>
                        <td className="creator-cell">
                          <span className="creator-name">{c.name}</span>
                        </td>
                        <td className="center">{c.zamowienia}</td>
                        <td className="money">{formatCurrency(c.obrotBrutto, 'PLN')}</td>
                        <td className="money">{formatCurrency(c.obrotNetto, 'PLN')}</td>
                        <td className="money expense">{formatCurrency(c.kosztTowaru, 'PLN')}</td>
                        <td className="money expense">{formatCurrency(c.kosztTransportu, 'PLN')}</td>
                        <td className={`money ${c.marza >= 0 ? 'profit' : 'loss'}`}>{formatCurrency(c.marza, 'PLN')}</td>
                        <td className={`percent ${c.marza >= 0 ? 'profit' : 'loss'}`}>{c.marzaProc.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="summary-row">
                      <td></td>
                      <td><strong>RAZEM</strong></td>
                      <td className="center"><strong>{yearSummary.zamowienia}</strong></td>
                      <td className="money"><strong>{formatCurrency(yearSummary.obrotBrutto, 'PLN')}</strong></td>
                      <td className="money"><strong>{formatCurrency(yearSummary.obrotNetto, 'PLN')}</strong></td>
                      <td className="money expense"><strong>{formatCurrency(yearSummary.kosztTowaru, 'PLN')}</strong></td>
                      <td className="money expense"><strong>{formatCurrency(yearSummary.kosztTransportu, 'PLN')}</strong></td>
                      <td className={`money ${yearSummary.marza >= 0 ? 'profit' : 'loss'}`}><strong>{formatCurrency(yearSummary.marza, 'PLN')}</strong></td>
                      <td className={`percent ${yearSummary.marza >= 0 ? 'profit' : 'loss'}`}><strong>{yearSummary.marzaProc.toFixed(1)}%</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL KONTAKTÓW (BAZA KLIENTÓW)
// ============================================

const ContactsPanel = ({ orders, onClose, isContractor, currentUser, onCreateOrder }) => {
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [selectedContact, setSelectedContact] = useState(null);

  // Wyciągnij unikalne kontakty z zamówień
  const extractContacts = () => {
    const contactsMap = new Map();
    
    // Dla kontrahenta - tylko jego zamówienia
    const relevantOrders = isContractor 
      ? orders.filter(o => o.kontrahentId === currentUser?.id && !o.usuniety)
      : orders.filter(o => !o.usuniety);

    relevantOrders.forEach(order => {
      if (!order.klient?.imie) return;
      
      // Klucz: imię + telefon lub email
      const key = `${order.klient.imie.toLowerCase()}_${order.klient.telefon || order.klient.email || ''}`.trim();
      
      if (contactsMap.has(key)) {
        const existing = contactsMap.get(key);
        existing.orders.push(order);
        existing.totalSpent += order.platnosci?.cenaCalkowita || 0;
        existing.currencies.add(order.platnosci?.waluta || 'PLN');
        if (new Date(order.dataZlecenia) > new Date(existing.lastOrder)) {
          existing.lastOrder = order.dataZlecenia;
        }
        if (new Date(order.dataZlecenia) < new Date(existing.firstOrder)) {
          existing.firstOrder = order.dataZlecenia;
        }
      } else {
        contactsMap.set(key, {
          id: key,
          imie: order.klient.imie,
          telefon: order.klient.telefon || '',
          email: order.klient.email || '',
          adres: order.klient.adres || '',
          facebookUrl: order.klient.facebookUrl || '',
          kraj: order.kraj || 'PL',
          orders: [order],
          totalSpent: order.platnosci?.cenaCalkowita || 0,
          currencies: new Set([order.platnosci?.waluta || 'PLN']),
          firstOrder: order.dataZlecenia || order.utworzonePrzez?.data,
          lastOrder: order.dataZlecenia || order.utworzonePrzez?.data
        });
      }
    });

    return Array.from(contactsMap.values()).sort((a, b) => 
      new Date(b.lastOrder) - new Date(a.lastOrder)
    );
  };

  const contacts = extractContacts();

  // Filtrowanie
  const filteredContacts = contacts.filter(c => {
    if (countryFilter !== 'all' && c.kraj !== countryFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [c.imie, c.telefon, c.email, c.adres].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  // Dostępne kraje
  const availableCountries = [...new Set(contacts.map(c => c.kraj).filter(Boolean))];

  // Stwórz nowe zamówienie z danymi kontaktu
  const handleCreateOrder = (contact) => {
    onCreateOrder({
      klient: {
        imie: contact.imie,
        telefon: contact.telefon,
        email: contact.email,
        adres: contact.adres,
        facebookUrl: contact.facebookUrl
      },
      kraj: contact.kraj
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-xlarge" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>📇 Kontakty</h2>
            <p className="modal-subtitle">Baza klientów ({contacts.length} kontaktów)</p>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Filtry */}
          <div className="contacts-filters">
            <div className="filter-group">
              <input
                type="text"
                placeholder="🔍 Szukaj klienta..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="contacts-search"
              />
            </div>
            <div className="filter-group">
              <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
                <option value="all">🌍 Wszystkie kraje</option>
                {availableCountries.map(code => {
                  const c = getCountry(code);
                  return <option key={code} value={code}>{c?.flag} {c?.name}</option>;
                })}
              </select>
            </div>
          </div>

          {/* Lista kontaktów lub szczegóły */}
          {selectedContact ? (
            <div className="contact-details">
              <button className="btn-back" onClick={() => setSelectedContact(null)}>
                ← Wróć do listy
              </button>

              <div className="contact-header">
                <div className="contact-avatar">
                  {selectedContact.imie.charAt(0).toUpperCase()}
                </div>
                <div className="contact-info">
                  <h3>{selectedContact.imie}</h3>
                  <p>{getCountry(selectedContact.kraj)?.flag} {getCountry(selectedContact.kraj)?.name}</p>
                </div>
                <button className="btn-primary" onClick={() => handleCreateOrder(selectedContact)}>
                  ➕ Nowe zamówienie
                </button>
              </div>

              <div className="contact-data-grid">
                {selectedContact.telefon && (
                  <div className="contact-data-item">
                    <span className="label">📞 Telefon</span>
                    <a href={`tel:${selectedContact.telefon}`}>{selectedContact.telefon}</a>
                  </div>
                )}
                {selectedContact.email && (
                  <div className="contact-data-item">
                    <span className="label">✉️ Email</span>
                    <a href={`mailto:${selectedContact.email}`}>{selectedContact.email}</a>
                  </div>
                )}
                {selectedContact.adres && (
                  <div className="contact-data-item">
                    <span className="label">📍 Adres</span>
                    <span>{selectedContact.adres}</span>
                  </div>
                )}
                {selectedContact.facebookUrl && (
                  <div className="contact-data-item">
                    <span className="label">📘 Facebook</span>
                    <a href={selectedContact.facebookUrl} target="_blank" rel="noopener noreferrer">Profil</a>
                  </div>
                )}
              </div>

              <div className="contact-stats">
                <div className="stat-box">
                  <div className="stat-value">{selectedContact.orders.length}</div>
                  <div className="stat-label">Zamówień</div>
                </div>
                <div className="stat-box highlight">
                  <div className="stat-value">{formatCurrency(selectedContact.totalSpent, 'PLN')}</div>
                  <div className="stat-label">Wydano łącznie</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">{formatDate(selectedContact.firstOrder)}</div>
                  <div className="stat-label">Pierwszy zakup</div>
                </div>
                <div className="stat-box">
                  <div className="stat-value">{formatDate(selectedContact.lastOrder)}</div>
                  <div className="stat-label">Ostatni zakup</div>
                </div>
              </div>

              <div className="contact-orders-history">
                <h4>📦 Historia zamówień</h4>
                <div className="orders-history-list">
                  {selectedContact.orders.map(order => (
                    <div key={order.id} className="history-order-item">
                      <div className="history-order-header">
                        <span className="history-order-number">
                          {getCountry(order.kraj)?.flag} {order.nrWlasny}
                        </span>
                        <span className={`history-order-status`} style={{ 
                          background: getStatus(order.status)?.bgColor, 
                          color: getStatus(order.status)?.color 
                        }}>
                          {getStatus(order.status)?.icon} {getStatus(order.status)?.name}
                        </span>
                      </div>
                      <p className="history-order-product">{order.towar?.substring(0, 80)}...</p>
                      <div className="history-order-meta">
                        <span>📅 {formatDate(order.dataZlecenia)}</span>
                        <span>💰 {formatCurrency(order.platnosci?.cenaCalkowita, order.platnosci?.waluta)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="contacts-list">
              {filteredContacts.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📇</div>
                  <p>{contacts.length === 0 ? 'Brak kontaktów' : 'Nie znaleziono kontaktów'}</p>
                </div>
              ) : (
                filteredContacts.map(contact => (
                  <div 
                    key={contact.id} 
                    className="contact-card"
                    onClick={() => setSelectedContact(contact)}
                  >
                    <div className="contact-card-avatar">
                      {contact.imie.charAt(0).toUpperCase()}
                    </div>
                    <div className="contact-card-main">
                      <div className="contact-card-name">
                        {getCountry(contact.kraj)?.flag} {contact.imie}
                      </div>
                      <div className="contact-card-details">
                        {contact.telefon && <span>📞 {contact.telefon}</span>}
                        {contact.email && <span>✉️ {contact.email}</span>}
                      </div>
                    </div>
                    <div className="contact-card-stats">
                      <div className="contact-orders-count">{contact.orders.length} zam.</div>
                      <div className="contact-total-spent">{formatCurrency(contact.totalSpent, 'PLN')}</div>
                    </div>
                    <button 
                      className="btn-create-order-small"
                      onClick={(e) => { e.stopPropagation(); handleCreateOrder(contact); }}
                    >
                      ➕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="contacts-summary">
            {filteredContacts.length} z {contacts.length} kontaktów
          </span>
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL PRÓBEK (WYSYŁKA)
// ============================================

const SHIPPING_STATUSES = [
  { id: 'nowe', label: 'Nowe', color: '#3B82F6', icon: '🆕' },
  { id: 'potwierdzone', label: 'Potwierdzone', color: '#F59E0B', icon: '✅' },
  { id: 'w_trakcie', label: 'W trakcie', color: '#8B5CF6', icon: '📋' },
  { id: 'wyslane', label: 'Wysłane', color: '#10B981', icon: '📬' }
];

const SamplesPanel = ({ samples, onSave, onDelete, onClose, currentUser }) => {
  const [view, setView] = useState('list');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingSample, setEditingSample] = useState(null);
  const [formData, setFormData] = useState({
    imie: '',
    telefon: '',
    email: '',
    adres: '',
    opis: '',
    status: 'nowe'
  });

  const resetForm = () => {
    setFormData({
      imie: '',
      telefon: '',
      email: '',
      adres: '',
      opis: '',
      status: 'nowe'
    });
    setEditingSample(null);
  };

  const handleSave = () => {
    if (!formData.imie.trim() || !formData.opis.trim()) {
      alert('Wypełnij imię/nazwę i opis próbki');
      return;
    }

    const sampleData = {
      ...formData,
      id: editingSample?.id || `sample-${Date.now()}`,
      createdAt: editingSample?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: editingSample?.createdBy || currentUser?.name
    };

    onSave(sampleData);
    resetForm();
    setView('list');
  };

  const handleEdit = (sample) => {
    setFormData({
      imie: sample.imie || '',
      telefon: sample.telefon || '',
      email: sample.email || '',
      adres: sample.adres || '',
      opis: sample.opis || '',
      status: sample.status || 'nowe'
    });
    setEditingSample(sample);
    setView('form');
  };

  const handleStatusChange = (sample, newStatus) => {
    onSave({ ...sample, status: newStatus, updatedAt: new Date().toISOString() });
  };

  const filteredSamples = samples.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [s.imie, s.telefon, s.email, s.adres, s.opis].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const statusCounts = {
    all: samples.length,
    nowe: samples.filter(s => s.status === 'nowe').length,
    potwierdzone: samples.filter(s => s.status === 'potwierdzone').length,
    w_trakcie: samples.filter(s => s.status === 'w_trakcie').length,
    wyslane: samples.filter(s => s.status === 'wyslane').length
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🧪 Próbki do wysłania</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="shipping-panel-content">
          {view === 'list' && (
            <>
              <div className="shipping-toolbar">
                <button className="btn-primary" onClick={() => { resetForm(); setView('form'); }}>
                  ➕ Nowa próbka
                </button>
                <input
                  type="text"
                  placeholder="🔍 Szukaj..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="shipping-search"
                />
              </div>

              <div className="shipping-filters">
                <button 
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  Wszystkie ({statusCounts.all})
                </button>
                {SHIPPING_STATUSES.map(st => (
                  <button
                    key={st.id}
                    className={`filter-btn ${filter === st.id ? 'active' : ''}`}
                    onClick={() => setFilter(st.id)}
                    style={{ '--filter-color': st.color }}
                  >
                    {st.icon} {st.label} ({statusCounts[st.id]})
                  </button>
                ))}
              </div>

              <div className="shipping-list">
                {filteredSamples.length === 0 ? (
                  <div className="empty-state">
                    <p>🧪 Brak próbek do wyświetlenia</p>
                  </div>
                ) : (
                  filteredSamples.map(sample => {
                    const status = SHIPPING_STATUSES.find(s => s.id === sample.status) || SHIPPING_STATUSES[0];
                    return (
                      <div key={sample.id} className="shipping-item">
                        <div className="shipping-item-header">
                          <div className="shipping-item-client">
                            <strong>{sample.imie}</strong>
                            {sample.telefon && <span>📞 {sample.telefon}</span>}
                            {sample.email && <span>✉️ {sample.email}</span>}
                          </div>
                          
                          {/* Numer przesyłki - na środku */}
                          <div className="shipping-tracking-wrapper">
                            {sample.numerPrzesylki ? (
                              <div className="shipping-tracking-display">
                                <span className="tracking-label">📦 Nr:</span>
                                <span className="tracking-number">{sample.numerPrzesylki}</span>
                                <button 
                                  className="btn-edit-tracking"
                                  onClick={() => {
                                    const newNumber = prompt('Numer przesyłki:', sample.numerPrzesylki);
                                    if (newNumber !== null) {
                                      onSave({ ...sample, numerPrzesylki: newNumber, updatedAt: new Date().toISOString() });
                                    }
                                  }}
                                  title="Edytuj numer"
                                >✏️</button>
                              </div>
                            ) : (
                              <button 
                                className="btn-add-tracking"
                                onClick={() => {
                                  const trackingNumber = prompt('Wpisz numer przesyłki:');
                                  if (trackingNumber) {
                                    onSave({ ...sample, numerPrzesylki: trackingNumber, updatedAt: new Date().toISOString() });
                                  }
                                }}
                              >
                                ➕ Dodaj nr przesyłki
                              </button>
                            )}
                          </div>
                          
                          <div 
                            className="shipping-status-badge"
                            style={{ background: status.color }}
                          >
                            {status.icon} {status.label}
                          </div>
                        </div>
                        {sample.adres && (
                          <div className="shipping-item-address">📍 {sample.adres}</div>
                        )}
                        <div className="shipping-item-desc">{sample.opis}</div>
                        <div className="shipping-item-footer">
                          <span className="shipping-item-date">
                            {new Date(sample.createdAt).toLocaleDateString('pl-PL')} • {sample.createdBy}
                          </span>
                          <div className="shipping-item-actions">
                            <select
                              value={sample.status}
                              onChange={e => handleStatusChange(sample, e.target.value)}
                              className="status-select-mini"
                            >
                              {SHIPPING_STATUSES.map(st => (
                                <option key={st.id} value={st.id}>{st.icon} {st.label}</option>
                              ))}
                            </select>
                            <button className="btn-icon" onClick={() => handleEdit(sample)} title="Edytuj">✏️</button>
                            <button className="btn-icon btn-danger" onClick={() => {
                              if (window.confirm('Usunąć tę próbkę?')) onDelete(sample.id);
                            }} title="Usuń">🗑️</button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {view === 'form' && (
            <div className="shipping-form">
              <h3>{editingSample ? '✏️ Edytuj próbkę' : '➕ Nowa próbka'}</h3>
              
              <div className="form-section">
                <h4>👤 Dane klienta</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Imię / Nazwa firmy *</label>
                    <input
                      type="text"
                      value={formData.imie}
                      onChange={e => setFormData({...formData, imie: e.target.value})}
                      placeholder="Jan Kowalski"
                    />
                  </div>
                  <div className="form-group">
                    <label>Telefon</label>
                    <input
                      type="tel"
                      value={formData.telefon}
                      onChange={e => setFormData({...formData, telefon: e.target.value})}
                      placeholder="+48 123 456 789"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      placeholder="jan@example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value})}
                    >
                      {SHIPPING_STATUSES.map(st => (
                        <option key={st.id} value={st.id}>{st.icon} {st.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Adres wysyłki</label>
                  <input
                    type="text"
                    value={formData.adres}
                    onChange={e => setFormData({...formData, adres: e.target.value})}
                    placeholder="ul. Przykładowa 1, 00-000 Miasto"
                  />
                </div>
              </div>

              <div className="form-section">
                <h4>🧪 Co wysłać</h4>
                <div className="form-group">
                  <label>Opis próbki *</label>
                  <textarea
                    value={formData.opis}
                    onChange={e => setFormData({...formData, opis: e.target.value})}
                    placeholder="Opisz co dokładnie ma być wysłane..."
                    rows={4}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-secondary" onClick={() => { resetForm(); setView('list'); }}>
                  Anuluj
                </button>
                <button className="btn-primary" onClick={handleSave}>
                  💾 {editingSample ? 'Zapisz zmiany' : 'Dodaj próbkę'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL POCZTY (WYSYŁKA)
// ============================================

const MailPanel = ({ mailItems, onSave, onDelete, onClose, currentUser }) => {
  const [view, setView] = useState('list');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingMail, setEditingMail] = useState(null);
  const [formData, setFormData] = useState({
    imie: '',
    telefon: '',
    email: '',
    adres: '',
    opis: '',
    status: 'nowe'
  });

  const resetForm = () => {
    setFormData({
      imie: '',
      telefon: '',
      email: '',
      adres: '',
      opis: '',
      status: 'nowe'
    });
    setEditingMail(null);
  };

  const handleSave = () => {
    if (!formData.imie.trim() || !formData.opis.trim()) {
      alert('Wypełnij imię/nazwę i opis przesyłki');
      return;
    }

    const mailData = {
      ...formData,
      id: editingMail?.id || `mail-${Date.now()}`,
      createdAt: editingMail?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: editingMail?.createdBy || currentUser?.name
    };

    onSave(mailData);
    resetForm();
    setView('list');
  };

  const handleEdit = (mail) => {
    setFormData({
      imie: mail.imie || '',
      telefon: mail.telefon || '',
      email: mail.email || '',
      adres: mail.adres || '',
      opis: mail.opis || '',
      status: mail.status || 'nowe'
    });
    setEditingMail(mail);
    setView('form');
  };

  const handleStatusChange = (mail, newStatus) => {
    onSave({ ...mail, status: newStatus, updatedAt: new Date().toISOString() });
  };

  const filteredMail = mailItems.filter(m => {
    if (filter !== 'all' && m.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [m.imie, m.telefon, m.email, m.adres, m.opis].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const statusCounts = {
    all: mailItems.length,
    nowe: mailItems.filter(m => m.status === 'nowe').length,
    potwierdzone: mailItems.filter(m => m.status === 'potwierdzone').length,
    w_trakcie: mailItems.filter(m => m.status === 'w_trakcie').length,
    wyslane: mailItems.filter(m => m.status === 'wyslane').length
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>✉️ Poczta do wysłania</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="shipping-panel-content">
          {view === 'list' && (
            <>
              <div className="shipping-toolbar">
                <button className="btn-primary" onClick={() => { resetForm(); setView('form'); }}>
                  ➕ Nowa przesyłka
                </button>
                <input
                  type="text"
                  placeholder="🔍 Szukaj..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="shipping-search"
                />
              </div>

              <div className="shipping-filters">
                <button 
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  Wszystkie ({statusCounts.all})
                </button>
                {SHIPPING_STATUSES.map(st => (
                  <button
                    key={st.id}
                    className={`filter-btn ${filter === st.id ? 'active' : ''}`}
                    onClick={() => setFilter(st.id)}
                    style={{ '--filter-color': st.color }}
                  >
                    {st.icon} {st.label} ({statusCounts[st.id]})
                  </button>
                ))}
              </div>

              <div className="shipping-list">
                {filteredMail.length === 0 ? (
                  <div className="empty-state">
                    <p>✉️ Brak przesyłek do wyświetlenia</p>
                  </div>
                ) : (
                  filteredMail.map(mail => {
                    const status = SHIPPING_STATUSES.find(s => s.id === mail.status) || SHIPPING_STATUSES[0];
                    return (
                      <div key={mail.id} className="shipping-item">
                        <div className="shipping-item-header">
                          <div className="shipping-item-client">
                            <strong>{mail.imie}</strong>
                            {mail.telefon && <span>📞 {mail.telefon}</span>}
                            {mail.email && <span>✉️ {mail.email}</span>}
                          </div>
                          
                          {/* Numer przesyłki - na środku */}
                          <div className="shipping-tracking-wrapper">
                            {mail.numerPrzesylki ? (
                              <div className="shipping-tracking-display">
                                <span className="tracking-label">📦 Nr:</span>
                                <span className="tracking-number">{mail.numerPrzesylki}</span>
                                <button 
                                  className="btn-edit-tracking"
                                  onClick={() => {
                                    const newNumber = prompt('Numer przesyłki:', mail.numerPrzesylki);
                                    if (newNumber !== null) {
                                      onSave({ ...mail, numerPrzesylki: newNumber, updatedAt: new Date().toISOString() });
                                    }
                                  }}
                                  title="Edytuj numer"
                                >✏️</button>
                              </div>
                            ) : (
                              <button 
                                className="btn-add-tracking"
                                onClick={() => {
                                  const trackingNumber = prompt('Wpisz numer przesyłki:');
                                  if (trackingNumber) {
                                    onSave({ ...mail, numerPrzesylki: trackingNumber, updatedAt: new Date().toISOString() });
                                  }
                                }}
                              >
                                ➕ Dodaj nr przesyłki
                              </button>
                            )}
                          </div>
                          
                          <div 
                            className="shipping-status-badge"
                            style={{ background: status.color }}
                          >
                            {status.icon} {status.label}
                          </div>
                        </div>
                        {mail.adres && (
                          <div className="shipping-item-address">📍 {mail.adres}</div>
                        )}
                        <div className="shipping-item-desc">{mail.opis}</div>
                        <div className="shipping-item-footer">
                          <span className="shipping-item-date">
                            {new Date(mail.createdAt).toLocaleDateString('pl-PL')} • {mail.createdBy}
                          </span>
                          <div className="shipping-item-actions">
                            <select
                              value={mail.status}
                              onChange={e => handleStatusChange(mail, e.target.value)}
                              className="status-select-mini"
                            >
                              {SHIPPING_STATUSES.map(st => (
                                <option key={st.id} value={st.id}>{st.icon} {st.label}</option>
                              ))}
                            </select>
                            <button className="btn-icon" onClick={() => handleEdit(mail)} title="Edytuj">✏️</button>
                            <button className="btn-icon btn-danger" onClick={() => {
                              if (window.confirm('Usunąć tę przesyłkę?')) onDelete(mail.id);
                            }} title="Usuń">🗑️</button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {view === 'form' && (
            <div className="shipping-form">
              <h3>{editingMail ? '✏️ Edytuj przesyłkę' : '➕ Nowa przesyłka'}</h3>
              
              <div className="form-section">
                <h4>👤 Dane odbiorcy</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Imię / Nazwa firmy *</label>
                    <input
                      type="text"
                      value={formData.imie}
                      onChange={e => setFormData({...formData, imie: e.target.value})}
                      placeholder="Jan Kowalski"
                    />
                  </div>
                  <div className="form-group">
                    <label>Telefon</label>
                    <input
                      type="tel"
                      value={formData.telefon}
                      onChange={e => setFormData({...formData, telefon: e.target.value})}
                      placeholder="+48 123 456 789"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      placeholder="jan@example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value})}
                    >
                      {SHIPPING_STATUSES.map(st => (
                        <option key={st.id} value={st.id}>{st.icon} {st.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Adres wysyłki</label>
                  <input
                    type="text"
                    value={formData.adres}
                    onChange={e => setFormData({...formData, adres: e.target.value})}
                    placeholder="ul. Przykładowa 1, 00-000 Miasto"
                  />
                </div>
              </div>

              <div className="form-section">
                <h4>📝 Co wysłać</h4>
                <div className="form-group">
                  <label>Opis przesyłki *</label>
                  <textarea
                    value={formData.opis}
                    onChange={e => setFormData({...formData, opis: e.target.value})}
                    placeholder="Opisz co dokładnie ma być wysłane..."
                    rows={4}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-secondary" onClick={() => { resetForm(); setView('list'); }}>
                  Anuluj
                </button>
                <button className="btn-primary" onClick={handleSave}>
                  💾 {editingMail ? 'Zapisz zmiany' : 'Dodaj przesyłkę'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL KOSZA
// ============================================

const TrashPanel = ({ orders, onRestore, onPermanentDelete, onClose, isAdmin, currentUser }) => {
  const [search, setSearch] = useState('');

  const filteredOrders = orders.filter(o => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const hay = [o.nrWlasny, o.towar, o.klient?.imie, o.usunietyPrzez?.nazwa].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-xlarge" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>🗑️ Kosz</h2>
            <p className="modal-subtitle">Usunięte zamówienia ({orders.length})</p>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Wyszukiwarka */}
          <div className="trash-search">
            <input
              type="text"
              placeholder="🔍 Szukaj w koszu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {filteredOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🗑️</div>
              <p>{orders.length === 0 ? 'Kosz jest pusty' : 'Nie znaleziono zamówień'}</p>
            </div>
          ) : (
            <div className="trash-list">
              {filteredOrders.map(order => {
                const country = getCountry(order.kraj);
                const canRestore = isAdmin || order.utworzonePrzez?.id === currentUser?.id || order.kontrahentId === currentUser?.id;
                
                return (
                  <div key={order.id} className="trash-item">
                    <div className="trash-item-main">
                      <div className="trash-item-header">
                        <span className="trash-order-number">
                          {country?.flag} {order.nrWlasny}
                        </span>
                        <span className="trash-deleted-info">
                          🗑️ Usunięto: {formatDateTime(order.usunietyPrzez?.data)}
                        </span>
                      </div>
                      <div className="trash-item-details">
                        <p className="trash-item-product">{order.towar?.substring(0, 100) || 'Brak opisu'}...</p>
                        <p className="trash-item-client">👤 {order.klient?.imie || 'Brak klienta'}</p>
                      </div>
                      <div className="trash-item-meta">
                        <span className="trash-deleted-by">
                          ❌ Usunął: <strong>{order.usunietyPrzez?.nazwa || 'Nieznany'}</strong>
                        </span>
                        <span className="trash-created-by">
                          📝 Utworzył: {order.utworzonePrzez?.nazwa || 'Nieznany'}
                        </span>
                      </div>
                    </div>
                    <div className="trash-item-actions">
                      {canRestore && (
                        <button 
                          className="btn-restore" 
                          onClick={() => onRestore(order.id)}
                          title="Przywróć zamówienie"
                        >
                          ♻️ Przywróć
                        </button>
                      )}
                      {isAdmin && (
                        <button 
                          className="btn-permanent-delete" 
                          onClick={() => onPermanentDelete(order.id)}
                          title="Usuń trwale (nieodwracalne)"
                        >
                          💀 Usuń trwale
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="trash-footer-info">
            {isAdmin && orders.length > 0 && (
              <span className="trash-warning">⚠️ Trwałe usunięcie jest nieodwracalne!</span>
            )}
          </div>
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MESSENGER - SYSTEM WIADOMOŚCI
// ============================================

const Messenger = ({ 
  currentUser, 
  users, 
  messages, 
  onSendMessage, 
  onMarkAsRead,
  orders,
  isOpen, 
  onClose,
  selectedChat,
  setSelectedChat,
  onViewOrder
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [attachedOrder, setAttachedOrder] = useState(null);
  const messagesEndRef = useRef(null);

  // Filtruj wiadomości dla aktualnego użytkownika
  const myMessages = messages.filter(m => 
    m.senderId === currentUser?.id || m.receiverId === currentUser?.id
  );

  // Grupuj wiadomości po rozmówcach
  const getChats = () => {
    const chatsMap = new Map();
    
    myMessages.forEach(msg => {
      const partnerId = msg.senderId === currentUser?.id ? msg.receiverId : msg.senderId;
      const partner = users.find(u => u.id === partnerId);
      
      if (!partner) return;
      
      if (!chatsMap.has(partnerId)) {
        chatsMap.set(partnerId, {
          partnerId,
          partnerName: partner.name,
          partnerRole: partner.role,
          messages: [],
          unread: 0,
          lastMessage: null
        });
      }
      
      const chat = chatsMap.get(partnerId);
      chat.messages.push(msg);
      
      if (msg.receiverId === currentUser?.id && !msg.read) {
        chat.unread++;
      }
      
      if (!chat.lastMessage || new Date(msg.timestamp) > new Date(chat.lastMessage.timestamp)) {
        chat.lastMessage = msg;
      }
    });

    return Array.from(chatsMap.values()).sort((a, b) => 
      new Date(b.lastMessage?.timestamp || 0) - new Date(a.lastMessage?.timestamp || 0)
    );
  };

  const chats = getChats();
  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);
  
  const currentChat = selectedChat ? chats.find(c => c.partnerId === selectedChat) : null;
  const currentChatMessages = currentChat 
    ? currentChat.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    : [];

  // Scroll do ostatniej wiadomości
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChatMessages.length, selectedChat]);

  // Oznacz jako przeczytane
  useEffect(() => {
    if (selectedChat && currentChat) {
      const unreadMessages = currentChat.messages.filter(m => m.receiverId === currentUser?.id && !m.read);
      unreadMessages.forEach(m => onMarkAsRead(m.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat]);

  // Pobierz zamówienia dla wybranego odbiorcy
  const getOrdersForRecipient = (recipientId) => {
    const recipient = users.find(u => u.id === recipientId);
    if (!recipient) return [];
    
    return orders.filter(o => {
      if (!o.usuniety) {
        // Dla pracownika/admina - zamówienia które utworzył
        if (recipient.role === 'worker' || recipient.role === 'admin') {
          return o.utworzonePrzez?.id === recipientId;
        }
        // Dla kierowcy - zamówienia przypisane do niego
        if (recipient.role === 'driver') {
          return o.przypisanyKierowca === recipientId;
        }
        // Dla kontrahenta - zamówienia które zlecił
        if (recipient.role === 'contractor') {
          return o.kontrahentId === recipientId;
        }
      }
      return false;
    }).slice(0, 30);
  };

  const handleSend = () => {
    if (!newMessage.trim() || !selectedChat) return;
    
    onSendMessage({
      senderId: currentUser.id,
      senderName: currentUser.name,
      receiverId: selectedChat,
      text: newMessage.trim(),
      attachedOrderId: attachedOrder?.id || null,
      attachedOrderNumber: attachedOrder?.nrWlasny || null,
      timestamp: new Date().toISOString(),
      read: false
    });
    
    setNewMessage('');
    setAttachedOrder(null);
  };

  const startNewChat = (userId) => {
    setSelectedChat(userId);
    setShowNewChat(false);
  };

  const getRoleIcon = (role) => {
    switch(role) {
      case 'admin': return '👑';
      case 'worker': return '👷';
      case 'driver': return '🚚';
      case 'contractor': return '🏢';
      default: return '👤';
    }
  };

  const getRoleName = (role) => {
    switch(role) {
      case 'admin': return 'Administrator';
      case 'worker': return 'Pracownik';
      case 'driver': return 'Kierowca';
      case 'contractor': return 'Kontrahent';
      default: return 'Użytkownik';
    }
  };

  const formatMsgTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString('pl-PL', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    }
  };

  // Wszyscy użytkownicy oprócz mnie
  const availableUsers = users.filter(u => u.id !== currentUser?.id);

  // Zamówienia dla wybranego odbiorcy
  const recipientOrders = selectedChat ? getOrdersForRecipient(selectedChat) : [];

  if (!isOpen) {
    return (
      <div className="messenger-fab" onClick={() => onClose(true)} title="Wiadomości">
        💬
        {totalUnread > 0 && <span className="fab-badge">{totalUnread}</span>}
      </div>
    );
  }

  return (
    <div className="messenger-panel">
      <div className="messenger-header">
        <h3>💬 Wiadomości</h3>
        <div className="messenger-header-actions">
          <button className="btn-new-chat" onClick={() => setShowNewChat(true)} title="Nowa rozmowa">✏️</button>
          <button className="btn-close-messenger" onClick={() => onClose(false)}>×</button>
        </div>
      </div>

      {showNewChat ? (
        <div className="messenger-new-chat">
          <div className="new-chat-header">
            <button className="btn-back-chat" onClick={() => setShowNewChat(false)}>← Wróć</button>
            <span>Nowa rozmowa</span>
          </div>
          <div className="new-chat-users">
            {availableUsers.map(u => (
              <div key={u.id} className="new-chat-user" onClick={() => startNewChat(u.id)}>
                <span className="user-role-icon">{getRoleIcon(u.role)}</span>
                <div className="user-info">
                  <div className="user-name">{u.name}</div>
                  <div className="user-role-label">{getRoleName(u.role)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : selectedChat ? (
        <div className="messenger-chat">
          <div className="chat-header">
            <button className="btn-back-chat" onClick={() => setSelectedChat(null)}>←</button>
            <span className="chat-partner-icon">{getRoleIcon(currentChat?.partnerRole)}</span>
            <span className="chat-partner-name">{currentChat?.partnerName}</span>
          </div>
          
          <div className="chat-messages">
            {currentChatMessages.map((msg, idx) => (
              <div key={msg.id || idx} className={`chat-message ${msg.senderId === currentUser?.id ? 'sent' : 'received'}`}>
                {msg.attachedOrderNumber && (
                  <div 
                    className="message-order-tag clickable"
                    onClick={() => {
                      const order = orders.find(o => o.id === msg.attachedOrderId);
                      if (order && onViewOrder) onViewOrder(order);
                    }}
                  >
                    📦 {msg.attachedOrderNumber} (kliknij aby otworzyć)
                  </div>
                )}
                <div className="message-text">{msg.text}</div>
                <div className="message-time">
                  {formatMsgTime(msg.timestamp)}
                  {msg.senderId === currentUser?.id && (
                    <span className="message-status">{msg.read ? ' ✓✓' : ' ✓'}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {attachedOrder && (
            <div className="attached-order-preview">
              📦 {attachedOrder.nrWlasny}
              <button onClick={() => setAttachedOrder(null)}>×</button>
            </div>
          )}

          <div className="chat-input-area">
            <div className="chat-input-row">
              <select 
                className="attach-order-select"
                value={attachedOrder?.id || ''}
                onChange={e => {
                  const order = orders.find(o => o.id === e.target.value);
                  setAttachedOrder(order || null);
                }}
              >
                <option value="">📎 Dołącz zamówienie...</option>
                {recipientOrders.length > 0 ? (
                  recipientOrders.map(o => (
                    <option key={o.id} value={o.id}>{o.nrWlasny} - {o.klient?.imie || 'Brak klienta'}</option>
                  ))
                ) : (
                  <option disabled>Brak zamówień dla tej osoby</option>
                )}
              </select>
            </div>
            <div className="chat-input-row">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSend()}
                placeholder="Napisz wiadomość..."
              />
              <button className="btn-send" onClick={handleSend} disabled={!newMessage.trim()}>➤</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="messenger-chats-list">
          {chats.length === 0 ? (
            <div className="no-chats">
              <p>Brak rozmów</p>
              <button className="btn-start-chat" onClick={() => setShowNewChat(true)}>✏️ Rozpocznij rozmowę</button>
            </div>
          ) : (
            chats.map(chat => (
              <div key={chat.partnerId} className={`chat-item ${chat.unread > 0 ? 'has-unread' : ''}`} onClick={() => setSelectedChat(chat.partnerId)}>
                <div className="chat-item-avatar">{getRoleIcon(chat.partnerRole)}</div>
                <div className="chat-item-content">
                  <div className="chat-item-header">
                    <span className="chat-item-name">{chat.partnerName}</span>
                    <span className="chat-item-time">{formatMsgTime(chat.lastMessage?.timestamp)}</span>
                  </div>
                  <div className="chat-item-preview">
                    {chat.lastMessage?.senderId === currentUser?.id && 'Ty: '}
                    {chat.lastMessage?.text?.substring(0, 30)}{chat.lastMessage?.text?.length > 30 ? '...' : ''}
                  </div>
                </div>
                {chat.unread > 0 && <div className="chat-item-badge">{chat.unread}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};



// ============================================
// PANEL ROZLICZEŃ TRANSPORTOWYCH
// ============================================

const SETTLEMENT_CURRENCIES = [
  { code: 'PLN', symbol: 'zł', name: 'Polski złoty' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'Funt brytyjski' },
  { code: 'USD', symbol: '$', name: 'Dolar amerykański' },
  { code: 'CHF', symbol: 'CHF', name: 'Frank szwajcarski' },
];

const SettlementsPanel = ({ 
  settlements, 
  orders, 
  users, 
  currentUser, 
  onAddSettlement, 
  onUpdateSettlement, 
  onDeleteSettlement,
  onUpdateOrder,
  onClose,
  isDriverView = false 
}) => {
  const [view, setView] = useState('list');
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [statusFilter, setStatusFilter] = useState('dostarczone');
  const [editingSettlement, setEditingSettlement] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [viewingSettlement, setViewingSettlement] = useState(null);

  const drivers = users.filter(u => u.role === 'driver');
  const isAdmin = currentUser?.role === 'admin';

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (amount, currency = 'PLN') => {
    const curr = SETTLEMENT_CURRENCIES.find(c => c.code === currency);
    return `${(amount || 0).toFixed(2)} ${curr?.symbol || currency}`;
  };

  const getCurrencySymbol = (currency) => {
    const curr = SETTLEMENT_CURRENCIES.find(c => c.code === currency);
    return curr?.symbol || currency;
  };

  // Funkcja do wyciągania produktów do rozliczenia (dla zamówień łączonych)
  const getUnsettledItems = () => {
    const items = [];
    
    orders.forEach(order => {
      if (order.usuniety) return;
      
      // Sprawdź czy zamówienie ma produkty (łączone)
      if (order.produkty && order.produkty.length > 0) {
        order.produkty.forEach((produkt, idx) => {
          // Sprawdź czy produkt jest dostarczony i nierozliczony
          if (produkt.status !== 'dostarczone') return;
          if (produkt.rozliczone) return;
          
          const produktDriverId = produkt.kierowca;
          if (!produktDriverId) return;
          
          // Filtr kierowcy
          if (selectedDriver && produktDriverId !== selectedDriver) return;
          if (isDriverView && produktDriverId !== currentUser.id) return;
          
          items.push({
            id: `${order.id}_${idx}`,
            orderId: order.id,
            produktIndex: idx,
            nrWlasny: order.nrWlasny,
            nrPodzamowienia: produkt.nrPodzamowienia || `${order.nrWlasny}-${String.fromCharCode(65 + idx)}`,
            towar: produkt.towar,
            kierowcaId: produktDriverId,
            klient: order.klient,
            dataDostawy: produkt.dataDostawy || order.dataDostawy,
            // Kwoty
            doPobrania: produkt.doPobrania || 0,
            waluta: order.platnosci?.waluta || 'PLN',
            transportNetto: produkt.koszty?.transportNetto || 0,
            transportWaluta: produkt.koszty?.transportWaluta || 'PLN',
            // Flagi
            isProdukt: true,
            rozliczone: produkt.rozliczone || false
          });
        });
      } else {
        // Stare zamówienie (bez produktów)
        if (statusFilter !== 'all' && order.status !== statusFilter) return;
        if (order.status !== 'dostarczone') return;
        if (order.rozliczone) return;
        if (selectedDriver && order.przypisanyKierowca !== selectedDriver) return;
        if (isDriverView && order.przypisanyKierowca !== currentUser.id) return;
        
        items.push({
          id: order.id,
          orderId: order.id,
          produktIndex: null,
          nrWlasny: order.nrWlasny,
          nrPodzamowienia: null,
          towar: order.towar,
          kierowcaId: order.przypisanyKierowca,
          klient: order.klient,
          dataDostawy: order.dataDostawy,
          // Kwoty
          doPobrania: order.platnosci?.doZaplaty || 0,
          waluta: order.platnosci?.waluta || 'PLN',
          transportNetto: order.koszty?.transportNetto || 0,
          transportWaluta: order.koszty?.transportWaluta || 'PLN',
          // Flagi
          isProdukt: false,
          rozliczone: order.rozliczone || false
        });
      }
    });
    
    return items;
  };

  // eslint-disable-next-line no-unused-vars
  const getUnsettledOrders = () => {
    // Dla kompatybilności wstecznej - zwraca unikalne zamówienia
    const items = getUnsettledItems();
    const uniqueOrderIds = [...new Set(items.map(i => i.orderId))];
    return uniqueOrderIds.map(id => orders.find(o => o.id === id)).filter(Boolean);
  };

  // Grupowanie po walutach - obsługuje produkty z zamówień łączonych
  const calculateTotalsByCurrency = () => {
    const totals = {};
    const items = getUnsettledItems();

    selectedOrders.forEach(itemId => {
      // Znajdź item (może być produktem lub całym zamówieniem)
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      // Waluta pobrania
      const collectedCurrency = item.waluta || 'PLN';
      const collected = item.doPobrania || 0;
      
      // Waluta transportu
      const transportCurrency = item.transportWaluta || 'PLN';
      const transport = item.transportNetto || 0;

      // Inicjalizuj waluty jeśli nie istnieją
      if (!totals[collectedCurrency]) {
        totals[collectedCurrency] = { collected: 0, transport: 0, toReturn: 0 };
      }
      if (!totals[transportCurrency] && transportCurrency !== collectedCurrency) {
        totals[transportCurrency] = { collected: 0, transport: 0, toReturn: 0 };
      }

      // Dodaj pobranie
      totals[collectedCurrency].collected += collected;

      // Dodaj transport (odejmij od waluty transportu)
      if (totals[transportCurrency]) {
        totals[transportCurrency].transport += transport;
      }
    });

    // Oblicz do oddania dla każdej waluty
    Object.keys(totals).forEach(currency => {
      totals[currency].toReturn = totals[currency].collected - totals[currency].transport;
    });

    return totals;
  };

  const handleCreateSettlement = async () => {
    if (selectedOrders.length === 0) {
      alert('Wybierz przynajmniej jedno zamówienie/produkt!');
      return;
    }

    const driverName = users.find(u => u.id === selectedDriver)?.name || 'Nieznany';
    const totalsByCurrency = calculateTotalsByCurrency();
    const items = getUnsettledItems();

    // Szczegóły produktów/zamówień z rabatami
    const orderDetails = selectedOrders.map(itemId => {
      const item = items.find(i => i.id === itemId);
      if (!item) return null;

      return {
        itemId: item.id,
        orderId: item.orderId,
        produktIndex: item.produktIndex,
        isProdukt: item.isProdukt,
        nrWlasny: item.nrWlasny || '',
        nrPodzamowienia: item.nrPodzamowienia || '',
        klient: item.klient?.imie || '',
        adres: item.klient?.adres || '',
        dataDostawy: item.dataDostawy || '',
        towar: item.towar || '',
        // Kwoty z walutami
        pobrano: item.doPobrania || 0,
        walutaPobrano: item.waluta || 'PLN',
        transport: item.transportNetto || 0,
        walutaTransport: item.transportWaluta || 'PLN'
      };
    }).filter(Boolean);

    const settlement = {
      driverId: selectedDriver,
      driverName,
      itemIds: selectedOrders, // Teraz to mogą być ID produktów
      orderDetails,
      ordersCount: selectedOrders.length,
      totalsByCurrency,
      status: 'utworzone',
      createdAt: new Date().toISOString(),
      createdBy: { id: currentUser.id, name: currentUser.name },
      history: [{ date: new Date().toISOString(), action: 'Utworzono rozliczenie', user: currentUser.name }]
    };

    try {
      const settlementId = await onAddSettlement(settlement);
      
      // Oznacz produkty/zamówienia jako rozliczone
      for (const itemId of selectedOrders) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;
        
        if (item.isProdukt) {
          // Rozliczenie produktu w zamówieniu łączonym
          const order = orders.find(o => o.id === item.orderId);
          if (order && order.produkty) {
            const updatedProdukty = [...order.produkty];
            if (updatedProdukty[item.produktIndex]) {
              updatedProdukty[item.produktIndex] = {
                ...updatedProdukty[item.produktIndex],
                rozliczone: true,
                dataRozliczenia: new Date().toISOString(),
                rozliczenieId: settlementId
              };
            }
            await onUpdateOrder(item.orderId, { produkty: updatedProdukty });
          }
        } else {
          // Rozliczenie całego zamówienia (stary typ)
          await onUpdateOrder(item.orderId, {
            rozliczone: true,
            dataRozliczenia: new Date().toISOString(),
            rozliczenieId: settlementId
          });
        }
      }

      setSelectedOrders([]);
      setSelectedDriver('');
      setView('list');
      alert('Rozliczenie zostało utworzone!');
    } catch (error) {
      console.error('Błąd tworzenia rozliczenia:', error);
      alert('Błąd podczas tworzenia rozliczenia');
    }
  };

  const handleDeleteSettlement = async (settlement) => {
    if (!isAdmin) return;
    
    const currencySummary = settlement.totalsByCurrency 
      ? Object.entries(settlement.totalsByCurrency).map(([c, v]) => `${formatCurrency(v.toReturn, c)}`).join(', ')
      : 'brak danych';

    if (!window.confirm(`Usunąć rozliczenie?\n\nKierowca: ${settlement.driverName}\nDo oddania: ${currencySummary}`)) {
      return;
    }

    try {
      for (const orderId of settlement.orderIds) {
        await onUpdateOrder(orderId, { rozliczone: false, dataRozliczenia: null, rozliczenieId: null });
      }
      await onDeleteSettlement(settlement.id);
      setViewingSettlement(null);
      alert('Rozliczenie usunięte');
    } catch (error) {
      console.error('Błąd usuwania:', error);
    }
  };

  const handleEditSettlement = async () => {
    if (!editingSettlement || !isAdmin) return;

    try {
      await onUpdateSettlement(editingSettlement.id, {
        ...editingSettlement,
        history: [...(editingSettlement.history || []), { date: new Date().toISOString(), action: `Edycja: ${editNote}`, user: currentUser.name }],
        lastEditedAt: new Date().toISOString(),
        lastEditedBy: { id: currentUser.id, name: currentUser.name }
      });
      setEditingSettlement(null);
      setEditNote('');
      setView('list');
    } catch (error) {
      console.error('Błąd edycji:', error);
    }
  };

  const filteredSettlements = isDriverView 
    ? settlements.filter(s => s.driverId === currentUser.id)
    : (selectedDriver ? settlements.filter(s => s.driverId === selectedDriver) : settlements);

  // Komponent wyświetlający sumy pogrupowane po walutach
  const CurrencyTotals = ({ totals, showDetails = true }) => {
    if (!totals || Object.keys(totals).length === 0) {
      return <div className="no-totals">Brak danych</div>;
    }

    return (
      <div className="currency-totals-grid">
        {Object.entries(totals).map(([currency, values]) => (
          <div key={currency} className="currency-total-card">
            <div className="currency-header">
              <span className="currency-flag">{currency === 'EUR' ? '🇪🇺' : currency === 'GBP' ? '🇬🇧' : currency === 'PLN' ? '🇵🇱' : currency === 'USD' ? '🇺🇸' : '💱'}</span>
              <span className="currency-code">{currency}</span>
            </div>
            {showDetails && (
              <>
                <div className="currency-row">
                  <span>Pobrano:</span>
                  <span className="value">{formatCurrency(values.collected, currency)}</span>
                </div>
                <div className="currency-row">
                  <span>Transport:</span>
                  <span className="value minus">- {formatCurrency(values.transport, currency)}</span>
                </div>
              </>
            )}
            <div className="currency-row total">
              <span>Do oddania:</span>
              <span className={`value ${values.toReturn >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(values.toReturn, currency)}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large settlements-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💰 Rozliczenia transportowe</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {!viewingSettlement && view !== 'edit' && (
            <div className="settlements-nav">
              <button className={`nav-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
                📋 Lista ({filteredSettlements.length})
              </button>
              {!isDriverView && (
                <button className={`nav-btn ${view === 'create' ? 'active' : ''}`} onClick={() => setView('create')}>
                  ➕ Nowe rozliczenie
                </button>
              )}
            </div>
          )}

          {/* SZCZEGÓŁY ROZLICZENIA */}
          {viewingSettlement && (
            <div className="settlement-detail-view">
              <button className="btn-back" onClick={() => setViewingSettlement(null)}>← Powrót</button>
              
              <div className="settlement-detail-header">
                <h3>Rozliczenie #{viewingSettlement.id?.slice(-6)}</h3>
                <span className={`status-badge ${viewingSettlement.status}`}>
                  {viewingSettlement.status === 'utworzone' ? '🆕 Oczekuje' : '✅ Rozliczone'}
                </span>
              </div>

              <div className="settlement-detail-meta">
                <span>🚚 {viewingSettlement.driverName}</span>
                <span>📅 {formatDate(viewingSettlement.createdAt)}</span>
                <span>👤 {viewingSettlement.createdBy?.name}</span>
              </div>

              {/* Podsumowanie po walutach */}
              <div className="settlement-currency-summary">
                <h4>💰 Podsumowanie do oddania</h4>
                <CurrencyTotals totals={viewingSettlement.totalsByCurrency} />
              </div>

              {/* Lista zamówień */}
              <div className="settlement-orders-section">
                <h4>📦 Zamówienia ({viewingSettlement.ordersCount})</h4>
                <div className="settlement-orders-grid">
                  {(viewingSettlement.orderDetails || []).map((od, idx) => (
                    <div key={idx} className="settlement-order-card">
                      <div className="order-card-header">
                        <span className="order-nr">{od.nrWlasny}</span>
                        <span className="order-date">{formatDate(od.dataDostawy)}</span>
                      </div>
                      <div className="order-card-client">
                        <strong>{od.klient}</strong>
                        <small>{od.adres?.substring(0, 40)}{od.adres?.length > 40 ? '...' : ''}</small>
                      </div>
                      {od.towar && <div className="order-card-product">📦 {od.towar.substring(0, 50)}{od.towar.length > 50 ? '...' : ''}</div>}
                      
                      {/* Rabat */}
                      {od.hasDiscount && (
                        <div className="order-discount-info">
                          <div className="discount-badge">🏷️ RABAT</div>
                          <div className="discount-details">
                            <span className="original-price">
                              Cena oryginalna: {formatCurrency(od.originalPrice, od.walutaPobrano)}
                            </span>
                            <span className="discount-amount">
                              Rabat: -{formatCurrency(od.discountAmount, od.walutaPobrano)}
                            </span>
                            <span className="discount-reason">
                              Powód: {od.discountReason}
                            </span>
                            {od.discountBy && (
                              <span className="discount-by">
                                Udzielony przez: {od.discountBy}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="order-card-amounts">
                        <div className="amount-row">
                          <span>Pobrano:</span>
                          <span>{formatCurrency(od.pobrano, od.walutaPobrano)}</span>
                        </div>
                        <div className="amount-row">
                          <span>Transport:</span>
                          <span className="minus">- {formatCurrency(od.transport, od.walutaTransport)}</span>
                        </div>
                        {od.walutaPobrano === od.walutaTransport && (
                          <div className="amount-row result">
                            <span>=</span>
                            <span className={od.pobrano - od.transport >= 0 ? 'positive' : 'negative'}>
                              {formatCurrency(od.pobrano - od.transport, od.walutaPobrano)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Historia */}
              {viewingSettlement.history?.length > 0 && (
                <div className="settlement-history-section">
                  <h4>📜 Historia</h4>
                  <div className="history-list">
                    {viewingSettlement.history.map((h, idx) => (
                      <div key={idx} className="history-item">
                        <span>{formatDate(h.date)}</span>
                        <span>{h.action}</span>
                        <span>— {h.user}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Akcje admina */}
              {isAdmin && (
                <div className="settlement-detail-actions">
                  {viewingSettlement.status === 'utworzone' && (
                    <button className="btn-accept" onClick={async () => {
                      await onUpdateSettlement(viewingSettlement.id, {
                        ...viewingSettlement,
                        status: 'rozliczone',
                        history: [...(viewingSettlement.history || []), { date: new Date().toISOString(), action: 'Oznaczono jako rozliczone', user: currentUser.name }]
                      });
                      setViewingSettlement({...viewingSettlement, status: 'rozliczone'});
                    }}>✅ Oznacz jako rozliczone</button>
                  )}
                  <button className="btn-edit" onClick={() => { setEditingSettlement(viewingSettlement); setView('edit'); setViewingSettlement(null); }}>✏️ Edytuj</button>
                  <button className="btn-delete" onClick={() => handleDeleteSettlement(viewingSettlement)}>🗑️ Usuń</button>
                </div>
              )}
            </div>
          )}

          {/* LISTA */}
          {view === 'list' && !viewingSettlement && (
            <div className="settlements-list-view">
              {!isDriverView && (
                <div className="settlements-filter">
                  <label>Kierowca:</label>
                  <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}>
                    <option value="">Wszyscy</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              <div className="settlements-list">
                {filteredSettlements.length === 0 ? (
                  <div className="empty-settlements">
                    <p>📭 Brak rozliczeń</p>
                  </div>
                ) : (
                  filteredSettlements.map(s => (
                    <div key={s.id} className="settlement-card clickable" onClick={() => setViewingSettlement(s)}>
                      <div className="settlement-header">
                        <div className="settlement-info">
                          <span className="driver">🚚 {s.driverName}</span>
                          <span className="date">📅 {formatDate(s.createdAt)}</span>
                          <span className="count">📦 {s.ordersCount}</span>
                        </div>
                        <span className={`status-badge ${s.status}`}>
                          {s.status === 'utworzone' ? '🆕 Oczekuje' : '✅ Rozliczone'}
                        </span>
                      </div>
                      
                      {/* Podsumowanie po walutach */}
                      <div className="settlement-currency-preview">
                        {s.totalsByCurrency ? (
                          Object.entries(s.totalsByCurrency).map(([currency, values]) => (
                            <div key={currency} className="currency-badge">
                              <span className="currency">{getCurrencySymbol(currency)}</span>
                              <span className={`amount ${values.toReturn >= 0 ? 'positive' : 'negative'}`}>
                                {values.toReturn >= 0 ? '+' : ''}{values.toReturn.toFixed(2)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="legacy-amount">
                            Do oddania: {formatCurrency(s.totalToReturn, s.currency)}
                          </span>
                        )}
                      </div>

                      <div className="click-hint">Kliknij aby zobaczyć szczegóły →</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TWORZENIE */}
          {view === 'create' && !isDriverView && !viewingSettlement && (
            <div className="settlements-create-view">
              <div className="create-form-row">
                <div className="form-group">
                  <label>Kierowca *</label>
                  <select value={selectedDriver} onChange={e => { setSelectedDriver(e.target.value); setSelectedOrders([]); }}>
                    <option value="">-- Wybierz --</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status zamówień</label>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="dostarczone">Dostarczone</option>
                    <option value="w_transporcie">W transporcie</option>
                    <option value="all">Wszystkie</option>
                  </select>
                </div>
              </div>

              {selectedDriver && (
                <>
                  <h4>📦 Do rozliczenia ({getUnsettledItems().length})</h4>
                  
                  {getUnsettledItems().length === 0 ? (
                    <div className="no-orders-info">
                      <p>✅ Wszystko rozliczone</p>
                    </div>
                  ) : (
                    <>
                      <div className="select-all-row">
                        <label>
                          <input type="checkbox" 
                            checked={selectedOrders.length === getUnsettledItems().length && selectedOrders.length > 0}
                            onChange={e => setSelectedOrders(e.target.checked ? getUnsettledItems().map(i => i.id) : [])}
                          />
                          Zaznacz wszystkie
                        </label>
                      </div>

                      <div className="orders-to-settle">
                        {getUnsettledItems().map(item => {
                          const collected = item.doPobrania || 0;
                          const collectedCurrency = item.waluta || 'PLN';
                          const transport = item.transportNetto || 0;
                          const transportCurrency = item.transportWaluta || 'PLN';
                          const isSelected = selectedOrders.includes(item.id);

                          return (
                            <div key={item.id} className={`order-to-settle ${isSelected ? 'selected' : ''}`}
                              onClick={() => setSelectedOrders(prev => isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id])}>
                              <input type="checkbox" checked={isSelected} readOnly />
                              <div className="order-info">
                                <div className="nr">
                                  {item.nrPodzamowienia || item.nrWlasny}
                                  {item.isProdukt && <span className="product-badge">📦</span>}
                                </div>
                                <div className="client">{item.klient?.imie || '—'}</div>
                                <div className="towar-preview">{item.towar?.substring(0, 40) || '—'}...</div>
                                <small>{formatDate(item.dataDostawy)}</small>
                              </div>
                              <div className="order-amounts">
                                <div>Pobrano: <strong>{formatCurrency(collected, collectedCurrency)}</strong></div>
                                <div>Transport: <strong className="minus">- {formatCurrency(transport, transportCurrency)}</strong></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Podsumowanie */}
                      {selectedOrders.length > 0 && (
                        <div className="settlement-summary">
                          <h4>📊 Podsumowanie ({selectedOrders.length} pozycji)</h4>
                          <CurrencyTotals totals={calculateTotalsByCurrency()} />
                          <button className="btn-primary btn-create" onClick={handleCreateSettlement}>
                            💰 Utwórz rozliczenie
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* EDYCJA */}
          {view === 'edit' && editingSettlement && isAdmin && (
            <div className="settlements-edit-view">
              <button className="btn-back" onClick={() => { setEditingSettlement(null); setView('list'); }}>← Powrót</button>
              <h3>✏️ Edycja rozliczenia</h3>
              <div className="edit-info">
                <p><strong>Kierowca:</strong> {editingSettlement.driverName}</p>
                <p><strong>Zamówień:</strong> {editingSettlement.ordersCount}</p>
              </div>
              <div className="form-group">
                <label>Notatka *</label>
                <textarea value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Co zostało zmienione..." rows={3} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={editingSettlement.status} onChange={e => setEditingSettlement({...editingSettlement, status: e.target.value})}>
                  <option value="utworzone">Oczekuje</option>
                  <option value="rozliczone">Rozliczone</option>
                </select>
              </div>
              <div className="edit-actions">
                <button className="btn-secondary" onClick={() => { setEditingSettlement(null); setView('list'); }}>Anuluj</button>
                <button className="btn-primary" onClick={handleEditSettlement} disabled={!editNote.trim()}>💾 Zapisz</button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>
    </div>
  );
};

// GŁÓWNA APLIKACJA
// ============================================

// ============================================
// PUBLICZNY CZAT DLA KLIENTA
// ============================================

const PublicChat = () => {
  const [step, setStep] = useState('form'); // 'form' lub 'chat'
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [assignedTo, setAssignedTo] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  // Formularz startowy
  const [formData, setFormData] = useState({
    name: '',
    country: 'PL',
    email: '',
    phone: '',
    category: '',
    customWidth: '',
    customDepth: '',
    cornerSide: 'left'
  });

  const categories = [
    { id: 'sofy', name: '🛋️ Sofy', icon: '🛋️' },
    { id: 'narozniki', name: '🔲 Narożniki', icon: '🔲' },
    { id: 'fotele', name: '💺 Fotele', icon: '💺' },
    { id: 'meble_twarde', name: '🪑 Meble twarde', icon: '🪑' },
    { id: 'naroznik_na_wymiar', name: '📐 Narożnik na wymiar', icon: '📐' }
  ];

  const countries = [
    { code: 'PL', name: '🇵🇱 Polska' },
    { code: 'DE', name: '🇩🇪 Niemcy' },
    { code: 'NL', name: '🇳🇱 Holandia' },
    { code: 'GB', name: '🇬🇧 Wielka Brytania' },
    { code: 'FR', name: '🇫🇷 Francja' },
    { code: 'BE', name: '🇧🇪 Belgia' },
    { code: 'AT', name: '🇦🇹 Austria' },
    { code: 'CZ', name: '🇨🇿 Czechy' },
    { code: 'SK', name: '🇸🇰 Słowacja' },
    { code: 'IT', name: '🇮🇹 Włochy' },
    { code: 'ES', name: '🇪🇸 Hiszpania' },
    { code: 'CH', name: '🇨🇭 Szwajcaria' },
    { code: 'SE', name: '🇸🇪 Szwecja' },
    { code: 'NO', name: '🇳🇴 Norwegia' },
    { code: 'DK', name: '🇩🇰 Dania' },
    { code: 'OTHER', name: '🌍 Inny' }
  ];

  // Rozpocznij czat
  const startChat = async () => {
    if (!formData.name || !formData.category) {
      alert('Wypełnij imię i wybierz kategorię');
      return;
    }

    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase');

      const chatData = {
        clientName: formData.name,
        clientCountry: formData.country,
        clientEmail: formData.email,
        clientPhone: formData.phone,
        category: formData.category,
        categoryName: categories.find(c => c.id === formData.category)?.name || formData.category,
        customDimensions: formData.category === 'naroznik_na_wymiar' ? {
          width: formData.customWidth,
          depth: formData.customDepth,
          side: formData.cornerSide
        } : null,
        status: 'waiting', // waiting, active, closed
        assignedTo: null,
        assignedToName: null,
        messages: [],
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        unreadByStaff: true,
        unreadByClient: false
      };

      const docRef = await addDoc(collection(db, 'chats'), chatData);
      setChatId(docRef.id);
      
      // Zapisz w localStorage żeby można było wrócić do czatu
      localStorage.setItem('herraton_chat_id', docRef.id);
      localStorage.setItem('herraton_chat_name', formData.name);
      
      setStep('chat');
      
      // Dodaj wiadomość powitalną
      const welcomeMsg = {
        id: 'welcome',
        type: 'system',
        text: `Witaj ${formData.name}! Dziękujemy za kontakt. Jeden z naszych konsultantów wkrótce dołączy do rozmowy.`,
        timestamp: new Date()
      };
      setMessages([welcomeMsg]);
      
    } catch (err) {
      console.error('Błąd tworzenia czatu:', err);
      alert('Wystąpił błąd. Spróbuj ponownie.');
    }
  };

  // Nasłuchuj wiadomości
  useEffect(() => {
    if (!chatId) return;

    let unsubscribe = null;

    const loadMessages = async () => {
      try {
        const { doc, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('./firebase');

        unsubscribe = onSnapshot(doc(db, 'chats', chatId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setMessages(data.messages || []);
            setAssignedTo(data.assignedToName || null);
            
            // Oznacz jako przeczytane przez klienta
            if (data.unreadByClient) {
              import('firebase/firestore').then(({ updateDoc }) => {
                import('./firebase').then(({ db }) => {
                  updateDoc(doc(db, 'chats', chatId), { unreadByClient: false });
                });
              });
            }
          }
        });
      } catch (err) {
        console.error('Błąd ładowania wiadomości:', err);
      }
    };

    loadMessages();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [chatId]);

  // Sprawdź czy jest zapisany czat
  useEffect(() => {
    const savedChatId = localStorage.getItem('herraton_chat_id');
    const savedName = localStorage.getItem('herraton_chat_name');
    
    if (savedChatId) {
      setChatId(savedChatId);
      setFormData(prev => ({ ...prev, name: savedName || '' }));
      setStep('chat');
    }
  }, []);

  // Wyślij wiadomość
  const sendMessage = async () => {
    if (!newMessage.trim() || !chatId) return;

    setSending(true);
    try {
      const { doc, updateDoc, arrayUnion, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase');

      const message = {
        id: Date.now().toString(),
        type: 'client',
        text: newMessage.trim(),
        timestamp: new Date().toISOString(),
        senderName: formData.name || localStorage.getItem('herraton_chat_name')
      };

      await updateDoc(doc(db, 'chats', chatId), {
        messages: arrayUnion(message),
        lastMessageAt: serverTimestamp(),
        unreadByStaff: true
      });

      setNewMessage('');
    } catch (err) {
      console.error('Błąd wysyłania:', err);
    } finally {
      setSending(false);
    }
  };

  // Wyślij zdjęcie
  const sendPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;

    setUploadingPhoto(true);
    try {
      // Konwertuj na base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        
        const { doc, updateDoc, arrayUnion, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('./firebase');

        const message = {
          id: Date.now().toString(),
          type: 'client',
          text: '',
          photo: base64,
          timestamp: new Date().toISOString(),
          senderName: formData.name || localStorage.getItem('herraton_chat_name')
        };

        await updateDoc(doc(db, 'chats', chatId), {
          messages: arrayUnion(message),
          lastMessageAt: serverTimestamp(),
          unreadByStaff: true
        });

        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Błąd wysyłania zdjęcia:', err);
      setUploadingPhoto(false);
    }
  };

  // Zakończ czat
  const endChat = () => {
    if (window.confirm('Czy na pewno chcesz zakończyć czat?')) {
      localStorage.removeItem('herraton_chat_id');
      localStorage.removeItem('herraton_chat_name');
      setChatId(null);
      setMessages([]);
      setStep('form');
      setFormData({
        name: '',
        country: 'PL',
        email: '',
        phone: '',
        category: '',
        customWidth: '',
        customDepth: '',
        cornerSide: 'left'
      });
    }
  };

  // Komponent wizualizacji narożnika
  const CornerVisualization = ({ width, depth, side }) => {
    const w = parseInt(width) || 250;
    const d = parseInt(depth) || 150;
    const maxSize = 200;
    const scale = Math.min(maxSize / Math.max(w, d), 1);
    const scaledW = w * scale;
    const scaledD = d * scale;

    return (
      <div style={{background:'#F8FAFC',borderRadius:'12px',padding:'16px',marginTop:'12px'}}>
        <div style={{fontSize:'12px',fontWeight:'600',color:'#64748B',marginBottom:'12px',textAlign:'center'}}>
          📐 Wizualizacja narożnika
        </div>
        <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'150px'}}>
          <svg width={maxSize + 60} height={maxSize + 60} viewBox={`0 0 ${maxSize + 60} ${maxSize + 60}`}>
            {side === 'left' ? (
              <>
                {/* Narożnik lewy */}
                <path 
                  d={`M 30 30 L ${30 + scaledW} 30 L ${30 + scaledW} ${30 + scaledD * 0.4} L ${30 + scaledD} ${30 + scaledD * 0.4} L ${30 + scaledD} ${30 + scaledD} L 30 ${30 + scaledD} Z`}
                  fill="#8B5CF6"
                  stroke="#6D28D9"
                  strokeWidth="2"
                />
                {/* Wymiar szerokość */}
                <line x1="30" y1="20" x2={30 + scaledW} y2="20" stroke="#374151" strokeWidth="1" markerEnd="url(#arrow)" markerStart="url(#arrow2)"/>
                <text x={30 + scaledW/2} y="12" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="600">{width} cm</text>
                {/* Wymiar głębokość */}
                <line x1="20" y1="30" x2="20" y2={30 + scaledD} stroke="#374151" strokeWidth="1"/>
                <text x="10" y={30 + scaledD/2} textAnchor="middle" fontSize="11" fill="#374151" fontWeight="600" transform={`rotate(-90, 10, ${30 + scaledD/2})`}>{depth} cm</text>
              </>
            ) : (
              <>
                {/* Narożnik prawy */}
                <path 
                  d={`M 30 30 L ${30 + scaledW} 30 L ${30 + scaledW} ${30 + scaledD} L ${30 + scaledW - scaledD} ${30 + scaledD} L ${30 + scaledW - scaledD} ${30 + scaledD * 0.4} L 30 ${30 + scaledD * 0.4} Z`}
                  fill="#8B5CF6"
                  stroke="#6D28D9"
                  strokeWidth="2"
                />
                {/* Wymiar szerokość */}
                <line x1="30" y1="20" x2={30 + scaledW} y2="20" stroke="#374151" strokeWidth="1"/>
                <text x={30 + scaledW/2} y="12" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="600">{width} cm</text>
                {/* Wymiar głębokość */}
                <line x1={40 + scaledW} y1="30" x2={40 + scaledW} y2={30 + scaledD} stroke="#374151" strokeWidth="1"/>
                <text x={50 + scaledW} y={30 + scaledD/2} textAnchor="middle" fontSize="11" fill="#374151" fontWeight="600" transform={`rotate(90, ${50 + scaledW}, ${30 + scaledD/2})`}>{depth} cm</text>
              </>
            )}
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6" fill="#374151"/>
              </marker>
              <marker id="arrow2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M6,0 L0,3 L6,6" fill="#374151"/>
              </marker>
            </defs>
          </svg>
        </div>
        <div style={{textAlign:'center',fontSize:'11px',color:'#94A3B8',marginTop:'8px'}}>
          Strona narożnika: {side === 'left' ? '⬅️ Lewa' : '➡️ Prawa'}
        </div>
      </div>
    );
  };

  // FORMULARZ STARTOWY
  if (step === 'form') {
    return (
      <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#1E293B 0%,#334155 100%)',padding:'20px',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{width:'100%',maxWidth:'450px'}}>
          {/* Header */}
          <div style={{textAlign:'center',marginBottom:'24px'}}>
            <div style={{fontSize:'48px',marginBottom:'12px'}}>🛋️</div>
            <h1 style={{color:'white',margin:'0 0 8px',fontSize:'28px',fontWeight:'700'}}>Herraton Meble</h1>
            <p style={{color:'rgba(255,255,255,0.7)',margin:0,fontSize:'14px'}}>Rozpocznij rozmowę z naszym konsultantem</p>
          </div>

          {/* Powiadomienie o aplikacji */}
          <div style={{background:'rgba(139,92,246,0.2)',border:'1px solid rgba(139,92,246,0.4)',borderRadius:'12px',padding:'14px',marginBottom:'20px',display:'flex',alignItems:'center',gap:'12px'}}>
            <span style={{fontSize:'24px'}}>📱</span>
            <div>
              <div style={{color:'white',fontWeight:'600',fontSize:'13px'}}>Pobierz naszą aplikację!</div>
              <div style={{color:'rgba(255,255,255,0.7)',fontSize:'12px'}}>Otrzymuj powiadomienia o odpowiedziach</div>
            </div>
          </div>

          {/* Formularz */}
          <div style={{background:'white',borderRadius:'20px',padding:'24px',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
              {/* Imię */}
              <div>
                <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>
                  Imię *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Twoje imię"
                  style={{width:'100%',padding:'12px 14px',borderRadius:'10px',border:'1px solid #E2E8F0',fontSize:'15px',boxSizing:'border-box'}}
                />
              </div>

              {/* Kraj */}
              <div>
                <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>
                  Kraj
                </label>
                <select
                  value={formData.country}
                  onChange={(e) => setFormData({...formData, country: e.target.value})}
                  style={{width:'100%',padding:'12px 14px',borderRadius:'10px',border:'1px solid #E2E8F0',fontSize:'15px',boxSizing:'border-box'}}
                >
                  {countries.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Email i Telefon */}
              <div style={{display:'flex',gap:'12px'}}>
                <div style={{flex:1}}>
                  <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="email@example.com"
                    style={{width:'100%',padding:'12px 14px',borderRadius:'10px',border:'1px solid #E2E8F0',fontSize:'15px',boxSizing:'border-box'}}
                  />
                </div>
                <div style={{flex:1}}>
                  <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>
                    Telefon
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="+48..."
                    style={{width:'100%',padding:'12px 14px',borderRadius:'10px',border:'1px solid #E2E8F0',fontSize:'15px',boxSizing:'border-box'}}
                  />
                </div>
              </div>

              {/* Kategoria */}
              <div>
                <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'10px'}}>
                  Czym jesteś zainteresowany? *
                </label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFormData({...formData, category: cat.id})}
                      style={{
                        padding:'14px 12px',
                        borderRadius:'10px',
                        border: formData.category === cat.id ? '2px solid #8B5CF6' : '1px solid #E2E8F0',
                        background: formData.category === cat.id ? '#F5F3FF' : 'white',
                        cursor:'pointer',
                        textAlign:'center',
                        transition:'all 0.2s'
                      }}
                    >
                      <div style={{fontSize:'24px',marginBottom:'4px'}}>{cat.icon}</div>
                      <div style={{fontSize:'12px',fontWeight:'600',color: formData.category === cat.id ? '#8B5CF6' : '#374151'}}>
                        {cat.name.replace(cat.icon + ' ', '')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Wymiary dla narożnika na wymiar */}
              {formData.category === 'naroznik_na_wymiar' && (
                <div style={{background:'#F5F3FF',borderRadius:'12px',padding:'16px',border:'1px solid #C4B5FD'}}>
                  <div style={{fontSize:'13px',fontWeight:'600',color:'#5B21B6',marginBottom:'12px'}}>
                    📐 Podaj wymiary narożnika
                  </div>
                  <div style={{display:'flex',gap:'12px',marginBottom:'12px'}}>
                    <div style={{flex:1}}>
                      <label style={{display:'block',fontSize:'11px',color:'#6B7280',marginBottom:'4px'}}>Szerokość (cm)</label>
                      <input
                        type="number"
                        value={formData.customWidth}
                        onChange={(e) => setFormData({...formData, customWidth: e.target.value})}
                        placeholder="np. 250"
                        style={{width:'100%',padding:'10px',borderRadius:'8px',border:'1px solid #C4B5FD',fontSize:'14px',boxSizing:'border-box'}}
                      />
                    </div>
                    <div style={{flex:1}}>
                      <label style={{display:'block',fontSize:'11px',color:'#6B7280',marginBottom:'4px'}}>Głębokość (cm)</label>
                      <input
                        type="number"
                        value={formData.customDepth}
                        onChange={(e) => setFormData({...formData, customDepth: e.target.value})}
                        placeholder="np. 150"
                        style={{width:'100%',padding:'10px',borderRadius:'8px',border:'1px solid #C4B5FD',fontSize:'14px',boxSizing:'border-box'}}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'11px',color:'#6B7280',marginBottom:'4px'}}>Strona narożnika</label>
                    <div style={{display:'flex',gap:'10px'}}>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, cornerSide: 'left'})}
                        style={{
                          flex:1,
                          padding:'10px',
                          borderRadius:'8px',
                          border: formData.cornerSide === 'left' ? '2px solid #8B5CF6' : '1px solid #C4B5FD',
                          background: formData.cornerSide === 'left' ? '#8B5CF6' : 'white',
                          color: formData.cornerSide === 'left' ? 'white' : '#374151',
                          cursor:'pointer',
                          fontWeight:'600',
                          fontSize:'13px'
                        }}
                      >
                        ⬅️ Lewy
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, cornerSide: 'right'})}
                        style={{
                          flex:1,
                          padding:'10px',
                          borderRadius:'8px',
                          border: formData.cornerSide === 'right' ? '2px solid #8B5CF6' : '1px solid #C4B5FD',
                          background: formData.cornerSide === 'right' ? '#8B5CF6' : 'white',
                          color: formData.cornerSide === 'right' ? 'white' : '#374151',
                          cursor:'pointer',
                          fontWeight:'600',
                          fontSize:'13px'
                        }}
                      >
                        ➡️ Prawy
                      </button>
                    </div>
                  </div>
                  
                  {/* Wizualizacja */}
                  {formData.customWidth && formData.customDepth && (
                    <CornerVisualization 
                      width={formData.customWidth} 
                      depth={formData.customDepth} 
                      side={formData.cornerSide}
                    />
                  )}
                </div>
              )}

              {/* Przycisk */}
              <button
                onClick={startChat}
                style={{
                  width:'100%',
                  padding:'16px',
                  borderRadius:'12px',
                  border:'none',
                  background:'linear-gradient(135deg,#8B5CF6,#6D28D9)',
                  color:'white',
                  fontSize:'16px',
                  fontWeight:'700',
                  cursor:'pointer',
                  marginTop:'8px'
                }}
              >
                💬 Rozpocznij czat
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // OKNO CZATU
  return (
    <div style={{minHeight:'100vh',background:'#F1F5F9',display:'flex',flexDirection:'column'}}>
      {/* Header czatu */}
      <div style={{background:'linear-gradient(135deg,#1E293B,#334155)',padding:'16px 20px',color:'white'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:'18px',fontWeight:'700'}}>🛋️ Herraton Meble</div>
            <div style={{fontSize:'13px',opacity:0.8,marginTop:'4px'}}>
              {assignedTo ? (
                <span>💬 Rozmawiasz z: <strong>{assignedTo}</strong></span>
              ) : (
                <span>⏳ Oczekiwanie na konsultanta...</span>
              )}
            </div>
          </div>
          <button
            onClick={endChat}
            style={{background:'rgba(255,255,255,0.1)',border:'none',padding:'8px 12px',borderRadius:'8px',color:'white',cursor:'pointer',fontSize:'12px'}}
          >
            ✕ Zakończ
          </button>
        </div>
        <div style={{fontSize:'12px',opacity:0.7,marginTop:'8px'}}>
          👤 {formData.name || localStorage.getItem('herraton_chat_name')}
        </div>
      </div>

      {/* Wiadomości */}
      <div style={{flex:1,overflow:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} style={{
            display:'flex',
            justifyContent: msg.type === 'client' ? 'flex-end' : msg.type === 'system' ? 'center' : 'flex-start'
          }}>
            {msg.type === 'system' ? (
              <div style={{background:'#E2E8F0',padding:'10px 16px',borderRadius:'20px',fontSize:'13px',color:'#64748B',maxWidth:'80%',textAlign:'center'}}>
                {msg.text}
              </div>
            ) : msg.type === 'visualization' ? (
              <div style={{background:'white',padding:'16px',borderRadius:'16px',boxShadow:'0 2px 8px rgba(0,0,0,0.1)',maxWidth:'300px'}}>
                <div style={{fontSize:'12px',color:'#64748B',marginBottom:'8px'}}>📐 Wizualizacja od konsultanta:</div>
                <CornerVisualization width={msg.width} depth={msg.depth} side={msg.side} />
              </div>
            ) : (
              <div style={{
                background: msg.type === 'client' ? 'linear-gradient(135deg,#8B5CF6,#6D28D9)' : 'white',
                color: msg.type === 'client' ? 'white' : '#1E293B',
                padding:'12px 16px',
                borderRadius: msg.type === 'client' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                maxWidth:'75%',
                boxShadow:'0 2px 8px rgba(0,0,0,0.1)'
              }}>
                {msg.type === 'staff' && (
                  <div style={{fontSize:'11px',color:'#8B5CF6',fontWeight:'600',marginBottom:'4px'}}>
                    {msg.senderName}
                  </div>
                )}
                {msg.photo && (
                  <img src={msg.photo} alt="Zdjęcie" style={{maxWidth:'100%',borderRadius:'8px',marginBottom: msg.text ? '8px' : 0}} />
                )}
                {msg.text && <div style={{fontSize:'14px',lineHeight:'1.4'}}>{msg.text}</div>}
                <div style={{fontSize:'10px',opacity:0.7,marginTop:'6px',textAlign:'right'}}>
                  {new Date(msg.timestamp).toLocaleTimeString('pl-PL', {hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{background:'white',padding:'16px',borderTop:'1px solid #E2E8F0'}}>
        <div style={{display:'flex',gap:'10px',alignItems:'flex-end'}}>
          {/* Przycisk zdjęcia */}
          <label style={{
            width:'44px',
            height:'44px',
            borderRadius:'12px',
            background:'#F1F5F9',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            cursor:'pointer',
            flexShrink:0
          }}>
            <input
              type="file"
              accept="image/*"
              onChange={sendPhoto}
              style={{display:'none'}}
              disabled={uploadingPhoto}
            />
            {uploadingPhoto ? '⏳' : '📷'}
          </label>
          
          {/* Input wiadomości */}
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Napisz wiadomość..."
            style={{
              flex:1,
              padding:'12px 16px',
              borderRadius:'12px',
              border:'1px solid #E2E8F0',
              fontSize:'15px',
              outline:'none'
            }}
          />
          
          {/* Przycisk wyślij */}
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim()}
            style={{
              width:'44px',
              height:'44px',
              borderRadius:'12px',
              border:'none',
              background: newMessage.trim() ? 'linear-gradient(135deg,#8B5CF6,#6D28D9)' : '#E2E8F0',
              color:'white',
              cursor: newMessage.trim() ? 'pointer' : 'default',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              fontSize:'18px',
              flexShrink:0
            }}
          >
            {sending ? '⏳' : '➤'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PUBLICZNY FORMULARZ REKLAMACJI DLA KLIENTA
// ============================================

const PublicComplaintForm = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState(null);
  const [complaintData, setComplaintData] = useState(null); // Istniejąca reklamacja
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState('form'); // 'form', 'tracking' lub 'producer'
  
  // Sprawdź czy to widok producenta
  const urlParams = new URLSearchParams(window.location.search);
  const isProducerView = urlParams.get('view') === 'producer';
  
  // Formularz nowej reklamacji
  const [complaintType, setComplaintType] = useState('uszkodzenie');
  const [description, setDescription] = useState('');
  const [expectations, setExpectations] = useState('');
  const [photos, setPhotos] = useState([]);
  
  // Dane klienta (dla formularza uniwersalnego bez tokenu)
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [manualOrderNumber, setManualOrderNumber] = useState('');
  
  // Wiadomości
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  
  // Zdjęcia w czacie
  const [chatPhotos, setChatPhotos] = useState([]);
  
  // Lightbox do powiększania zdjęć
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  
  // Czy to formularz uniwersalny (bez tokenu)
  const isUniversalForm = !token || token === 'nowy';
  
  // Helper do formatowania daty
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
  // Status reklamacji
  const getStatusInfo = (status) => {
    const statuses = {
      'nowa': { name: 'Nowa', color: '#DC2626', bg: '#FEE2E2', icon: '🆕' },
      'w_trakcie': { name: 'W trakcie', color: '#F59E0B', bg: '#FEF3C7', icon: '⏳' },
      'oczekuje_na_klienta': { name: 'Oczekuje na odpowiedź', color: '#3B82F6', bg: '#DBEAFE', icon: '💬' },
      'rozwiazana': { name: 'Rozwiązana', color: '#10B981', bg: '#D1FAE5', icon: '✅' },
      'odrzucona': { name: 'Odrzucona', color: '#6B7280', bg: '#F3F4F6', icon: '❌' }
    };
    return statuses[status] || statuses['nowa'];
  };
  
  // Upload zdjęć do czatu
  const handleChatPhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert('Zdjęcie jest za duże (max 10MB)');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 800;
          let width = img.width;
          let height = img.height;
          
          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          setChatPhotos(prev => [...prev, compressedBase64]);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
    
    e.target.value = '';
  };
  
  const removeChatPhoto = (index) => {
    setChatPhotos(prev => prev.filter((_, i) => i !== index));
  };
  
  // Wczytaj dane zamówienia i reklamacji
  useEffect(() => {
    const loadData = async () => {
      // Formularz uniwersalny (bez tokenu lub token='nowy')
      if (!token || token === 'nowy') {
        setLoading(false);
        return;
      }
      
      try {
        const { collection, query, where, getDocs, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        
        // Szukaj zamówienia z tym tokenem
        const ordersRef = collection(db, 'orders');
        const orderQuery = query(ordersRef, where('complaintToken', '==', token));
        const orderSnapshot = await getDocs(orderQuery);
        
        if (orderSnapshot.empty) {
          // Może to jest token reklamacji (klient wraca do istniejącej reklamacji)
          const complaintsRef = collection(db, 'complaints');
          const complaintQuery = query(complaintsRef, where('complaintToken', '==', token));
          const complaintSnapshot = await getDocs(complaintQuery);
          
          if (!complaintSnapshot.empty) {
            const complaintDoc = complaintSnapshot.docs[0];
            setComplaintData({ id: complaintDoc.id, ...complaintDoc.data() });
            
            // Nasłuchuj na zmiany
            onSnapshot(complaintQuery, (snapshot) => {
              if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                setComplaintData({ id: doc.id, ...doc.data() });
              }
            });
            
            // Sprawdź czy to widok producenta
            setView(isProducerView ? 'producer' : 'tracking');
            setLoading(false);
            return;
          }
          
          setError('Nieprawidłowy lub wygasły link do reklamacji.');
          setLoading(false);
          return;
        }
        
        const orderDoc = orderSnapshot.docs[0];
        const order = { id: orderDoc.id, ...orderDoc.data() };
        setOrderData(order);
        
        // Szukaj istniejącej reklamacji dla tego tokenu
        const complaintsRef = collection(db, 'complaints');
        const complaintQuery = query(complaintsRef, where('complaintToken', '==', token));
        
        // Nasłuchuj na zmiany w reklamacji (real-time)
        onSnapshot(complaintQuery, (snapshot) => {
          if (!snapshot.empty) {
            const complaintDoc = snapshot.docs[0];
            setComplaintData({ id: complaintDoc.id, ...complaintDoc.data() });
            setView('tracking');
          }
        });
        
        // Sprawdź czy już jest reklamacja
        const complaintSnapshot = await getDocs(complaintQuery);
        if (!complaintSnapshot.empty) {
          const complaintDoc = complaintSnapshot.docs[0];
          setComplaintData({ id: complaintDoc.id, ...complaintDoc.data() });
          setView('tracking');
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Błąd wczytywania danych:', err);
        setError('Wystąpił błąd. Spróbuj ponownie później.');
        setLoading(false);
      }
    };
    
    loadData();
  }, [token, isProducerView]);
  
  // Obsługa zdjęć - ULEPSZONA KOMPRESJA
  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert('Zdjęcie jest za duże (max 10MB)');
        return;
      }
      
      // Kompresuj i konwertuj na base64
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Silniejsza kompresja zdjęcia
          const canvas = document.createElement('canvas');
          const maxSize = 800; // Mniejszy rozmiar dla lepszej kompresji
          let width = img.width;
          let height = img.height;
          
          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Jakość 0.6 dla mniejszego rozmiaru
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          setPhotos(prev => [...prev, compressedBase64]);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };
  
  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };
  
  // Wysyłanie reklamacji
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!description.trim()) {
      alert('Proszę opisać problem.');
      return;
    }
    
    // Walidacja dla formularza uniwersalnego
    if (isUniversalForm) {
      if (!clientName.trim()) {
        alert('Proszę podać imię i nazwisko.');
        return;
      }
      if (!clientEmail.trim()) {
        alert('Proszę podać adres email.');
        return;
      }
    }
    
    setSubmitting(true);
    
    try {
      const { collection, addDoc } = await import('firebase/firestore');
      const { db, uploadMultipleImages } = await import('./firebase');
      
      // Upload zdjęć do Firebase Storage (jeśli są)
      let uploadedPhotoUrls = [];
      if (photos.length > 0) {
        try {
          uploadedPhotoUrls = await uploadMultipleImages(photos, 'complaints');
        } catch (uploadErr) {
          console.error('Błąd uploadu zdjęć:', uploadErr);
          // Jeśli upload nie działa, spróbuj zapisać jako base64 (fallback)
          uploadedPhotoUrls = photos;
        }
      }
      
      // Generuj numer reklamacji
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const complaintNumber = `RK/${year}/${month}/${random}`;
      
      // Generuj token do śledzenia (dla formularza uniwersalnego lub użyj istniejącego)
      const trackingToken = isUniversalForm 
        ? `public_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        : token;
      
      const complaint = {
        numer: complaintNumber,
        complaintToken: trackingToken, // Zapisz token żeby później można było śledzić
        orderId: orderData?.id || null,
        nrZamowienia: orderData?.nrWlasny || manualOrderNumber || 'Brak',
        klient: orderData?.klient?.imie || clientName || 'Klient',
        klientEmail: orderData?.klient?.email || clientEmail || '',
        klientTelefon: orderData?.klient?.telefon || clientPhone || '',
        typ: complaintType,
        opis: description,
        oczekiwaniaKlienta: expectations,
        zdjecia: uploadedPhotoUrls, // Teraz to są URLe z Firebase Storage
        status: 'nowa',
        priorytet: 'normalny',
        dataUtworzenia: new Date().toISOString(),
        zrodlo: isUniversalForm ? 'formularz_publiczny' : 'formularz_klienta',
        utworzonePrzez: {
          id: 'klient',
          nazwa: orderData?.klient?.imie || clientName || 'Klient',
          rola: 'klient',
          rolaLabel: 'Klient'
        },
        wiadomosci: [{
          id: Date.now().toString(),
          autor: 'klient',
          autorNazwa: orderData?.klient?.imie || clientName || 'Klient',
          tresc: description,
          data: new Date().toISOString(),
          zdjecia: uploadedPhotoUrls // URLe z Firebase Storage
        }],
        historia: [{
          data: new Date().toISOString(),
          uzytkownik: orderData?.klient?.imie || clientName || 'Klient',
          akcja: 'Reklamacja zgłoszona przez formularz online'
        }]
      };
      
      const docRef = await addDoc(collection(db, 'complaints'), complaint);
      setComplaintData({ id: docRef.id, ...complaint });
      
      // Wyślij email z potwierdzeniem i linkiem do śledzenia
      const customerEmail = orderData?.klient?.email || clientEmail;
      const customerName = orderData?.klient?.imie || clientName || 'Kliencie';
      const trackingLink = `${window.location.origin}/reklamacja/${trackingToken}`;
      
      if (customerEmail) {
        const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; text-align: center;">
              <div style="font-size: 50px; margin-bottom: 10px;">✅</div>
              <h1 style="color: white; margin: 0; font-size: 24px;">Reklamacja przyjęta!</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${complaintNumber}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Szanowna/y <strong>${customerName}</strong>,</p>
              <p style="margin: 0 0 20px 0; color: #6B7280; font-size: 15px; line-height: 1.6;">
                Dziękujemy za zgłoszenie reklamacji. Twoje zgłoszenie zostało zarejestrowane w naszym systemie i zostanie rozpatrzone najszybciej jak to możliwe.
              </p>
              
              <div style="background: #F0FDF4; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px solid #86EFAC;">
                <p style="margin: 0 0 10px 0; color: #166534; font-weight: 600;">📋 Szczegóły reklamacji:</p>
                <p style="margin: 5px 0; color: #166534;">Numer: <strong>${complaintNumber}</strong></p>
                <p style="margin: 5px 0; color: #166534;">Zamówienie: <strong>${complaint.nrZamowienia}</strong></p>
                <p style="margin: 5px 0; color: #166534;">Status: <strong>Nowa</strong></p>
              </div>
              
              <p style="margin: 20px 0; color: #374151; font-size: 15px; text-align: center;">
                <strong>📧 Pod poniższym linkiem możesz śledzić status swojej reklamacji oraz komunikować się z naszym zespołem:</strong>
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${trackingLink}" style="display: inline-block; background: linear-gradient(135deg, #6366F1, #4F46E5); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">🔍 ŚLEDŹ REKLAMACJĘ</a>
              </div>
              
              <div style="background: #FEF3C7; padding: 15px; border-radius: 10px; margin-top: 20px;">
                <p style="margin: 0; color: #92400E; font-size: 14px;">
                  💡 <strong>Zachowaj ten email!</strong> Link powyżej pozwoli Ci w każdej chwili sprawdzić status reklamacji i odpowiedzieć na nasze wiadomości.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px 30px 30px;">
              <p style="margin: 0; color: #6B7280; font-size: 14px;">Pozdrawiamy,<br><strong>Zespół Obsługi Klienta</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px; background-color: #F9FAFB; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">Herraton • System obsługi reklamacji</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        // Wyślij email
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: customerEmail,
            toName: customerName,
            subject: `Potwierdzenie reklamacji ${complaintNumber}`,
            textContent: `Dziękujemy za zgłoszenie reklamacji ${complaintNumber}. Śledź status pod linkiem: ${trackingLink}`,
            htmlContent: htmlEmail
          })
        }).catch(err => console.error('Błąd wysyłania emaila:', err));
      }
      
      setView('success');
      
    } catch (err) {
      console.error('Błąd zapisywania reklamacji:', err);
      alert('Wystąpił błąd podczas wysyłania reklamacji. Spróbuj ponownie.');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Wysyłanie wiadomości od klienta
  const handleSendMessage = async () => {
    if ((!newMessage.trim() && chatPhotos.length === 0) || !complaintData) return;
    
    setSendingMessage(true);
    
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      // Upload zdjęć jeśli są
      let uploadedPhotoUrls = [];
      if (chatPhotos.length > 0) {
        try {
          const { uploadMultipleImages } = await import('./firebase');
          uploadedPhotoUrls = await uploadMultipleImages(chatPhotos, 'complaints/chat');
        } catch (uploadErr) {
          console.error('Błąd uploadu zdjęć:', uploadErr);
          // Fallback - zapisz jako base64
          uploadedPhotoUrls = chatPhotos;
        }
      }
      
      // Pobierz nazwę klienta z różnych źródeł
      const clientDisplayName = orderData?.klient?.imie || complaintData?.klient || clientName || 'Klient';
      
      const newMsg = {
        id: Date.now().toString(),
        autor: 'klient',
        autorNazwa: clientDisplayName,
        tresc: newMessage.trim() || '(załączono zdjęcia)',
        data: new Date().toISOString()
      };
      
      // Dodaj zdjęcia tylko jeśli są
      if (uploadedPhotoUrls.length > 0) {
        newMsg.zdjecia = uploadedPhotoUrls;
      }
      
      const complaintRef = doc(db, 'complaints', complaintData.id);
      await updateDoc(complaintRef, {
        wiadomosci: [...(complaintData.wiadomosci || []), newMsg],
        status: complaintData.status === 'oczekuje_na_klienta' ? 'w_trakcie' : complaintData.status,
        historia: [...(complaintData.historia || []), {
          data: new Date().toISOString(),
          uzytkownik: clientDisplayName,
          akcja: uploadedPhotoUrls.length > 0 ? 'Klient dodał wiadomość ze zdjęciami' : 'Klient dodał wiadomość'
        }]
      });
      
      setNewMessage('');
      setChatPhotos([]); // Wyczyść zdjęcia
    } catch (err) {
      console.error('Błąd wysyłania wiadomości:', err);
      alert('Nie udało się wysłać wiadomości. Spróbuj ponownie.');
    } finally {
      setSendingMessage(false);
    }
  };
  
  // Typy reklamacji
  const complaintTypes = [
    { id: 'uszkodzenie', name: '🔨 Uszkodzenie towaru', desc: 'Produkt został uszkodzony podczas transportu' },
    { id: 'niezgodnosc', name: '📦 Niezgodność z zamówieniem', desc: 'Otrzymany produkt różni się od zamówionego' },
    { id: 'brak', name: '❌ Brak części towaru', desc: 'Brakuje elementów z zamówienia' },
    { id: 'jakosc', name: '⚠️ Wada jakościowa', desc: 'Produkt ma wady fabryczne lub jakościowe' },
    { id: 'opoznienie', name: '⏰ Opóźnienie dostawy', desc: 'Dostawa znacząco opóźniona' },
    { id: 'inne', name: '📋 Inne', desc: 'Inny rodzaj problemu' }
  ];
  
  // Style wspólne
  const containerStyle = {
    minHeight: '100vh',
    padding: '20px',
    fontFamily: "'Segoe UI', Arial, sans-serif"
  };
  
  const cardStyle = {
    maxWidth: '700px',
    margin: '0 auto',
    background: 'white',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  };
  
  // Ekran ładowania
  if (loading) {
    return (
      <div style={{...containerStyle, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{fontSize: '48px', marginBottom: '20px'}}>⏳</div>
          <p style={{color: '#666', fontSize: '18px'}}>Ładowanie...</p>
        </div>
      </div>
    );
  }
  
  // Ekran błędu
  if (error) {
    return (
      <div style={{...containerStyle, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{fontSize: '48px', marginBottom: '20px'}}>❌</div>
          <h2 style={{color: '#DC2626', marginBottom: '15px'}}>Ups!</h2>
          <p style={{color: '#666'}}>{error}</p>
        </div>
      </div>
    );
  }
  
  // ==========================================
  // WIDOK SUKCESU - PO WYSŁANIU REKLAMACJI
  // ==========================================
  if (view === 'success' && complaintData) {
    const customerEmail = orderData?.klient?.email || clientEmail || '';
    
    return (
      <div style={{...containerStyle, background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{...cardStyle, maxWidth: '550px'}}>
          {/* Header */}
          <div style={{background: 'linear-gradient(135deg, #10B981, #059669)', padding: '40px', textAlign: 'center', color: 'white'}}>
            <div style={{fontSize: '64px', marginBottom: '15px'}}>✅</div>
            <h1 style={{margin: '0 0 10px 0', fontSize: '28px', fontWeight: '700'}}>Reklamacja przyjęta!</h1>
            <p style={{margin: 0, fontSize: '18px', opacity: 0.95}}>{complaintData.numer}</p>
          </div>
          
          {/* Treść */}
          <div style={{padding: '30px'}}>
            <p style={{margin: '0 0 20px 0', color: '#374151', fontSize: '16px', lineHeight: '1.6', textAlign: 'center'}}>
              Dziękujemy za zgłoszenie. Nasz zespół zajmie się Twoją sprawą najszybciej jak to możliwe.
            </p>
            
            {/* Info o emailu */}
            <div style={{background: '#F0FDF4', padding: '20px', borderRadius: '12px', border: '1px solid #86EFAC', marginBottom: '20px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px'}}>
                <span style={{fontSize: '24px'}}>📧</span>
                <div>
                  <p style={{margin: 0, fontWeight: '600', color: '#166534'}}>Link do śledzenia wysłany!</p>
                  {customerEmail && (
                    <p style={{margin: '5px 0 0 0', fontSize: '14px', color: '#15803D'}}>
                      Na adres: <strong>{customerEmail}</strong>
                    </p>
                  )}
                </div>
              </div>
              <p style={{margin: 0, fontSize: '14px', color: '#166534', lineHeight: '1.5'}}>
                W emailu znajdziesz link, który pozwoli Ci w każdej chwili sprawdzić status reklamacji i komunikować się z naszym zespołem.
              </p>
            </div>
            
            {/* Szczegóły reklamacji */}
            <div style={{background: '#F9FAFB', padding: '20px', borderRadius: '12px'}}>
              <h3 style={{margin: '0 0 15px 0', fontSize: '14px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Szczegóły zgłoszenia</h3>
              <div style={{display: 'grid', gap: '10px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#6B7280'}}>Numer reklamacji:</span>
                  <span style={{fontWeight: '600', color: '#374151'}}>{complaintData.numer}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#6B7280'}}>Zamówienie:</span>
                  <span style={{fontWeight: '600', color: '#374151'}}>{complaintData.nrZamowienia}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#6B7280'}}>Status:</span>
                  <span style={{fontWeight: '600', color: '#DC2626'}}>🆕 Nowa</span>
                </div>
              </div>
            </div>
            
            {/* Info */}
            <div style={{marginTop: '20px', padding: '15px', background: '#FEF3C7', borderRadius: '10px'}}>
              <p style={{margin: 0, fontSize: '13px', color: '#92400E', textAlign: 'center'}}>
                💡 <strong>Zachowaj email z linkiem!</strong> Pozwoli Ci śledzić status i odpowiadać na nasze wiadomości.
              </p>
            </div>
          </div>
          
          {/* Footer */}
          <div style={{padding: '20px', background: '#F9FAFB', textAlign: 'center', borderTop: '1px solid #E5E7EB'}}>
            <p style={{margin: 0, color: '#9CA3AF', fontSize: '13px'}}>
              Herraton • System obsługi reklamacji
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // ==========================================
  // WIDOK ŚLEDZENIA REKLAMACJI
  // ==========================================
  if (view === 'tracking' && complaintData) {
    const statusInfo = getStatusInfo(complaintData.status);
    const typInfo = complaintTypes.find(t => t.id === complaintData.typ) || complaintTypes[5];
    
    return (
      <div style={{...containerStyle, background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)'}}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={{background: 'linear-gradient(135deg, #6366F1, #4F46E5)', padding: '25px', color: 'white'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'}}>
              <div>
                <div style={{fontSize: '14px', opacity: 0.9}}>Reklamacja nr</div>
                <div style={{fontSize: '24px', fontWeight: '700'}}>{complaintData.numer}</div>
              </div>
              <div style={{background: statusInfo.bg, color: statusInfo.color, padding: '8px 16px', borderRadius: '20px', fontWeight: '600', fontSize: '14px'}}>
                {statusInfo.icon} {statusInfo.name}
              </div>
            </div>
            <div style={{marginTop: '15px', fontSize: '14px', opacity: 0.9}}>
              Zamówienie: <strong>{complaintData.nrZamowienia}</strong>
            </div>
          </div>
          
          {/* Info o reklamacji */}
          <div style={{padding: '20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB'}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
              <div>
                <span style={{color: '#6B7280', fontSize: '12px'}}>Typ problemu</span>
                <p style={{margin: '5px 0 0 0', fontWeight: '600', fontSize: '14px'}}>{typInfo.name}</p>
              </div>
              <div>
                <span style={{color: '#6B7280', fontSize: '12px'}}>Data zgłoszenia</span>
                <p style={{margin: '5px 0 0 0', fontWeight: '600', fontSize: '14px'}}>{formatDateTime(complaintData.dataUtworzenia)}</p>
              </div>
            </div>
            
            {/* Opis problemu */}
            <div style={{marginTop: '15px'}}>
              <span style={{color: '#6B7280', fontSize: '12px'}}>Opis problemu</span>
              <p style={{margin: '5px 0 0 0', fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap'}}>{complaintData.opis}</p>
            </div>
            
            {/* Zdjęcia */}
            {complaintData.zdjecia && complaintData.zdjecia.length > 0 && (
              <div style={{marginTop: '15px'}}>
                <span style={{color: '#6B7280', fontSize: '12px'}}>Załączone zdjęcia ({complaintData.zdjecia.length})</span>
                <div style={{display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap'}}>
                  {complaintData.zdjecia.map((photo, idx) => (
                    <img 
                      key={idx} 
                      src={photo} 
                      alt={`Zdjęcie ${idx + 1}`}
                      style={{width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #E5E7EB', cursor: 'pointer'}}
                      onClick={() => setLightboxPhoto(photo)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Wiadomości / Czat */}
          <div style={{padding: '20px'}}>
            <h3 style={{margin: '0 0 15px 0', fontSize: '16px', color: '#374151'}}>💬 Wiadomości</h3>
            
            <div style={{maxHeight: '400px', overflowY: 'auto', marginBottom: '15px'}}>
              {(complaintData.wiadomosci || []).map((msg, idx) => {
                const isClient = msg.autor === 'klient';
                return (
                  <div 
                    key={msg.id || idx}
                    style={{
                      display: 'flex',
                      justifyContent: isClient ? 'flex-end' : 'flex-start',
                      marginBottom: '12px'
                    }}
                  >
                    <div style={{
                      maxWidth: '80%',
                      background: isClient ? 'linear-gradient(135deg, #6366F1, #4F46E5)' : '#F3F4F6',
                      color: isClient ? 'white' : '#374151',
                      padding: '12px 16px',
                      borderRadius: isClient ? '16px 16px 4px 16px' : '16px 16px 16px 4px'
                    }}>
                      <div style={{fontSize: '12px', opacity: 0.8, marginBottom: '4px'}}>
                        {isClient ? 'Ty' : msg.autorNazwa || 'Obsługa'} • {formatDateTime(msg.data)}
                      </div>
                      <div style={{fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap'}}>{msg.tresc}</div>
                      
                      {/* Zdjęcia w wiadomości */}
                      {msg.zdjecia && msg.zdjecia.length > 0 && (
                        <div style={{display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap'}}>
                          {msg.zdjecia.map((photo, pIdx) => (
                            <img 
                              key={pIdx}
                              src={photo}
                              alt=""
                              style={{width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer'}}
                              onClick={() => setLightboxPhoto(photo)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {(!complaintData.wiadomosci || complaintData.wiadomosci.length === 0) && (
                <p style={{textAlign: 'center', color: '#9CA3AF', padding: '20px'}}>Brak wiadomości</p>
              )}
            </div>
            
            {/* Pole do pisania wiadomości */}
            {complaintData.status !== 'rozwiazana' && complaintData.status !== 'odrzucona' && (
              <div>
                {/* Podgląd zdjęć do wysłania */}
                {chatPhotos.length > 0 && (
                  <div style={{display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap'}}>
                    {chatPhotos.map((photo, idx) => (
                      <div key={idx} style={{position: 'relative'}}>
                        <img 
                          src={photo} 
                          alt={`Do wysłania ${idx + 1}`}
                          style={{width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #6366F1'}}
                        />
                        <button
                          onClick={() => removeChatPhoto(idx)}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: '#DC2626',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div style={{display: 'flex', gap: '10px', alignItems: 'flex-end'}}>
                  <textarea
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Napisz wiadomość..."
                    rows={2}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '2px solid #E5E7EB',
                      borderRadius: '10px',
                      fontSize: '14px',
                      resize: 'none'
                    }}
                  />
                  <label style={{
                    padding: '12px',
                    background: '#F3F4F6',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #E5E7EB',
                    fontSize: '18px'
                  }}>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      style={{display: 'none'}}
                      onChange={handleChatPhotoUpload}
                    />
                    📷
                  </label>
                  <button
                    onClick={handleSendMessage}
                    disabled={sendingMessage || (!newMessage.trim() && chatPhotos.length === 0)}
                    style={{
                      padding: '12px 20px',
                      background: sendingMessage || (!newMessage.trim() && chatPhotos.length === 0) ? '#9CA3AF' : 'linear-gradient(135deg, #6366F1, #4F46E5)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: sendingMessage || (!newMessage.trim() && chatPhotos.length === 0) ? 'not-allowed' : 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {sendingMessage ? '⏳' : '📤'}
                  </button>
                </div>
              </div>
            )}
            
            {(complaintData.status === 'rozwiazana' || complaintData.status === 'odrzucona') && (
              <div style={{background: statusInfo.bg, padding: '15px', borderRadius: '10px', textAlign: 'center'}}>
                <p style={{margin: 0, color: statusInfo.color, fontWeight: '500'}}>
                  {statusInfo.icon} Ta reklamacja została {complaintData.status === 'rozwiazana' ? 'rozwiązana' : 'odrzucona'}
                </p>
              </div>
            )}
          </div>
          
          {/* LIGHTBOX - powiększone zdjęcie */}
          {lightboxPhoto && (
            <div 
              onClick={() => setLightboxPhoto(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                cursor: 'pointer'
              }}
            >
              <button
                onClick={() => setLightboxPhoto(null)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  fontSize: '24px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >×</button>
              <img 
                src={lightboxPhoto} 
                alt="Powiększone zdjęcie"
                style={{
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                  objectFit: 'contain',
                  borderRadius: '8px'
                }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
          
          {/* Footer */}
          <div style={{padding: '20px', background: '#F9FAFB', textAlign: 'center', borderTop: '1px solid #E5E7EB'}}>
            <p style={{margin: 0, color: '#9CA3AF', fontSize: '13px'}}>
              Herraton • System obsługi reklamacji
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // ==========================================
  // WIDOK DLA PRODUCENTA - tylko podstawowe info i zdjęcia
  // ==========================================
  if (view === 'producer' && complaintData) {
    const typInfo = complaintTypes.find(t => t.id === complaintData.typ) || complaintTypes[5];
    
    return (
      <div style={{...containerStyle, background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'}}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={{background: 'linear-gradient(135deg, #F59E0B, #D97706)', padding: '30px', color: 'white'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'}}>
              <div>
                <div style={{fontSize: '14px', opacity: 0.9}}>⚠️ REKLAMACJA</div>
                <div style={{fontSize: '28px', fontWeight: '700'}}>{complaintData.numer}</div>
              </div>
              <div style={{background: 'rgba(255,255,255,0.2)', padding: '10px 20px', borderRadius: '10px', fontSize: '14px'}}>
                📦 Zamówienie: <strong>{complaintData.nrZamowienia}</strong>
              </div>
            </div>
          </div>
          
          {/* Główne info */}
          <div style={{padding: '25px'}}>
            {/* Grid z danymi */}
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '25px'}}>
              <div style={{background: '#FEF3C7', padding: '15px', borderRadius: '10px'}}>
                <div style={{color: '#92400E', fontSize: '12px', fontWeight: '600', marginBottom: '5px'}}>🔴 TYP PROBLEMU</div>
                <div style={{color: '#78350F', fontSize: '16px', fontWeight: '600'}}>{typInfo.name}</div>
              </div>
              <div style={{background: '#DBEAFE', padding: '15px', borderRadius: '10px'}}>
                <div style={{color: '#1E40AF', fontSize: '12px', fontWeight: '600', marginBottom: '5px'}}>📅 DATA ZGŁOSZENIA</div>
                <div style={{color: '#1E3A8A', fontSize: '16px', fontWeight: '600'}}>{formatDateTime(complaintData.dataUtworzenia)}</div>
              </div>
            </div>
            
            {/* Opis problemu */}
            <div style={{background: '#FEE2E2', padding: '20px', borderRadius: '12px', border: '2px solid #FECACA', marginBottom: '20px'}}>
              <div style={{color: '#991B1B', fontSize: '13px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span style={{fontSize: '18px'}}>📝</span> OPIS PROBLEMU
              </div>
              <p style={{margin: 0, color: '#7F1D1D', fontSize: '15px', lineHeight: '1.6', whiteSpace: 'pre-wrap'}}>
                {complaintData.opis || 'Brak opisu'}
              </p>
            </div>
            
            {/* Wiadomość od klienta */}
            {complaintData.wiadomoscKlienta && complaintData.wiadomoscKlienta !== complaintData.opis && (
              <div style={{background: '#F3F4F6', padding: '20px', borderRadius: '12px', marginBottom: '20px'}}>
                <div style={{color: '#374151', fontSize: '13px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span style={{fontSize: '18px'}}>💬</span> WIADOMOŚĆ OD KLIENTA
                </div>
                <p style={{margin: 0, color: '#4B5563', fontSize: '15px', lineHeight: '1.6', whiteSpace: 'pre-wrap'}}>
                  {complaintData.wiadomoscKlienta}
                </p>
              </div>
            )}
            
            {/* Oczekiwania klienta */}
            {complaintData.oczekiwaniaKlienta && (
              <div style={{background: '#E0E7FF', padding: '20px', borderRadius: '12px', marginBottom: '20px'}}>
                <div style={{color: '#3730A3', fontSize: '13px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span style={{fontSize: '18px'}}>🎯</span> OCZEKIWANIA KLIENTA
                </div>
                <p style={{margin: 0, color: '#4338CA', fontSize: '15px', lineHeight: '1.6', whiteSpace: 'pre-wrap'}}>
                  {complaintData.oczekiwaniaKlienta}
                </p>
              </div>
            )}
            
            {/* ZDJĘCIA */}
            {complaintData.zdjecia && complaintData.zdjecia.length > 0 && (
              <div style={{background: '#F9FAFB', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                <div style={{color: '#374151', fontSize: '13px', fontWeight: '700', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span style={{fontSize: '18px'}}>📷</span> ZDJĘCIA REKLAMACJI ({complaintData.zdjecia.length})
                </div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px'}}>
                  {complaintData.zdjecia.map((photo, idx) => (
                    <div key={idx} style={{position: 'relative'}}>
                      <img 
                        src={photo} 
                        alt={`Zdjęcie ${idx + 1}`}
                        style={{
                          width: '100%', 
                          height: '150px', 
                          objectFit: 'cover', 
                          borderRadius: '10px', 
                          border: '2px solid #E5E7EB', 
                          cursor: 'pointer',
                          transition: 'transform 0.2s'
                        }}
                        onClick={() => setLightboxPhoto(photo)}
                        onMouseOver={(e) => e.target.style.transform = 'scale(1.02)'}
                        onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                      />
                      <span style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        background: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {idx + 1}/{complaintData.zdjecia.length}
                      </span>
                    </div>
                  ))}
                </div>
                <p style={{margin: '15px 0 0 0', color: '#6B7280', fontSize: '13px', textAlign: 'center'}}>
                  💡 Kliknij na zdjęcie aby powiększyć
                </p>
              </div>
            )}
          </div>
          
          {/* LIGHTBOX */}
          {lightboxPhoto && (
            <div 
              onClick={() => setLightboxPhoto(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.95)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                cursor: 'pointer'
              }}
            >
              <button
                onClick={() => setLightboxPhoto(null)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '50px',
                  height: '50px',
                  fontSize: '28px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                }}
              >×</button>
              <img 
                src={lightboxPhoto} 
                alt="Powiększone zdjęcie"
                style={{
                  maxWidth: '95vw',
                  maxHeight: '95vh',
                  objectFit: 'contain',
                  borderRadius: '8px'
                }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
          
          {/* Footer */}
          <div style={{padding: '20px', background: '#F9FAFB', textAlign: 'center', borderTop: '1px solid #E5E7EB'}}>
            <p style={{margin: 0, color: '#9CA3AF', fontSize: '13px'}}>
              Herraton • Podgląd reklamacji dla producenta
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // ==========================================
  // WIDOK FORMULARZA NOWEJ REKLAMACJI
  // ==========================================
  return (
    <div style={{...containerStyle, background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)'}}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{background: 'linear-gradient(135deg, #DC2626, #B91C1C)', padding: '30px', textAlign: 'center', color: 'white'}}>
          <div style={{fontSize: '48px', marginBottom: '10px'}}>📋</div>
          <h1 style={{margin: '0 0 10px 0', fontSize: '24px'}}>Formularz Reklamacji</h1>
          {!isUniversalForm && orderData && (
            <p style={{margin: 0, opacity: 0.9}}>Zamówienie: <strong>{orderData.nrWlasny}</strong></p>
          )}
          {isUniversalForm && (
            <p style={{margin: 0, opacity: 0.9}}>Zgłoś problem z zamówieniem</p>
          )}
        </div>
        
        {/* Info o zamówieniu (tylko dla tokenu) */}
        {!isUniversalForm && orderData && (
          <div style={{padding: '20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB'}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
              <div>
                <span style={{color: '#6B7280', fontSize: '13px'}}>👤 Klient</span>
                <p style={{margin: '5px 0 0 0', fontWeight: '600'}}>{orderData.klient?.imie}</p>
              </div>
              <div>
                <span style={{color: '#6B7280', fontSize: '13px'}}>📧 Email</span>
                <p style={{margin: '5px 0 0 0', fontWeight: '600'}}>{orderData.klient?.email}</p>
              </div>
              <div style={{gridColumn: '1 / -1'}}>
                <span style={{color: '#6B7280', fontSize: '13px'}}>📦 Towar</span>
                <p style={{margin: '5px 0 0 0', fontWeight: '500', fontSize: '14px', whiteSpace: 'pre-wrap'}}>{orderData.towar || '-'}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Formularz */}
        <form onSubmit={handleSubmit} style={{padding: '25px'}}>
          
          {/* Dane klienta - tylko dla formularza uniwersalnego */}
          {isUniversalForm && (
            <div style={{marginBottom: '25px', padding: '20px', background: '#F0F9FF', borderRadius: '12px', border: '1px solid #BAE6FD'}}>
              <h3 style={{margin: '0 0 15px 0', fontSize: '16px', color: '#0369A1'}}>👤 Twoje dane</h3>
              <div style={{display: 'grid', gap: '15px'}}>
                <div>
                  <label style={{display: 'block', fontWeight: '500', marginBottom: '6px', color: '#374151', fontSize: '14px'}}>
                    Imię i nazwisko *
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Jan Kowalski"
                    required
                    style={{width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box'}}
                  />
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
                  <div>
                    <label style={{display: 'block', fontWeight: '500', marginBottom: '6px', color: '#374151', fontSize: '14px'}}>
                      Email *
                    </label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      placeholder="jan@example.com"
                      required
                      style={{width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box'}}
                    />
                  </div>
                  <div>
                    <label style={{display: 'block', fontWeight: '500', marginBottom: '6px', color: '#374151', fontSize: '14px'}}>
                      Telefon
                    </label>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={e => setClientPhone(e.target.value)}
                      placeholder="+48 123 456 789"
                      style={{width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box'}}
                    />
                  </div>
                </div>
                <div>
                  <label style={{display: 'block', fontWeight: '500', marginBottom: '6px', color: '#374151', fontSize: '14px'}}>
                    Numer zamówienia
                  </label>
                  <input
                    type="text"
                    value={manualOrderNumber}
                    onChange={e => setManualOrderNumber(e.target.value)}
                    placeholder="np. 1/01/26/PL lub numer faktury"
                    style={{width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box'}}
                  />
                  <p style={{margin: '5px 0 0 0', fontSize: '12px', color: '#6B7280'}}>Podaj numer zamówienia lub faktury jeśli go znasz</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Typ reklamacji */}
          <div style={{marginBottom: '25px'}}>
            <label style={{display: 'block', fontWeight: '600', marginBottom: '12px', color: '#374151'}}>
              Rodzaj problemu *
            </label>
            <div style={{display: 'grid', gap: '10px'}}>
              {complaintTypes.map(type => (
                <label
                  key={type.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 15px',
                    border: complaintType === type.id ? '2px solid #DC2626' : '2px solid #E5E7EB',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    background: complaintType === type.id ? '#FEF2F2' : 'white',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="radio"
                    name="complaintType"
                    value={type.id}
                    checked={complaintType === type.id}
                    onChange={e => setComplaintType(e.target.value)}
                    style={{marginRight: '12px'}}
                  />
                  <div>
                    <div style={{fontWeight: '500'}}>{type.name}</div>
                    <div style={{fontSize: '12px', color: '#6B7280'}}>{type.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          
          {/* Opis problemu */}
          <div style={{marginBottom: '25px'}}>
            <label style={{display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151'}}>
              Opis problemu *
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opisz szczegółowo co się stało..."
              rows={5}
              required
              style={{width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '10px', fontSize: '15px', resize: 'vertical', boxSizing: 'border-box'}}
            />
          </div>
          
          {/* Oczekiwania */}
          <div style={{marginBottom: '25px'}}>
            <label style={{display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151'}}>
              Czego oczekujesz? (opcjonalne)
            </label>
            <textarea
              value={expectations}
              onChange={e => setExpectations(e.target.value)}
              placeholder="Np. wymiana towaru, zwrot pieniędzy, naprawa..."
              rows={3}
              style={{width: '100%', padding: '12px', border: '2px solid #E5E7EB', borderRadius: '10px', fontSize: '15px', resize: 'vertical', boxSizing: 'border-box'}}
            />
          </div>
          
          {/* Zdjęcia */}
          <div style={{marginBottom: '25px'}}>
            <label style={{display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151'}}>
              📸 Zdjęcia (opcjonalne, max 5MB każde)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              style={{marginBottom: '15px'}}
            />
            {photos.length > 0 && (
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
                {photos.map((photo, idx) => (
                  <div key={idx} style={{position: 'relative'}}>
                    <img
                      src={photo}
                      alt={`Zdjęcie ${idx + 1}`}
                      style={{width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #E5E7EB'}}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      style={{position: 'absolute', top: '-8px', right: '-8px', width: '24px', height: '24px', borderRadius: '50%', background: '#DC2626', color: 'white', border: 'none', cursor: 'pointer', fontSize: '14px'}}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Przycisk wysyłania */}
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            style={{
              width: '100%',
              padding: '15px',
              background: submitting ? '#9CA3AF' : 'linear-gradient(135deg, #DC2626, #B91C1C)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {submitting ? '⏳ Wysyłanie...' : '📤 Wyślij reklamację'}
          </button>
        </form>
        
        {/* Footer */}
        <div style={{padding: '20px', background: '#F9FAFB', textAlign: 'center', borderTop: '1px solid #E5E7EB'}}>
          <p style={{margin: 0, color: '#9CA3AF', fontSize: '13px'}}>
            Herraton • System obsługi zamówień
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PUBLICZNY PANEL ZAMÓWIENIA DLA KLIENTA
// ============================================

const PublicOrderPanel = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  
  // Helper do formatowania daty
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  
  const formatCurrency = (amount, currency = 'PLN') => {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: currency || 'PLN' }).format(amount);
  };
  
  // Pobierz nazwę kraju
  const getCountryName = (code) => {
    const countries = {
      'PL': 'Polski', 'DE': 'Niemiec', 'NL': 'Holandii', 'BE': 'Belgii', 
      'FR': 'Francji', 'AT': 'Austrii', 'IT': 'Włoch', 'ES': 'Hiszpanii'
    };
    return countries[code] || code;
  };
  
  // Statusy zamówienia
  const getStatusInfo = (status) => {
    const statuses = {
      'nowe': { name: 'Nowe zamówienie', color: '#3B82F6', bg: '#DBEAFE', icon: '📝', step: 0 },
      'potwierdzone': { name: 'Potwierdzone', color: '#8B5CF6', bg: '#EDE9FE', icon: '✅', step: 1 },
      'w_produkcji': { name: 'W produkcji', color: '#F59E0B', bg: '#FEF3C7', icon: '🏭', step: 2 },
      'gotowe': { name: 'Gotowe do odbioru', color: '#10B981', bg: '#D1FAE5', icon: '📦', step: 3 },
      'gotowe_do_odbioru': { name: 'Gotowe do odbioru', color: '#10B981', bg: '#D1FAE5', icon: '📦', step: 3 },
      'odebrane': { name: 'Odebrane od producenta', color: '#059669', bg: '#D1FAE5', icon: '✓', step: 4 },
      'odebrane_od_producenta': { name: 'Odebrane od producenta', color: '#059669', bg: '#D1FAE5', icon: '✓', step: 4 },
      'w_transporcie': { name: 'W transporcie', color: '#6366F1', bg: '#E0E7FF', icon: '🚚', step: 5 },
      'wyslane': { name: 'W transporcie', color: '#6366F1', bg: '#E0E7FF', icon: '🚚', step: 5 },
      'dostarczone': { name: 'Dostarczone', color: '#059669', bg: '#D1FAE5', icon: '🏠', step: 6 },
      'zakonczone': { name: 'Zakończone', color: '#059669', bg: '#D1FAE5', icon: '🎉', step: 6 }
    };
    return statuses[status] || { name: status || 'Nieznany', color: '#6B7280', bg: '#F3F4F6', icon: '❓', step: 0 };
  };
  
  // Czy zamówienie jest w transporcie
  const isInTransport = orderData?.status === 'w_transporcie' || orderData?.status === 'wyslane';
  
  // Real-time listener dla zamówienia
  useEffect(() => {
    if (!token) {
      setError('Brak tokenu zamówienia');
      setLoading(false);
      return;
    }
    
    let unsubscribeOrder = null;
    let unsubscribeDriver = null;
    
    const loadOrder = async () => {
      try {
        const { collection, query, where, onSnapshot, doc } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        
        // Szukaj zamówienia po tokenie
        const q = query(collection(db, 'orders'), where('clientToken', '==', token));
        
        unsubscribeOrder = onSnapshot(q, async (snapshot) => {
          if (!snapshot.empty) {
            const orderDoc = snapshot.docs[0];
            const order = { id: orderDoc.id, ...orderDoc.data() };
            setOrderData(order);
            setConfirmed(order.potwierdzoneByClient || false);
            
            // Pobierz dane kierowcy jeśli jest przypisany
            const driverId = order.przypisanyKierowca || order.produkty?.[0]?.kierowca;
            if (driverId) {
              const driverRef = doc(db, 'users', driverId);
              unsubscribeDriver = onSnapshot(driverRef, (driverSnap) => {
                if (driverSnap.exists()) {
                  setDriverData({ id: driverSnap.id, ...driverSnap.data() });
                }
              });
            }
          } else {
            setError('Nie znaleziono zamówienia');
          }
          setLoading(false);
        }, (err) => {
          console.error('Błąd ładowania zamówienia:', err);
          setError('Błąd ładowania zamówienia');
          setLoading(false);
        });
        
      } catch (err) {
        console.error('Błąd:', err);
        setError('Wystąpił błąd');
        setLoading(false);
      }
    };
    
    loadOrder();
    
    return () => {
      if (unsubscribeOrder) unsubscribeOrder();
      if (unsubscribeDriver) unsubscribeDriver();
    };
  }, [token]);
  
  // Potwierdzenie zamówienia przez klienta
  const handleConfirmOrder = async () => {
    if (!orderData) return;
    
    setConfirming(true);
    
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      // Zmień też statusy produktów jeśli są "nowe"
      let updatedProdukty = orderData.produkty;
      if (orderData.produkty && orderData.produkty.length > 0) {
        updatedProdukty = orderData.produkty.map(p => ({
          ...p,
          status: p.status === 'nowe' ? 'potwierdzone' : p.status
        }));
      }
      
      const orderRef = doc(db, 'orders', orderData.id);
      await updateDoc(orderRef, {
        potwierdzoneByClient: true,
        dataPotwierdzenia: new Date().toISOString(),
        status: orderData.status === 'nowe' ? 'potwierdzone' : orderData.status,
        produkty: updatedProdukty,
        historia: [...(orderData.historia || []), {
          data: new Date().toISOString(),
          uzytkownik: orderData.klient?.imie || 'Klient',
          akcja: 'Zamówienie potwierdzone przez klienta'
        }]
      });
      
      // Dodaj powiadomienie do systemu dla adminów
      try {
        const { collection, addDoc } = await import('firebase/firestore');
        await addDoc(collection(db, 'notifications'), {
          type: 'order_confirmed',
          title: `✅ Klient potwierdził zamówienie ${orderData.nrWlasny}`,
          message: `${orderData.klient?.imie || 'Klient'} potwierdził zamówienie ${orderData.nrWlasny}`,
          orderId: orderData.id,
          orderNumber: orderData.nrWlasny,
          clientName: orderData.klient?.imie,
          createdAt: new Date().toISOString(),
          read: false,
          resolved: false
        });
      } catch (notifErr) {
        console.error('Błąd dodawania powiadomienia:', notifErr);
      }
      
      setConfirmed(true);
      
      // Wyślij email z podziękowaniem i linkiem do śledzenia
      const trackingLink = `${window.location.origin}/zamowienie/${token}`;
      const customerEmail = orderData.klient?.email;
      const customerName = orderData.klient?.imie || 'Kliencie';
      
      if (customerEmail) {
        const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; text-align: center;">
              <div style="font-size: 50px; margin-bottom: 10px;">✅</div>
              <h1 style="color: white; margin: 0; font-size: 24px;">Dziękujemy za potwierdzenie!</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${orderData.nrWlasny}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Szanowny/a <strong>${customerName}</strong>,</p>
              <p style="margin: 0 0 20px 0; color: #6B7280; font-size: 15px; line-height: 1.6;">
                Twoje zamówienie zostało potwierdzone i przekazane do realizacji. Możesz śledzić jego status w panelu klienta.
              </p>
              
              <div style="background: #F0FDF4; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px solid #86EFAC;">
                <p style="margin: 0; color: #166534; font-weight: 600; text-align: center;">
                  🎉 Zamówienie potwierdzone pomyślnie!
                </p>
              </div>
              
              <p style="margin: 20px 0; color: #374151; font-size: 15px; text-align: center;">
                <strong>📦 Pod poniższym linkiem możesz śledzić status swojego zamówienia:</strong>
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${trackingLink}" style="display: inline-block; background: linear-gradient(135deg, #6366F1, #4F46E5); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">🔍 ŚLEDŹ ZAMÓWIENIE</a>
              </div>
              
              <div style="background: #FEF3C7; padding: 15px; border-radius: 10px; margin-top: 20px;">
                <p style="margin: 0; color: #92400E; font-size: 14px;">
                  💡 <strong>Zachowaj ten email!</strong> Link powyżej pozwoli Ci w każdej chwili sprawdzić status zamówienia i pobrać dokumenty.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px; background-color: #F9FAFB; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">Herraton • System obsługi zamówień</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: customerEmail,
            toName: customerName,
            subject: `Potwierdzenie zamówienia ${orderData.nrWlasny} - Link do śledzenia`,
            textContent: `Dziękujemy za potwierdzenie zamówienia ${orderData.nrWlasny}. Śledź status: ${trackingLink}`,
            htmlContent: htmlEmail
          })
        }).catch(err => console.error('Błąd wysyłania emaila:', err));
      }
      
    } catch (err) {
      console.error('Błąd potwierdzania:', err);
      alert('Nie udało się potwierdzić zamówienia. Spróbuj ponownie.');
    } finally {
      setConfirming(false);
    }
  };
  
  // Style
  const containerStyle = {
    minHeight: '100vh',
    padding: '20px',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)'
  };
  
  const cardStyle = {
    maxWidth: '700px',
    margin: '0 auto',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    overflow: 'hidden'
  };
  
  // CSS dla animacji świecenia
  const glowKeyframes = `
    @keyframes glow {
      0%, 100% { box-shadow: 0 0 5px rgba(99, 102, 241, 0.5), 0 0 10px rgba(99, 102, 241, 0.3); }
      50% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.8), 0 0 30px rgba(99, 102, 241, 0.5), 0 0 40px rgba(99, 102, 241, 0.3); }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
  `;
  
  // Loading
  if (loading) {
    return (
      <div style={{...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{textAlign: 'center', color: 'white'}}>
          <div style={{fontSize: '48px', marginBottom: '20px'}}>📦</div>
          <p style={{fontSize: '18px'}}>Ładowanie zamówienia...</p>
        </div>
      </div>
    );
  }
  
  // Error
  if (error) {
    return (
      <div style={{...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={cardStyle}>
          <div style={{padding: '40px', textAlign: 'center'}}>
            <div style={{fontSize: '64px', marginBottom: '20px'}}>❌</div>
            <h2 style={{margin: '0 0 10px 0', color: '#DC2626'}}>Błąd</h2>
            <p style={{color: '#6B7280'}}>{error}</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (!orderData) return null;
  
  const statusInfo = getStatusInfo(orderData.status);
  const isWaitingForConfirmation = !orderData.potwierdzoneByClient && orderData.wyslanieDoPotwierdzenia;
  
  // Timeline statusów - pełna ścieżka
  const statusSteps = [
    { id: 'nowe', name: 'Złożone', icon: '📝' },
    { id: 'potwierdzone', name: 'Potwierdzone', icon: '✅' },
    { id: 'w_produkcji', name: 'W produkcji', icon: '🏭' },
    { id: 'gotowe', name: 'Gotowe do odbioru', icon: '📦' },
    { id: 'odebrane', name: 'Odebrane', icon: '✓' },
    { id: 'w_transporcie', name: 'W transporcie', icon: '🚚' },
    { id: 'dostarczone', name: 'Dostarczone', icon: '🏠' }
  ];
  
  // Mapuj status na index
  const getStepIndex = (status) => {
    const mapping = {
      'nowe': 0, 
      'potwierdzone': 1, 
      'w_produkcji': 2, 
      'gotowe': 3,
      'gotowe_do_odbioru': 3,
      'odebrane': 4,
      'odebrane_od_producenta': 4,
      'w_transporcie': 5, 
      'wyslane': 5, 
      'dostarczone': 6, 
      'zakonczone': 6
    };
    return mapping[status] ?? 0;
  };
  
  // Dla zamówień łączonych - użyj minimalnego statusu produktów, dla pojedynczych - główny status
  const getOverallStepIndex = () => {
    if (orderData.produkty && orderData.produkty.length > 1) {
      // Znajdź najniższy (najmniej zaawansowany) status
      const productStatuses = orderData.produkty.map(p => getStepIndex(p.status || orderData.status));
      return Math.min(...productStatuses);
    }
    return getStepIndex(orderData.status);
  };
  
  const currentStepIndex = getOverallStepIndex();
  
  // Dane płatności
  const cenaCalkowita = orderData.platnosci?.cenaCalkowita || 0;
  const zaplacono = orderData.platnosci?.zaplacono || 0;
  const doZaplaty = orderData.platnosci?.doZaplaty || (cenaCalkowita - zaplacono);
  const waluta = orderData.platnosci?.waluta || 'PLN';
  
  return (
    <div style={containerStyle}>
      <style>{glowKeyframes}</style>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{background: 'linear-gradient(135deg, #6366F1, #4F46E5)', padding: '25px', color: 'white'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'}}>
            <div>
              <div style={{fontSize: '14px', opacity: 0.9}}>Zamówienie nr</div>
              <div style={{fontSize: '24px', fontWeight: '700'}}>{orderData.nrWlasny}</div>
            </div>
            <div style={{
              background: confirmed ? '#D1FAE5' : statusInfo.bg, 
              color: confirmed ? '#059669' : statusInfo.color, 
              padding: '8px 16px', 
              borderRadius: '20px', 
              fontWeight: '600', 
              fontSize: '14px'
            }}>
              {confirmed ? '✅ Potwierdzone' : statusInfo.icon + ' ' + statusInfo.name}
            </div>
          </div>
          {orderData.dataUtworzenia && (
            <div style={{marginTop: '10px', fontSize: '14px', opacity: 0.9}}>
              Data zamówienia: {formatDate(orderData.dataUtworzenia || orderData.dataZlecenia)}
            </div>
          )}
        </div>
        
        {/* Komunikat o potwierdzeniu */}
        {isWaitingForConfirmation && !confirmed && (
          <div style={{background: '#FEF3C7', padding: '20px', borderBottom: '1px solid #FCD34D'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
              <span style={{fontSize: '32px'}}>⏳</span>
              <div>
                <p style={{margin: 0, fontWeight: '600', color: '#92400E'}}>Oczekuje na Twoje potwierdzenie</p>
                <p style={{margin: '5px 0 0 0', fontSize: '14px', color: '#B45309'}}>
                  Sprawdź dane zamówienia poniżej i potwierdź, jeśli wszystko się zgadza.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* KOMUNIKAT O DOSTARCZENIU */}
        {(orderData.status === 'dostarczone' || orderData.status === 'zakonczone') && (
          <div style={{background: 'linear-gradient(135deg, #10B981, #059669)', padding: '25px', borderBottom: '1px solid #059669'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '15px', color: 'white'}}>
              <div style={{fontSize: '48px'}}>🎉</div>
              <div>
                <p style={{margin: 0, fontWeight: '700', fontSize: '20px'}}>Twoje zamówienie zostało dostarczone!</p>
                <p style={{margin: '8px 0 0 0', fontSize: '15px', opacity: 0.95}}>
                  Dziękujemy za zakupy! Mamy nadzieję, że jesteś zadowolony/a z produktów.
                </p>
                {orderData.potwierdzenieDostawy?.data && (
                  <p style={{margin: '10px 0 0 0', fontSize: '14px', opacity: 0.9}}>
                    📅 Data dostawy: {formatDateTime(orderData.potwierdzenieDostawy.data)}
                  </p>
                )}
                {orderData.potwierdzenieDostawy?.kierowca && (
                  <p style={{margin: '5px 0 0 0', fontSize: '14px', opacity: 0.9}}>
                    👤 Kierowca: {orderData.potwierdzenieDostawy.kierowca}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Podziękowanie po potwierdzeniu - ale nie gdy dostarczone lub w transporcie */}
        {confirmed && !isInTransport && orderData.status !== 'dostarczone' && orderData.status !== 'zakonczone' && (
          <div style={{background: '#D1FAE5', padding: '20px', borderBottom: '1px solid #86EFAC'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
              <span style={{fontSize: '32px'}}>🎉</span>
              <div>
                <p style={{margin: 0, fontWeight: '600', color: '#065F46'}}>Zamówienie potwierdzone!</p>
                <p style={{margin: '5px 0 0 0', fontSize: '14px', color: '#047857'}}>
                  Dziękujemy! Twoje zamówienie zostało przekazane do realizacji.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* INFORMACJA O TRANSPORCIE */}
        {isInTransport && (
          <div style={{background: 'linear-gradient(135deg, #6366F1, #4F46E5)', padding: '20px', borderBottom: '1px solid #4F46E5'}}>
            <div style={{display: 'flex', alignItems: 'flex-start', gap: '15px', color: 'white'}}>
              <div style={{
                fontSize: '48px',
                animation: 'pulse 2s infinite'
              }}>🚚</div>
              <div style={{flex: 1}}>
                <p style={{margin: 0, fontWeight: '700', fontSize: '18px'}}>Twoje zamówienie jest w drodze!</p>
                
                {driverData && (
                  <div style={{
                    marginTop: '15px', 
                    padding: '15px', 
                    background: 'rgba(255,255,255,0.15)', 
                    borderRadius: '10px',
                    backdropFilter: 'blur(10px)'
                  }}>
                    <p style={{margin: 0, fontSize: '16px', fontWeight: '600'}}>
                      👤 {driverData.name}
                    </p>
                    
                    {driverData.phone && (
                      <p style={{margin: '8px 0 0 0', fontSize: '14px'}}>
                        📞 <a href={`tel:${driverData.phone}`} style={{color: 'white', fontWeight: '500', textDecoration: 'none'}}>{driverData.phone}</a>
                      </p>
                    )}
                    
                    {(orderData.szacowanaDataDostawy || orderData.szacowanaDostwa || driverData?.szacowanaDataDostawy || orderData.produkty?.[0]?.szacowanaDataDostawy || orderData.produkty?.[0]?.szacowanaDostwa) && (
                      <p style={{margin: '8px 0 0 0', fontSize: '14px'}}>
                        📅 Szacowana dostawa: <strong>{formatDate(orderData.szacowanaDataDostawy || orderData.szacowanaDostwa || driverData?.szacowanaDataDostawy || orderData.produkty?.[0]?.szacowanaDataDostawy || orderData.produkty?.[0]?.szacowanaDostwa)}</strong>
                      </p>
                    )}
                  </div>
                )}
                
                {(driverData?.dataWyjazdu || orderData.dataWyjazdu || orderData.produkty?.[0]?.dataWyjazdu) && (
                  <p style={{margin: '12px 0 0 0', fontSize: '14px', opacity: 0.95}}>
                    🚀 Wyjazd z {getCountryName(orderData.produkty?.[0]?.producentKraj || orderData.kraj || 'DE')}: <strong>{formatDate(driverData?.dataWyjazdu || orderData.dataWyjazdu || orderData.produkty?.[0]?.dataWyjazdu)}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Timeline statusu - tylko po potwierdzeniu */}
        {confirmed && (
          <div style={{padding: '20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB'}}>
            <h3 style={{margin: '0 0 20px 0', fontSize: '14px', color: '#6B7280', textTransform: 'uppercase'}}>Status realizacji</h3>
            <div style={{display: 'flex', justifyContent: 'space-between', position: 'relative'}}>
              {/* Linia łącząca */}
              <div style={{
                position: 'absolute',
                top: '24px',
                left: '30px',
                right: '30px',
                height: '4px',
                background: '#E5E7EB',
                zIndex: 0
              }} />
              <div style={{
                position: 'absolute',
                top: '24px',
                left: '30px',
                width: `calc(${Math.max(0, (currentStepIndex / (statusSteps.length - 1)) * 100)}% - 60px)`,
                height: '4px',
                background: 'linear-gradient(90deg, #10B981, #6366F1)',
                zIndex: 1,
                transition: 'width 0.5s ease'
              }} />
              
              {statusSteps.map((step, idx) => {
                const isCompleted = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div key={step.id} style={{textAlign: 'center', zIndex: 2, flex: 1}}>
                    <div style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      background: isCompleted ? '#10B981' : isCurrent ? 'linear-gradient(135deg, #6366F1, #4F46E5)' : '#E5E7EB',
                      color: (isCompleted || isCurrent) ? 'white' : '#9CA3AF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      fontSize: isCurrent ? '24px' : '20px',
                      fontWeight: '600',
                      animation: isCurrent ? 'glow 2s ease-in-out infinite' : 'none',
                      border: isCurrent ? '3px solid white' : 'none',
                      boxShadow: isCurrent ? '0 0 20px rgba(99, 102, 241, 0.6)' : isCompleted ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                    }}>
                      {isCompleted ? '✓' : step.icon}
                    </div>
                    <p style={{
                      margin: '10px 0 0 0', 
                      fontSize: '12px', 
                      color: isCurrent ? '#6366F1' : isCompleted ? '#059669' : '#9CA3AF',
                      fontWeight: isCurrent ? '700' : isCompleted ? '500' : '400'
                    }}>
                      {step.name}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Dane zamówienia */}
        <div style={{padding: '20px'}}>
          {/* Produkty - pogrupowane według kierowców */}
          <div style={{marginBottom: '25px'}}>
            <h3 style={{margin: '0 0 15px 0', fontSize: '16px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px'}}>
              📦 Produkty
            </h3>
            
            {orderData.produkty && orderData.produkty.length > 0 ? (() => {
              // Grupuj produkty według kierowców
              const produktyByKierowca = {};
              const hasMultipleDrivers = new Set(orderData.produkty.map(p => p.kierowcaNazwa || p.kierowca || 'default')).size > 1;
              
              orderData.produkty.forEach((prod, idx) => {
                const kierowcaKey = prod.kierowca || 'default';
                const kierowcaNazwa = prod.kierowcaNazwa || 'Kierowca';
                const kierowcaTelefon = prod.kierowcaTelefon || '';
                
                if (!produktyByKierowca[kierowcaKey]) {
                  produktyByKierowca[kierowcaKey] = {
                    nazwa: kierowcaNazwa,
                    telefon: kierowcaTelefon,
                    produkty: [],
                    protokol: orderData.protokolyOdbioru?.[kierowcaKey]
                  };
                }
                produktyByKierowca[kierowcaKey].produkty.push({ ...prod, originalIndex: idx });
              });
              
              const kierowcyKeys = Object.keys(produktyByKierowca);
              
              return (
                <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                  {kierowcyKeys.map((kierowcaKey, groupIdx) => {
                    const group = produktyByKierowca[kierowcaKey];
                    const showDriverHeader = hasMultipleDrivers || kierowcaKey !== 'default';
                    
                    // Sprawdź czy produkty tego kierowcy są w transporcie
                    const isGroupInTransport = group.produkty.some(p => 
                      p.status === 'w_transporcie' || p.status === 'wyslane'
                    );
                    
                    // Pobierz szacowaną datę dostawy dla produktów tego kierowcy
                    const groupEstDelivery = group.produkty[0]?.szacowanaDostwa || 
                                             orderData.szacowaneDostawyKierowcow?.[kierowcaKey]?.szacowanaDostwa;
                    
                    // Sprawdź czy grupa jest dostarczona
                    const isGroupDelivered = group.produkty.every(p => 
                      p.status === 'dostarczone' || p.status === 'zakonczone'
                    );
                    
                    return (
                      <div key={kierowcaKey} style={{
                        background: '#F9FAFB', 
                        borderRadius: '10px', 
                        overflow: 'hidden',
                        border: hasMultipleDrivers ? '2px solid #E5E7EB' : 'none'
                      }}>
                        {/* Nagłówek kierowcy z info o transporcie */}
                        {showDriverHeader && group.nazwa && group.nazwa !== 'Kierowca' && (
                          <div style={{
                            background: isGroupInTransport 
                              ? 'linear-gradient(135deg, #6366F1, #4F46E5)' 
                              : isGroupDelivered 
                                ? 'linear-gradient(135deg, #10B981, #059669)'
                                : '#6B7280',
                            padding: '15px',
                            color: 'white'
                          }}>
                            <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'}}>
                              <div style={{display: 'flex', alignItems: 'flex-start', gap: '12px'}}>
                                <span style={{fontSize: '28px'}}>
                                  {isGroupInTransport ? '🚚' : isGroupDelivered ? '✅' : '📦'}
                                </span>
                                <div>
                                  <p style={{margin: 0, fontWeight: '700', fontSize: '15px'}}>
                                    {isGroupInTransport ? 'W transporcie' : isGroupDelivered ? 'Dostarczone' : `Transport ${groupIdx + 1}`}
                                  </p>
                                  <p style={{margin: '4px 0 0 0', fontSize: '14px', opacity: 0.95}}>
                                    👤 {group.nazwa}
                                  </p>
                                  {group.telefon && (
                                    <p style={{margin: '4px 0 0 0', fontSize: '13px'}}>
                                      📞 <a href={`tel:${group.telefon}`} style={{color: 'white', textDecoration: 'none'}}>{group.telefon}</a>
                                    </p>
                                  )}
                                  {groupEstDelivery && isGroupInTransport && (
                                    <p style={{margin: '6px 0 0 0', fontSize: '13px', background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '6px', display: 'inline-block'}}>
                                      📅 Szacowana dostawa: <strong>{formatDate(groupEstDelivery)}</strong>
                                    </p>
                                  )}
                                  {group.protokol?.dataDostawy && isGroupDelivered && (
                                    <p style={{margin: '6px 0 0 0', fontSize: '13px'}}>
                                      📅 Dostarczono: {formatDate(group.protokol.dataDostawy)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Produkty w grupie */}
                        <div style={{padding: '15px'}}>
                          {group.produkty.map((prod, idx) => {
                            const prodStatusInfo = getStatusInfo(prod.status || orderData.status);
                            const prodStepIndex = getStepIndex(prod.status || orderData.status);
                            
                            return (
                              <div key={idx} style={{
                                padding: '15px',
                                marginBottom: idx < group.produkty.length - 1 ? '15px' : '0',
                                background: 'white',
                                borderRadius: '10px',
                                border: '1px solid #E5E7EB'
                              }}>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                  <div style={{flex: 1}}>
                                    {prod.nrPodzamowienia && (
                                      <p style={{margin: '0 0 5px 0', fontSize: '12px', color: '#6366F1', fontWeight: '600'}}>
                                        Nr: {prod.nrPodzamowienia}
                                      </p>
                                    )}
                                    <p style={{margin: 0, fontWeight: '500', color: '#374151', lineHeight: '1.4'}}>{prod.towar || 'Produkt'}</p>
                                    {prod.kod && <p style={{margin: '3px 0 0 0', fontSize: '12px', color: '#9CA3AF'}}>Kod: {prod.kod}</p>}
                                  </div>
                                  <div style={{textAlign: 'right', marginLeft: '15px'}}>
                                    <p style={{margin: 0, fontWeight: '600', color: '#374151'}}>
                                      {formatCurrency(prod.cenaKlienta || prod.cena, prod.waluta || waluta)}
                                    </p>
                                  </div>
                                </div>
                                
                                {/* Status produktu */}
                                {confirmed && (
                                  <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E5E7EB'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                      <span style={{fontSize: '14px'}}>Status:</span>
                                      <span style={{
                                        background: prodStatusInfo.bg,
                                        color: prodStatusInfo.color,
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        fontWeight: '600'
                                      }}>
                                        {prodStatusInfo.icon} {prodStatusInfo.name}
                                      </span>
                                    </div>
                                    
                                    {/* Mini timeline dla produktu */}
                                    <div style={{display: 'flex', alignItems: 'center', gap: '4px', marginTop: '10px'}}>
                                      {statusSteps.map((step, stepIdx) => {
                                        const isStepCompleted = stepIdx < prodStepIndex;
                                        const isStepCurrent = stepIdx === prodStepIndex;
                                        return (
                                          <React.Fragment key={step.id}>
                                            <div style={{
                                              width: isStepCurrent ? '24px' : '16px',
                                              height: isStepCurrent ? '24px' : '16px',
                                              borderRadius: '50%',
                                              background: isStepCompleted ? '#10B981' : isStepCurrent ? '#6366F1' : '#E5E7EB',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: isStepCurrent ? '12px' : '10px',
                                              color: (isStepCompleted || isStepCurrent) ? 'white' : '#9CA3AF',
                                              transition: 'all 0.3s ease',
                                              animation: isStepCurrent ? 'glow 2s ease-in-out infinite' : 'none'
                                            }}>
                                              {isStepCompleted ? '✓' : (isStepCurrent ? step.icon : '')}
                                            </div>
                                            {stepIdx < statusSteps.length - 1 && (
                                              <div style={{
                                                flex: 1,
                                                height: '3px',
                                                background: isStepCompleted ? '#10B981' : '#E5E7EB',
                                                transition: 'background 0.3s ease'
                                              }} />
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })() : orderData.towar ? (
              <div style={{background: '#F9FAFB', borderRadius: '10px', padding: '15px'}}>
                <p style={{margin: 0, fontWeight: '500', color: '#374151'}}>{orderData.towar}</p>
              </div>
            ) : (
              <div style={{background: '#F9FAFB', borderRadius: '10px', padding: '15px'}}>
                <p style={{margin: 0, color: '#9CA3AF'}}>Brak szczegółów produktu</p>
              </div>
            )}
            
            {/* PODSUMOWANIE PŁATNOŚCI */}
            <div style={{
              marginTop: '15px',
              padding: '15px',
              background: '#F9FAFB',
              borderRadius: '10px'
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                <span style={{color: '#6B7280'}}>Wartość zamówienia:</span>
                <span style={{fontWeight: '600', color: '#374151'}}>{formatCurrency(cenaCalkowita, waluta)}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                <span style={{color: '#6B7280'}}>Wpłacono:</span>
                <span style={{fontWeight: '600', color: '#10B981'}}>{formatCurrency(zaplacono, waluta)}</span>
              </div>
              <div style={{
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '12px',
                background: doZaplaty > 0 ? '#FEF3C7' : '#D1FAE5',
                borderRadius: '8px',
                marginTop: '10px'
              }}>
                <span style={{fontWeight: '600', color: doZaplaty > 0 ? '#92400E' : '#065F46'}}>
                  {doZaplaty > 0 ? 'Do zapłaty:' : 'Opłacono w całości'}
                </span>
                {doZaplaty > 0 && (
                  <span style={{fontSize: '20px', fontWeight: '700', color: '#DC2626'}}>
                    {formatCurrency(doZaplaty, waluta)}
                  </span>
                )}
                {doZaplaty <= 0 && (
                  <span style={{fontSize: '18px'}}>✅</span>
                )}
              </div>
            </div>
          </div>
          
          {/* Dostawa */}
          <div style={{marginBottom: '25px'}}>
            <h3 style={{margin: '0 0 15px 0', fontSize: '16px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px'}}>
              📍 Adres dostawy
            </h3>
            <div style={{background: '#F9FAFB', borderRadius: '10px', padding: '15px'}}>
              {orderData.klient && (
                <>
                  <p style={{margin: '0 0 5px 0', fontWeight: '600', color: '#374151'}}>{orderData.klient.imie}</p>
                  {orderData.klient.adres && <p style={{margin: '0 0 5px 0', color: '#6B7280'}}>{orderData.klient.adres}</p>}
                  {orderData.klient.telefon && (
                    <p style={{margin: '10px 0 0 0', color: '#6B7280'}}>
                      📞 <a href={`tel:${orderData.klient.telefon}`} style={{color: '#6366F1'}}>{orderData.klient.telefon}</a>
                    </p>
                  )}
                  {orderData.klient.email && (
                    <p style={{margin: '5px 0 0 0', color: '#6B7280'}}>
                      ✉️ <a href={`mailto:${orderData.klient.email}`} style={{color: '#6366F1'}}>{orderData.klient.email}</a>
                    </p>
                  )}
                </>
              )}
              {orderData.dataDostawy && (
                <div style={{marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #E5E7EB'}}>
                  <p style={{margin: 0, color: '#6B7280'}}>
                    📅 Planowana dostawa: <strong style={{color: '#374151'}}>{formatDate(orderData.dataDostawy)}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Dokumenty - po potwierdzeniu */}
          {confirmed && (
            <div style={{marginBottom: '25px'}}>
              <h3 style={{margin: '0 0 15px 0', fontSize: '16px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px'}}>
                📄 Dokumenty
              </h3>
              <div style={{display: 'grid', gap: '10px'}}>
                {/* Potwierdzenie zamówienia - zawsze dostępne */}
                <button
                  onClick={() => {
                    // Generuj HTML potwierdzenia zamówienia
                    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Potwierdzenie zamówienia ${orderData.nrWlasny}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #6366F1; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #6366F1; margin: 0; }
    .section { margin-bottom: 25px; }
    .section h2 { color: #374151; font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .label { color: #6B7280; font-size: 14px; }
    .value { font-weight: 600; color: #374151; }
    .product { padding: 10px; background: #F9FAFB; border-radius: 8px; margin-bottom: 10px; }
    .total { background: #6366F1; color: white; padding: 15px; border-radius: 8px; text-align: center; font-size: 18px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 Potwierdzenie zamówienia</h1>
    <p style="color: #6B7280; margin: 10px 0 0 0;">Nr: ${orderData.nrWlasny}</p>
  </div>
  
  <div class="section">
    <h2>👤 Dane klienta</h2>
    <p class="value">${orderData.klient?.imie || '-'}</p>
    <p class="label">${orderData.klient?.adres || '-'}</p>
    <p class="label">📞 ${orderData.klient?.telefon || '-'} | ✉️ ${orderData.klient?.email || '-'}</p>
  </div>
  
  <div class="section">
    <h2>📦 Produkty</h2>
    ${orderData.produkty?.map(p => `
      <div class="product">
        <p class="value">${p.towar || 'Produkt'}</p>
        ${p.nrPodzamowienia ? `<p class="label">Nr: ${p.nrPodzamowienia}</p>` : ''}
        <p class="label">Cena: ${formatCurrency(p.cenaKlienta || p.cena, p.waluta || waluta)}</p>
      </div>
    `).join('') || `<p>${orderData.towar || 'Brak produktów'}</p>`}
  </div>
  
  <div class="total">
    💰 Wartość zamówienia: ${formatCurrency(cenaCalkowita, waluta)}
  </div>
  
  <div class="section" style="margin-top: 20px;">
    <p class="label">Data zamówienia: ${formatDate(orderData.dataUtworzenia || orderData.dataZlecenia)}</p>
    <p class="label">Data potwierdzenia: ${formatDate(orderData.dataPotwierdzenia)}</p>
  </div>
</body>
</html>`;
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `potwierdzenie-${orderData.nrWlasny}.html`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '15px',
                    background: 'white',
                    border: '2px solid #E5E7EB',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%'
                  }}
                >
                  <span style={{fontSize: '24px'}}>📋</span>
                  <div>
                    <p style={{margin: 0, fontWeight: '600', color: '#374151'}}>Potwierdzenie zamówienia</p>
                    <p style={{margin: '3px 0 0 0', fontSize: '12px', color: '#9CA3AF'}}>Pobierz dokument z danymi zamówienia</p>
                  </div>
                </button>
                
                {/* Protokół odbioru - tylko gdy jest podpis/dostawa potwierdzona */}
                {(orderData.protokolOdbioru || orderData.podpisKlienta || orderData.potwierdzenieDostawy) && (
                  <button
                    onClick={() => {
                      const protokol = orderData.protokolOdbioru || {};
                      const podpis = orderData.podpisKlienta || protokol.podpis;
                      
                      // Generuj HTML protokołu odbioru
                      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Protokół odbioru ${orderData.nrWlasny}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 3px solid #10B981; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #10B981; margin: 0; }
    .section { margin-bottom: 25px; }
    .section h2 { color: #374151; font-size: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .label { color: #6B7280; font-size: 14px; margin: 5px 0; }
    .value { font-weight: 600; color: #374151; }
    .product { padding: 10px; background: #F9FAFB; border-radius: 8px; margin-bottom: 10px; }
    .signature-box { border: 2px solid #10B981; border-radius: 10px; padding: 20px; text-align: center; margin-top: 30px; background: #F0FDF4; }
    .signature-img { max-width: 300px; margin: 15px auto; display: block; }
    .success-badge { background: #10B981; color: white; padding: 15px 30px; border-radius: 8px; display: inline-block; font-size: 18px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>✅ Protokół odbioru towaru</h1>
    <p style="color: #6B7280; margin: 10px 0 0 0;">Zamówienie nr: ${orderData.nrWlasny}</p>
  </div>
  
  <div class="section">
    <h2>👤 Odbiorca</h2>
    <p class="value">${orderData.klient?.imie || '-'}</p>
    <p class="label">${orderData.klient?.adres || '-'}</p>
    <p class="label">📞 ${orderData.klient?.telefon || '-'}</p>
  </div>
  
  <div class="section">
    <h2>📦 Odebrany towar</h2>
    ${orderData.produkty?.map(p => `
      <div class="product">
        <p class="value">${p.towar || 'Produkt'}</p>
        ${p.nrPodzamowienia ? `<p class="label">Nr: ${p.nrPodzamowienia}</p>` : ''}
      </div>
    `).join('') || `<p>${orderData.towar || 'Brak produktów'}</p>`}
  </div>
  
  <div class="section">
    <h2>🚚 Dane dostawy</h2>
    <div class="grid">
      <div>
        <p class="label">Data dostawy:</p>
        <p class="value">${formatDateTime(protokol.dataDostawy || orderData.potwierdzenieDostawy?.data || orderData.dataDostarczenia)}</p>
      </div>
      <div>
        <p class="label">Kierowca:</p>
        <p class="value">${protokol.kierowca || orderData.potwierdzenieDostawy?.kierowca || '-'}</p>
      </div>
    </div>
    ${protokol.uwagiKlienta ? `
      <div style="margin-top: 15px; padding: 10px; background: #FEF3C7; border-radius: 8px;">
        <p class="label" style="margin: 0;">⚠️ Uwagi klienta:</p>
        <p class="value" style="margin: 5px 0 0 0;">${protokol.uwagiKlienta}</p>
      </div>
    ` : `
      <div style="margin-top: 15px; padding: 10px; background: #D1FAE5; border-radius: 8px;">
        <p style="margin: 0; color: #065F46;">✅ Towar odebrany bez uwag</p>
      </div>
    `}
  </div>
  
  <div class="signature-box">
    <h2 style="margin: 0 0 15px 0; color: #065F46;">✍️ Podpis klienta</h2>
    ${podpis?.url ? `
      <img src="${podpis.url}" alt="Podpis klienta" class="signature-img" />
      <p class="label">Podpisano elektronicznie: ${formatDateTime(podpis.timestamp)}</p>
    ` : `
      <p class="label">Potwierdzono dostawę: ${formatDateTime(orderData.potwierdzenieDostawy?.data)}</p>
    `}
  </div>
  
  <div style="text-align: center; margin-top: 30px;">
    <span class="success-badge">🎉 Dostawa zakończona pomyślnie</span>
  </div>
</body>
</html>`;
                      const blob = new Blob([html], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `protokol-odbioru-${orderData.nrWlasny}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '15px',
                      background: '#D1FAE5',
                      border: '2px solid #86EFAC',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%'
                    }}
                  >
                    <span style={{fontSize: '24px'}}>✍️</span>
                    <div>
                      <p style={{margin: 0, fontWeight: '600', color: '#065F46'}}>Protokół odbioru</p>
                      <p style={{margin: '3px 0 0 0', fontSize: '12px', color: '#047857'}}>
                        Dokument z podpisem klienta • {formatDate(orderData.protokolOdbioru?.dataDostawy || orderData.potwierdzenieDostawy?.data)}
                      </p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* Historia - po potwierdzeniu */}
          {confirmed && orderData.historia && orderData.historia.length > 0 && (
            <div style={{marginBottom: '25px'}}>
              <h3 style={{margin: '0 0 15px 0', fontSize: '16px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px'}}>
                📜 Historia zamówienia
              </h3>
              <div style={{background: '#F9FAFB', borderRadius: '10px', padding: '15px'}}>
                {orderData.historia.slice().reverse().slice(0, 5).map((h, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '10px 0',
                    borderBottom: idx < Math.min(orderData.historia.length, 5) - 1 ? '1px solid #E5E7EB' : 'none'
                  }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#10B981',
                      marginTop: '6px',
                      flexShrink: 0
                    }} />
                    <div>
                      <p style={{margin: 0, fontSize: '14px', color: '#374151'}}>{h.akcja}</p>
                      <p style={{margin: '3px 0 0 0', fontSize: '12px', color: '#9CA3AF'}}>
                        {formatDateTime(h.data)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Przycisk potwierdzenia */}
          {isWaitingForConfirmation && !confirmed && (
            <div style={{marginTop: '20px'}}>
              <button
                onClick={handleConfirmOrder}
                disabled={confirming}
                style={{
                  width: '100%',
                  padding: '18px',
                  background: confirming ? '#9CA3AF' : 'linear-gradient(135deg, #10B981, #059669)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '18px',
                  fontWeight: '700',
                  cursor: confirming ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px'
                }}
              >
                {confirming ? (
                  <>⏳ Potwierdzanie...</>
                ) : (
                  <>✅ AKCEPTUJĘ ZAMÓWIENIE</>
                )}
              </button>
              <p style={{margin: '10px 0 0 0', fontSize: '12px', color: '#9CA3AF', textAlign: 'center'}}>
                Klikając powyższy przycisk potwierdzasz prawidłowość danych zamówienia
              </p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div style={{padding: '20px', background: '#F9FAFB', textAlign: 'center', borderTop: '1px solid #E5E7EB'}}>
          <p style={{margin: 0, color: '#9CA3AF', fontSize: '13px'}}>
            Herraton • System obsługi zamówień
          </p>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [producers, setProducers] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [exchangeRates, setExchangeRates] = useState(null);

  const [filter, setFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [creatorFilter, setCreatorFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [producerFilter, setProducerFilter] = useState('all');
  const [dateSort, setDateSort] = useState('newest'); // newest, oldest
  const [search, setSearch] = useState('');

  const [editingOrder, setEditingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showProducersModal, setShowProducersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showComplaintsPanel, setShowComplaintsPanel] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [showLeadsPanel, setShowLeadsPanel] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  const [showTrashPanel, setShowTrashPanel] = useState(false); // Kosz
  const [showContactsPanel, setShowContactsPanel] = useState(false); // Kontakty
  const [showSettingsMenu, setShowSettingsMenu] = useState(false); // Menu rozwijane
  const [showShippingMenu, setShowShippingMenu] = useState(false); // Menu Wysyłka
  const [showSamplesPanel, setShowSamplesPanel] = useState(false); // Próbki
  const [showMailPanel, setShowMailPanel] = useState(false); // Poczta
  const [showPriceListManager, setShowPriceListManager] = useState(false); // Cenniki
  const [showProductSearch, setShowProductSearch] = useState(false); // Wyszukiwarka produktów
  const [showDriverTripsDetail, setShowDriverTripsDetail] = useState(null); // Szczegóły wyjazdów kierowcy
  const [editingContractor, setEditingContractor] = useState(null); // Do edycji danych kontrahenta przez admina
  const [emailModal, setEmailModal] = useState(null);
  const [popupNotification, setPopupNotification] = useState(null);
  const [leads, setLeads] = useState([]);
  
  // CZAT KLIENTÓW
  const [showClientChats, setShowClientChats] = useState(false);
  const [clientChats, setClientChats] = useState([]);
  const [selectedClientChat, setSelectedClientChat] = useState(null);
  
  // Dane dla Wysyłki (próbki i poczta) - z Firestore
  const [samples, setSamples] = useState([]);
  const [mailItems, setMailItems] = useState([]);
  
  // Messenger state
  const [messages, setMessages] = useState([]);
  const [showMessenger, setShowMessenger] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [newMessagePopup, setNewMessagePopup] = useState(null);
  
  // Status change notification state
  const [statusChangeModal, setStatusChangeModal] = useState(null); // { orderId, oldStatus, newStatus, order }
  
  // Rozliczenia transportowe
  const [settlements, setSettlements] = useState([]);
  const [showSettlementsPanel, setShowSettlementsPanel] = useState(false);
  
  // Samouczek / Tutorial
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showTutorialConfig, setShowTutorialConfig] = useState(false);
  const [tutorialSteps, setTutorialSteps] = useState([]);
  const [tutorialCategories, setTutorialCategories] = useState([]); // Kategorie samouczka
  const [selectedTutorialCategory, setSelectedTutorialCategory] = useState(null); // Wybrana kategoria do wyświetlenia
  const [isSelectingElement, setIsSelectingElement] = useState(false);
  const [editingTutorialStep, setEditingTutorialStep] = useState(null);

  // Harmonogram spotkań
  const [meetings, setMeetings] = useState([]);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);

  const prevNotifCount = useRef(0);
  const prevMessageCount = useRef(0);
  const settingsMenuRef = useRef(null);
  const shippingMenuRef = useRef(null);

  const drivers = users.filter(u => u.role === 'driver');
  const isContractor = user?.role === 'contractor';
  const isAdmin = user?.role === 'admin';

  // Subskrypcja Firestore dla samples (próbki)
  useEffect(() => {
    const unsubscribe = subscribeToSamples((data) => {
      setSamples(data);
    });
    return () => unsubscribe && unsubscribe();
  }, []);
  
  // Subskrypcja Firestore dla mailItems (poczta)
  useEffect(() => {
    const unsubscribe = subscribeToMailItems((data) => {
      setMailItems(data);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  // Zamknij menu po kliknięciu poza nim
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target)) {
        setShowSettingsMenu(false);
      }
      if (shippingMenuRef.current && !shippingMenuRef.current.contains(e.target)) {
        setShowShippingMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pobieranie kursów walut z NBP API
  const fetchExchangeRates = async () => {
    try {
      // NBP API - tabela A (średnie kursy)
      const response = await fetch('https://api.nbp.pl/api/exchangerates/tables/A/?format=json');
      if (response.ok) {
        const data = await response.json();
        const rates = { PLN: 1 }; // PLN jako baza
        data[0].rates.forEach(rate => {
          rates[rate.code] = rate.mid;
        });
        setExchangeRates(rates);
        console.log('💱 Kursy walut pobrane z NBP:', rates);
      }
    } catch (error) {
      console.error('Błąd pobierania kursów walut:', error);
      // Fallback - ustaw domyślne kursy
      setExchangeRates({
        PLN: 1,
        EUR: 4.35,
        USD: 4.05,
        GBP: 5.10,
        CHF: 4.55,
        CZK: 0.17,
        SEK: 0.38,
        NOK: 0.37,
        DKK: 0.58,
        HUF: 0.011,
        RON: 0.87,
        UAH: 0.10,
        CAD: 2.95,
        AUD: 2.60
      });
    }
  };

  useEffect(() => {
    const init = async () => {
      await initializeDefaultData();
      await fetchExchangeRates(); // Pobierz kursy walut przy starcie
    };
    init();

    // Flaga czy users się załadowały
    let usersLoaded = false;
    
    const unsubOrders = subscribeToOrders(setOrders);
    const unsubUsers = subscribeToUsers((data) => {
      setUsers(data);
      // Wyłącz loading gdy users się załadują
      if (!usersLoaded && data.length > 0) {
        usersLoaded = true;
        setLoading(false);
      }
    });
    const unsubProducers = subscribeToProducers(setProducers);
    const unsubNotifs = subscribeToNotifications(setNotifications);
    const unsubComplaints = subscribeToComplaints(setComplaints);
    const unsubLeads = subscribeToLeads(setLeads);
    const unsubMessages = subscribeToMessages ? subscribeToMessages(setMessages) : () => {};
    const unsubPriceLists = subscribeToPriceLists ? subscribeToPriceLists(setPriceLists) : () => {};
    const unsubSettlements = subscribeToSettlements ? subscribeToSettlements(setSettlements) : () => {};

    const savedUser = localStorage.getItem('herratonUser');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    
    // Timeout safety - jeśli ładowanie trwa zbyt długo (10s), wyłącz loading
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    // Odświeżaj kursy co godzinę
    const ratesInterval = setInterval(fetchExchangeRates, 3600000);

    return () => {
      unsubOrders();
      unsubUsers();
      unsubProducers();
      unsubNotifs();
      unsubComplaints();
      unsubLeads();
      unsubMessages();
      unsubPriceLists();
      unsubSettlements();
      clearInterval(ratesInterval);
      clearTimeout(safetyTimeout);
    };
  }, []);

  // Sprawdź czy pokazać samouczek (raz po pierwszym zalogowaniu)
  useEffect(() => {
    if (user && !loading) {
      const tutorialSeen = localStorage.getItem(`herratonTutorialSeen_${user.id}`);
      if (!tutorialSeen && tutorialSteps.length > 0) {
        setTimeout(() => setShowTutorial(true), 1000);
      }
    }
  }, [user, loading, tutorialSteps]);

  // Ładuj kroki i kategorie samouczka z Firebase
  useEffect(() => {
    const loadTutorialData = async () => {
      try {
        const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        
        // Ładuj kroki
        const stepsQuery = query(collection(db, 'tutorialSteps'), orderBy('order', 'asc'));
        const stepsSnapshot = await getDocs(stepsQuery);
        setTutorialSteps(stepsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        // Ładuj kategorie
        const catsQuery = query(collection(db, 'tutorialCategories'), orderBy('order', 'asc'));
        const catsSnapshot = await getDocs(catsQuery);
        setTutorialCategories(catsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.log('Brak danych samouczka');
        setTutorialSteps([]);
        setTutorialCategories([]);
      }
    };
    loadTutorialData();
  }, []);

  // Funkcje zarządzania kategoriami samouczka
  const saveTutorialCategory = async (catData) => {
    try {
      const { collection, addDoc, doc, updateDoc, getDocs, query, orderBy, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      if (catData.id) {
        await updateDoc(doc(db, 'tutorialCategories', catData.id), { ...catData, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'tutorialCategories'), { ...catData, order: tutorialCategories.length, createdAt: serverTimestamp() });
      }
      
      const q = query(collection(db, 'tutorialCategories'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      setTutorialCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      return true;
    } catch (err) {
      console.error('Błąd zapisu kategorii:', err);
      return false;
    }
  };

  const deleteTutorialCategory = async (catId) => {
    try {
      const { doc, deleteDoc, collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      await deleteDoc(doc(db, 'tutorialCategories', catId));
      const q = query(collection(db, 'tutorialCategories'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      setTutorialCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      return true;
    } catch (err) {
      console.error('Błąd usuwania kategorii:', err);
      return false;
    }
  };

  // Ładuj spotkania z Firebase
  useEffect(() => {
    const loadMeetings = async () => {
      try {
        const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        const q = query(collection(db, 'meetings'), orderBy('dateTime', 'asc'));
        const snapshot = await getDocs(q);
        setMeetings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.log('Brak spotkań');
        setMeetings([]);
      }
    };
    loadMeetings();
  }, []);

  // Ładuj czaty klientów z Firebase (real-time)
  useEffect(() => {
    if (!user) return;
    
    let unsubscribe = null;
    
    const loadChats = async () => {
      try {
        const { collection, query, orderBy, onSnapshot } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        
        // Dla zwykłych pracowników - pokaż tylko ich czaty lub nieprzypisane
        // Dla adminów - pokaż wszystkie
        const q = query(collection(db, 'chats'), orderBy('lastMessageAt', 'desc'));
        
        unsubscribe = onSnapshot(q, (snapshot) => {
          const chats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          // Filtruj: pokaż nieprzypisane lub przypisane do tego użytkownika
          const filteredChats = chats.filter(chat => 
            !chat.assignedTo || chat.assignedTo === user.id || user.role === 'admin'
          );
          setClientChats(filteredChats);
        });
      } catch (err) {
        console.error('Błąd ładowania czatów:', err);
      }
    };
    
    loadChats();
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  // Funkcje zarządzania spotkaniami
  const saveMeeting = async (meetingData) => {
    try {
      const { collection, addDoc, doc, updateDoc, getDocs, query, orderBy, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      if (meetingData.id) {
        await updateDoc(doc(db, 'meetings', meetingData.id), { ...meetingData, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'meetings'), { ...meetingData, createdAt: serverTimestamp() });
      }
      
      const q = query(collection(db, 'meetings'), orderBy('dateTime', 'asc'));
      const snapshot = await getDocs(q);
      setMeetings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      return true;
    } catch (err) {
      console.error('Błąd zapisu spotkania:', err);
      return false;
    }
  };

  const deleteMeeting = async (meetingId) => {
    try {
      const { doc, deleteDoc, collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      await deleteDoc(doc(db, 'meetings', meetingId));
      const q = query(collection(db, 'meetings'), orderBy('dateTime', 'asc'));
      const snapshot = await getDocs(q);
      setMeetings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      return true;
    } catch (err) {
      console.error('Błąd usuwania spotkania:', err);
      return false;
    }
  };

  // Funkcje zarządzania krokami samouczka
  const saveTutorialStep = async (stepData) => {
    try {
      const { collection, addDoc, doc, updateDoc, getDocs, query, orderBy, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      if (stepData.id) {
        await updateDoc(doc(db, 'tutorialSteps', stepData.id), { ...stepData, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'tutorialSteps'), { ...stepData, order: tutorialSteps.length, createdAt: serverTimestamp() });
      }
      
      const q = query(collection(db, 'tutorialSteps'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      setTutorialSteps(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      return true;
    } catch (err) {
      console.error('Błąd zapisu:', err);
      return false;
    }
  };

  const deleteTutorialStep = async (stepId) => {
    try {
      const { doc, deleteDoc, collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      await deleteDoc(doc(db, 'tutorialSteps', stepId));
      const q = query(collection(db, 'tutorialSteps'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      setTutorialSteps(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      return true;
    } catch (err) {
      console.error('Błąd usuwania:', err);
      return false;
    }
  };

  const reorderTutorialSteps = async (newOrder) => {
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      for (let i = 0; i < newOrder.length; i++) {
        await updateDoc(doc(db, 'tutorialSteps', newOrder[i].id), { order: i });
      }
      setTutorialSteps(newOrder.map((s, i) => ({ ...s, order: i })));
      return true;
    } catch (err) {
      console.error('Błąd zmiany kolejności:', err);
      return false;
    }
  };

  // Popup dla nowych powiadomień
  useEffect(() => {
    // Dla kontrahenta - filtruj tylko jego powiadomienia
    const relevantNotifications = isContractor
      ? notifications.filter(n => {
          if (n.orderId) {
            const order = orders.find(o => o.id === n.orderId);
            return order && order.kontrahentId === user?.id;
          }
          return n.forContractor === user?.id;
        })
      : notifications;

    const unresolved = relevantNotifications.filter(n => !n.resolved).length;
    if (unresolved > prevNotifCount.current && relevantNotifications.length > 0) {
      // Pobierz najnowsze powiadomienie
      const newest = relevantNotifications
        .filter(n => !n.resolved)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      
      if (newest) {
        setPopupNotification(newest);
        playNotificationSound();
        // Automatycznie ukryj po 5 sekundach
        setTimeout(() => setPopupNotification(null), 5000);
      }
    }
    prevNotifCount.current = unresolved;
  }, [notifications, isContractor, orders, user]);

  useEffect(() => {
    if (orders.length > 0 && isAdmin) {
      autoSyncToGoogleSheets(orders);
    }
  }, [orders, isAdmin]);

  const onLogout = () => {
    localStorage.removeItem('herratonUser');
    setUser(null);
  };

  // Funkcja wysyłania push notification
  const sendPushNotification = async (title, body, data = {}, targetUserIds = []) => {
    try {
      console.log('🔔 sendPushNotification wywołane:', { title, body, targetUserIds });
      
      // Pobierz tokeny FCM użytkowników
      let tokens = [];
      
      if (targetUserIds.length > 0) {
        // Wyślij do konkretnych użytkowników
        tokens = users
          .filter(u => targetUserIds.includes(u.id) && u.fcmTokens?.length > 0)
          .flatMap(u => u.fcmTokens.map(t => t.token));
        console.log('🎯 Wysyłam do konkretnych użytkowników:', targetUserIds);
      } else {
        // Wyślij do WSZYSTKICH użytkowników z tokenami FCM (oprócz aktualnie zalogowanego)
        tokens = users
          .filter(u => u.fcmTokens?.length > 0 && u.id !== user?.id)
          .flatMap(u => u.fcmTokens.map(t => t.token));
        console.log('📢 Wysyłam do wszystkich użytkowników z FCM (oprócz siebie)');
      }
      
      console.log('📱 Znalezione tokeny:', tokens.length);
      
      if (tokens.length === 0) {
        console.log('⚠️ Brak tokenów FCM do wysłania');
        return;
      }
      
      // Usuń duplikaty
      tokens = [...new Set(tokens)];
      
      console.log(`📤 Wysyłam push do ${tokens.length} urządzeń`);
      
      // Generuj unikalny tag dla tego powiadomienia (zapobiega duplikatom)
      const notificationTag = `${data.type || 'notif'}-${Date.now()}`;
      
      const response = await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens,
          title,
          body,
          data: {
            ...data,
            url: '/',
            tag: notificationTag
          }
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Push wysłany:', result);
      } else {
        const errorText = await response.text();
        console.error('❌ Błąd wysyłania push:', errorText);
      }
    } catch (error) {
      console.error('❌ Błąd wysyłania push notification:', error);
    }
  };

  const addNotif = async (data) => {
    console.log('🔔 addNotif wywołane:', data);
    
    await addNotification({
      ...data,
      createdAt: new Date().toISOString(),
      resolved: false,
      forContractor: data.forContractor || null
    });
    
    // Wyślij push notification
    // Określ odbiorców na podstawie typu powiadomienia
    let targetUserIds = [];
    
    if (data.forDriver) {
      // Powiadomienie dla konkretnego kierowcy
      targetUserIds = [data.forDriver];
    } else if (data.forContractor) {
      // Powiadomienie dla kontrahenta
      targetUserIds = [data.forContractor];
    }
    // Jeśli targetUserIds jest puste, wyśle do wszystkich użytkowników z FCM
    
    console.log('🎯 Target users dla push:', targetUserIds.length > 0 ? targetUserIds : 'wszyscy');
    
    // Wyślij push (async, nie czekamy na wynik)
    sendPushNotification(
      data.title || 'Herraton',
      data.message || '',
      { orderId: data.orderId, type: data.type || 'notification' },
      targetUserIds
    );
  };

  const handleSaveOrder = async (form, currentUser) => {
    const now = new Date().toISOString();
    
    // Sprawdź czy to edycja istniejącego zamówienia (ma ID) czy nowe
    if (editingOrder?.id) {
      await updateOrder(editingOrder.id, {
        ...form,
        historia: [...(form.historia || []), { data: now, uzytkownik: currentUser.name, akcja: 'Edycja zamówienia' }]
      });
    } else {
      // Nowe zamówienie (w tym z leada)
      const newOrder = {
        ...form,
        linkedLeadId: editingOrder?.linkedLeadId || null, // Zachowaj powiązanie z leadem
        utworzonePrzez: { id: currentUser.id, nazwa: currentUser.name, data: now, oddzial: currentUser.id },
        historia: [{ data: now, uzytkownik: currentUser.name, akcja: 'Utworzono zamówienie' }]
      };
      await addOrder(newOrder);
      
      // Jeśli było powiązanie z leadem, zaktualizuj lead
      if (editingOrder?.linkedLeadId) {
        const lead = leads.find(l => l.id === editingOrder.linkedLeadId);
        if (lead) {
          await handleSaveLead({
            ...lead,
            status: 'zamowil',
            ostatniaAktualizacja: now,
            historia: [...(lead.historia || []), {
              data: now,
              uzytkownik: currentUser.name,
              akcja: `Utworzono zamówienie: ${form.nrWlasny}`
            }]
          }, lead.id);
        }
      }
      
      // Powiadomienie o nowym zamówieniu - dla wszystkich
      await addNotif({ 
        icon: '📦', 
        title: `Nowe zamówienie: ${form.nrWlasny}`, 
        message: `Dodane przez: ${currentUser.name} | Klient: ${form.klient?.imie || 'brak'} | ${form.towar?.substring(0, 50) || ''}`, 
        orderId: null, 
        forContractor: isContractor ? currentUser.id : null,
        type: 'new_order'
      });
    }
    setShowOrderModal(false);
    setEditingOrder(null);
  };

  // Przeniesienie do kosza zamiast usuwania
  const handleDeleteOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Sprawdź uprawnienia - tylko admin lub twórca zamówienia może usunąć
    const isCreator = order.utworzonePrzez?.id === user?.id || order.kontrahentId === user?.id;
    if (!isAdmin && !isCreator) {
      alert('Nie masz uprawnień do usunięcia tego zamówienia. Możesz usuwać tylko własne zamówienia.');
      return;
    }

    if (!window.confirm(`Czy na pewno chcesz przenieść zamówienie ${order.nrWlasny} do kosza?`)) {
      return;
    }

    const now = new Date().toISOString();
    await updateOrder(orderId, {
      ...order,
      usuniety: true,
      usunietyPrzez: { id: user.id, nazwa: user.name, data: now },
      historia: [...(order.historia || []), { 
        data: now, 
        uzytkownik: user.name, 
        akcja: 'Przeniesiono do kosza' 
      }]
    });
  };

  // Przywrócenie z kosza
  const handleRestoreOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const now = new Date().toISOString();
    await updateOrder(orderId, {
      ...order,
      usuniety: false,
      usunietyPrzez: null,
      historia: [...(order.historia || []), { 
        data: now, 
        uzytkownik: user.name, 
        akcja: 'Przywrócono z kosza' 
      }]
    });
  };

  // Trwałe usunięcie (tylko admin)
  const handlePermanentDelete = async (orderId) => {
    if (!isAdmin) {
      alert('Tylko administrator może trwale usuwać zamówienia.');
      return;
    }

    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    if (!window.confirm(`UWAGA! Czy na pewno chcesz TRWALE usunąć zamówienie ${order.nrWlasny}? Ta operacja jest nieodwracalna!`)) {
      return;
    }

    await deleteOrder(orderId);
  };

  const handleStatusChange = async (orderId, newStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const oldStatusName = getStatus(order.status)?.name || order.status;
    const newStatusName = getStatus(newStatus)?.name || newStatus;
    
    // Jeśli to pojedyncze zamówienie (1 produkt lub brak produktów), zmień też status produktu
    let updatedProdukty = order.produkty;
    if (order.produkty && order.produkty.length === 1) {
      // Pojedyncze zamówienie - zmień status produktu razem z głównym statusem
      updatedProdukty = order.produkty.map(p => ({
        ...p,
        status: newStatus
      }));
    }
    
    // Zapisz zmianę statusu
    await updateOrder(orderId, {
      ...order,
      status: newStatus,
      produkty: updatedProdukty,
      historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: user?.name || 'system', akcja: `Status: ${newStatusName}` }]
    });
    
    // Powiadomienie systemowe
    await addNotif({
      icon: getStatus(newStatus)?.icon,
      title: `Status: ${order.nrWlasny}`,
      message: `${user?.name || 'System'} zmienił status na: ${newStatusName}`,
      orderId: orderId,
      type: 'status_change'
    });
    
    // Jeśli klient ma email - zapytaj o powiadomienie
    if (order.klient?.email) {
      setStatusChangeModal({
        orderId,
        order,
        oldStatus: oldStatusName,
        newStatus: newStatusName,
        newStatusCode: newStatus
      });
    }
  };

  // Zmiana statusu pojedynczego produktu w zamówieniu łączonym
  const handleProductStatusChange = async (orderId, productIndex, newStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.produkty || !order.produkty[productIndex]) return;
    
    const updatedProducts = [...order.produkty];
    updatedProducts[productIndex] = {
      ...updatedProducts[productIndex],
      status: newStatus
    };
    
    const newStatusName = getStatus(newStatus)?.name || newStatus;
    const productNr = updatedProducts[productIndex].nrPodzamowienia || `Produkt ${productIndex + 1}`;
    
    // Zapisz zmianę
    await updateOrder(orderId, {
      ...order,
      produkty: updatedProducts,
      historia: [...(order.historia || []), { 
        data: new Date().toISOString(), 
        uzytkownik: user?.name || 'system', 
        akcja: `${productNr}: ${newStatusName}` 
      }]
    });
    
    // Powiadomienie
    await addNotif({
      icon: getStatus(newStatus)?.icon,
      title: `Status produktu: ${productNr}`,
      message: `${user?.name || 'System'} zmienił status na: ${newStatusName}`,
      orderId: orderId,
      type: 'status_change'
    });
  };

  // Funkcja wysyłania emaila o zmianie statusu
  const sendStatusChangeEmail = async (modalData) => {
    const { order, oldStatus, newStatus, newStatusCode } = modalData;
    const walutaSymbol = CURRENCIES.find(c => c.code === order.platnosci?.waluta)?.symbol || 'zł';
    const zaplacono = order.platnosci?.zaplacono || 0;
    const dataPlatnosci = order.platnosci?.dataPlatnosciKierowcy || order.platnosci?.dataZaplaty || new Date().toISOString().split('T')[0];
    
    const subject = `Zmiana statusu zamówienia nr ${order.nrWlasny}`;
    
    // Dodatkowe informacje w zależności od statusu
    let additionalInfo = '';
    let paymentInfo = '';
    
    if (newStatusCode === 'gotowe') {
      additionalInfo = `\n\n🎉 Twoje zamówienie jest gotowe do odbioru!\nPo odbiorze towaru otrzymasz potwierdzenie dostawy.`;
    } else if (newStatusCode === 'w_transporcie') {
      additionalInfo = `\n\n🚚 Twoje zamówienie jest w drodze!\nWkrótce skontaktuje się z Tobą nasz kierowca.`;
    } else if (newStatusCode === 'dostarczone') {
      additionalInfo = `\n\n✅ Zamówienie zostało dostarczone!\nDziękujemy za zakupy. Zapraszamy ponownie!`;
      // Dla statusu "dostarczone" pokazujemy info o zapłacie kierowcy
      if (zaplacono > 0) {
        paymentInfo = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 POTWIERDZENIE PŁATNOŚCI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kwota ${zaplacono.toFixed(2)} ${walutaSymbol} została zapłacona kierowcy dnia ${formatDate(dataPlatnosci)}.`;
      }
    } else {
      // Dla innych statusów standardowa informacja
      const doZaplaty = order.platnosci?.doZaplaty || ((order.platnosci?.cenaCalkowita || 0) - zaplacono);
      if (doZaplaty > 0) {
        paymentInfo = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 INFORMACJE O PŁATNOŚCI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do zapłaty pozostało: ${doZaplaty.toFixed(2)} ${walutaSymbol}`;
      }
    }
    
    const body = `Szanowny/a ${order.klient?.imie || 'Kliencie'},

Informujemy o zmianie statusu Twojego zamówienia.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ZMIANA STATUSU ZAMÓWIENIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔢 Numer zamówienia: ${order.nrWlasny}

📊 Status zmieniony:
   ❌ Poprzedni: ${oldStatus}
   ✅ Aktualny: ${newStatus}
${additionalInfo}${paymentInfo}

W razie pytań prosimy o kontakt.

Pozdrawiamy,
Zespół obsługi zamówień

---
📧 Ta wiadomość została wysłana automatycznie. Prosimy nie odpowiadać na ten email.`;

    // Wyślij przez MailerSend
    const result = await sendEmailViaMailerSend(
      order.klient.email,
      order.klient.imie,
      subject,
      body
    );
    
    if (result.success) {
      alert('✅ Email został wysłany pomyślnie!');
    } else {
      alert('❌ Błąd wysyłania emaila. Spróbuj ponownie.');
      console.error('Błąd MailerSend:', result.error);
    }
    
    setStatusChangeModal(null);
  };

  const handleSaveUsers = async (newList) => {
    const deletedIds = new Set(); // Śledź usunięte ID
    
    // Znajdź użytkowników do usunięcia
    for (const old of users) {
      if (!newList.find(x => x.id === old.id) && old.username !== 'admin') {
        console.log('Usuwanie użytkownika:', old.id, old.name);
        try { 
          await deleteUser(old.id); 
          deletedIds.add(old.id);
          console.log('Użytkownik usunięty:', old.id);
        } catch (err) {
          console.error('Błąd usuwania użytkownika:', err);
        }
      }
    }
    // Dodaj nowych lub zaktualizuj istniejących (ale nie odtwarzaj usuniętych!)
    for (const u of newList) {
      if (deletedIds.has(u.id)) continue; // Pomiń usunięte
      
      if (!u.id || String(u.id).startsWith('new_')) {
        const payload = { ...u };
        delete payload.id;
        try { 
          await addUser(payload); 
          console.log('Dodano użytkownika:', payload.name);
        } catch (err) {
          console.error('Błąd dodawania użytkownika:', err);
        }
      } else {
        try { 
          await updateUser(u.id, u); 
        } catch (err) {
          console.error('Błąd aktualizacji użytkownika:', err);
        }
      }
    }
  };

  const handleSaveProducers = async (list) => {
    const currentIds = new Set(Object.keys(producers));
    const nextIds = new Set(list.map(p => p.id));
    const deletedIds = new Set(); // Śledź usunięte ID
    
    // Usuń producentów których nie ma na nowej liście
    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        console.log('Usuwanie producenta:', id);
        try { 
          await deleteProducer(id); 
          deletedIds.add(id);
          console.log('Producent usunięty:', id);
        } catch (err) {
          console.error('Błąd usuwania producenta:', err);
        }
      }
    }
    // Dodaj lub zaktualizuj (ale nie odtwarzaj usuniętych!)
    for (const p of list) {
      if (deletedIds.has(p.id)) continue; // Pomiń usunięte
      
      if (producers[p.id]) {
        try { 
          await updateProducer(p.id, p); 
        } catch (err) {
          console.error('Błąd aktualizacji producenta:', err);
        }
      } else {
        try { 
          await addProducer(p); 
          console.log('Dodano producenta:', p.name);
        } catch (err) {
          console.error('Błąd dodawania producenta:', err);
        }
      }
    }
  };

  const handleResolveNotification = async (id) => {
    await updateNotification(id, { resolved: true, resolvedAt: new Date().toISOString() });
  };

  const handleDeleteNotification = async (id) => {
    await deleteNotification(id);
  };

  const handleClearAllNotifications = async () => {
    if (window.confirm('Czy na pewno chcesz usunąć wszystkie powiadomienia?')) {
      const toDelete = visibleNotifications;
      for (const n of toDelete) {
        try { await deleteNotification(n.id); } catch {}
      }
    }
  };

  // Handlery reklamacji
  const handleSaveComplaint = async (complaint, id = null) => {
    if (id) {
      await updateComplaint(id, complaint);
    } else {
      await addComplaint(complaint);
    }
  };

  const handleDeleteComplaint = async (id) => {
    await deleteComplaint(id);
  };

  // Handlery leads (zainteresowani)
  const handleSaveLead = async (lead, id = null) => {
    if (id) {
      await updateLead(id, lead);
    } else {
      await addLead(lead);
    }
  };

  const handleDeleteLead = async (id) => {
    await deleteLead(id);
  };

  // MESSENGER - funkcje obsługi wiadomości
  const handleSendMessage = async (messageData) => {
    if (addMessage) {
      await addMessage(messageData);
      
      // Wyślij push notification do odbiorcy
      const receiver = users.find(u => u.id === messageData.receiverId);
      if (receiver && receiver.fcmTokens?.length > 0) {
        const tokens = receiver.fcmTokens.map(t => t.token);
        
        console.log('📨 Wysyłam push o nowej wiadomości do:', receiver.name);
        
        try {
          const response = await fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tokens,
              title: `💬 Wiadomość od ${messageData.senderName}`,
              body: messageData.text?.substring(0, 100) || 'Nowa wiadomość',
              data: {
                type: 'message',
                senderId: messageData.senderId,
                url: '/'
              }
            })
          });
          
          if (response.ok) {
            console.log('✅ Push o wiadomości wysłany');
          } else {
            console.error('❌ Błąd wysyłania push o wiadomości');
          }
        } catch (error) {
          console.error('❌ Błąd wysyłania push:', error);
        }
      }
    }
  };

  const handleMarkMessageAsRead = async (messageId) => {
    if (updateMessage) {
      await updateMessage(messageId, { read: true });
    }
  };

  // Popup dla nowych wiadomości
  useEffect(() => {
    const myMessages = messages.filter(m => m.receiverId === user?.id && !m.read);
    const unreadCount = myMessages.length;
    
    if (unreadCount > prevMessageCount.current && messages.length > 0) {
      const newest = myMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      if (newest && !showMessenger) {
        setNewMessagePopup({
          senderName: newest.senderName,
          text: newest.text?.substring(0, 50) + (newest.text?.length > 50 ? '...' : '')
        });
        setTimeout(() => setNewMessagePopup(null), 4000);
      }
    }
    prevMessageCount.current = unreadCount;
  }, [messages, user, showMessenger]);

  const handleConvertLeadToOrder = (lead) => {
    // Zamknij panel leads
    setShowLeadsPanel(false);
    // Otwórz formularz zamówienia z danymi klienta i powiązaniem do leada
    // WAŻNE: nie ustawiamy id, więc handleSaveOrder utworzy nowe zamówienie
    setEditingOrder({
      // Domyślne wartości dla nowego zamówienia
      kraj: 'PL',
      status: 'nowe',
      dataZlecenia: new Date().toISOString().split('T')[0],
      // Dane z leada
      klient: {
        imie: lead.imie || '',
        telefon: lead.telefon || '',
        email: lead.email || '',
        facebookUrl: lead.facebookUrl || '',
        adres: ''
      },
      towar: lead.produkty || '',
      platnosci: {
        waluta: lead.waluta || 'PLN',
        cenaCalkowita: parseFloat(lead.szacowanaKwota) || 0,
        zaplacono: 0,
        doZaplaty: parseFloat(lead.szacowanaKwota) || 0,
        metodaZaplaty: ''
      },
      koszty: { 
        waluta: 'PLN', 
        zakupNetto: 0, 
        zakupBrutto: 0, 
        transportWaluta: 'PLN',
        transportBrutto: 0,
        transportNetto: 0,
        vatRate: 23
      },
      linkedLeadId: lead.id // Powiązanie z leadem - bez id zamówienia!
    });
    setShowOrderModal(true);
  };

  // Powiadomienia kontrahenta - TYLKO dotyczące jego zamówień
  const visibleNotifications = isContractor
    ? notifications.filter(n => {
        // Sprawdź czy powiadomienie dotyczy zamówienia kontrahenta
        if (n.orderId) {
          const order = orders.find(o => o.id === n.orderId);
          return order && order.kontrahentId === user?.id;
        }
        // Lub czy jest specjalnie dla tego kontrahenta
        return n.forContractor === user?.id;
      })
    : notifications;

  const visibleComplaints = isContractor
    ? complaints.filter(c => c.utworzonePrzez?.id === user?.id)
    : complaints;

  // Zamówienia aktywne (nie usunięte)
  const activeOrders = orders.filter(o => !o.usuniety);
  
  // Zamówienia w koszu
  const trashedOrders = isContractor
    ? orders.filter(o => o.usuniety && o.kontrahentId === user?.id)
    : orders.filter(o => o.usuniety);

  const visibleOrders = isContractor
    ? activeOrders.filter(o => o.kontrahentId === user?.id)
    : activeOrders;

  const orderCountries = [...new Set(visibleOrders.map(o => o.kraj).filter(Boolean))];
  const creators = [...new Set(visibleOrders.map(o => o.utworzonePrzez?.nazwa).filter(Boolean))];

  const filteredOrders = visibleOrders.filter(o => {
    // Filtrowanie po statusie - sprawdź główny status LUB statusy produktów
    if (filter !== 'all') {
      const mainStatus = o.status;
      const productStatuses = o.produkty?.map(p => p.status).filter(Boolean) || [];
      const allStatuses = [mainStatus, ...productStatuses].filter(Boolean);
      
      // Zamówienie pasuje jeśli którykolwiek status pasuje
      if (!allStatuses.includes(filter)) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [o.nrWlasny, o.towar, o.klient?.imie, o.klient?.adres, o.klient?.telefon, o.klient?.email].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (countryFilter !== 'all' && o.kraj !== countryFilter) return false;
    if (creatorFilter !== 'all' && (o.utworzonePrzez?.nazwa || '') !== creatorFilter) return false;
    if (driverFilter !== 'all') {
      if (driverFilter === 'unassigned') {
        // Sprawdź czy zamówienie nie ma przypisanego kierowcy ani w głównym polu ani w produktach
        const hasDriver = o.przypisanyKierowca || o.produkty?.some(p => p.kierowca);
        if (hasDriver) return false;
      } else {
        // Sprawdź czy kierowca jest przypisany do zamówienia lub do któregoś produktu
        const matchesDriver = o.przypisanyKierowca === driverFilter || 
                             o.produkty?.some(p => p.kierowca === driverFilter);
        if (!matchesDriver) return false;
      }
    }
    if (producerFilter !== 'all') {
      if (producerFilter === 'unassigned') {
        const hasProducer = o.zaladunek || o.produkty?.some(p => p.producent);
        if (hasProducer) return false;
      } else {
        const matchesProducer = o.zaladunek === producerFilter || 
                               o.produkty?.some(p => p.producent === producerFilter);
        if (!matchesProducer) return false;
      }
    }
    if (urgencyFilter !== 'all') {
      // Dla zamówień łączonych - sprawdź czy którykolwiek produkt pasuje do filtra
      let hasMatchingProduct = false;
      const finishedStatuses = ['gotowe_do_odbioru', 'odebrane', 'w_transporcie', 'dostarczone'];
      
      if (o.produkty && o.produkty.length > 0) {
        // Zamówienie łączone - sprawdź wszystkie produkty
        for (const prod of o.produkty) {
          // Pomiń produkty z gotowe_do_odbioru lub dalszymi statusami
          if (finishedStatuses.includes(prod.status)) continue;
          
          // Ten produkt NIE jest gotowy - sprawdź czy pasuje do filtra pilności
          const prodPickupDate = prod.dataOdbioru;
          const d = getDaysUntilPickup(prodPickupDate);
          
          // Jeśli produkt nie ma daty - pomiń (nie pasuje do filtra pilności)
          if (d === null) continue;
          
          // Dziś = dzisiaj (0) + zaległe (ujemne)
          if (urgencyFilter === 'today' && d <= 0) { hasMatchingProduct = true; break; }
          // 3 dni = od 1 do 3 dni
          if (urgencyFilter === '3days' && d >= 1 && d <= 3) { hasMatchingProduct = true; break; }
          // 7 dni = od 4 do 7 dni
          if (urgencyFilter === 'week' && d >= 4 && d <= 7) { hasMatchingProduct = true; break; }
          // 8+ dni
          if (urgencyFilter === 'later' && d >= 8) { hasMatchingProduct = true; break; }
        }
      } else {
        // Pojedyncze zamówienie
        // Pomiń zamówienia z gotowe_do_odbioru lub dalszymi statusami
        if (!finishedStatuses.includes(o.status)) {
          const pickupDate = o.dataOdbioru || o.produkty?.[0]?.dataOdbioru;
          const d = getDaysUntilPickup(pickupDate);
          
          if (d !== null) {
            // Dziś = dzisiaj (0) + zaległe (ujemne)
            if (urgencyFilter === 'today' && d <= 0) hasMatchingProduct = true;
            // 3 dni = od 1 do 3 dni
            if (urgencyFilter === '3days' && d >= 1 && d <= 3) hasMatchingProduct = true;
            // 7 dni = od 4 do 7 dni
            if (urgencyFilter === 'week' && d >= 4 && d <= 7) hasMatchingProduct = true;
            // 8+ dni
            if (urgencyFilter === 'later' && d >= 8) hasMatchingProduct = true;
          }
        }
      }
      
      if (!hasMatchingProduct) return false;
    }
    return true;
  }).sort((a, b) => {
    // Sortowanie po dacie
    const dateA = new Date(a.dataZlecenia || a.utworzonePrzez?.data || 0);
    const dateB = new Date(b.dataZlecenia || b.utworzonePrzez?.data || 0);
    return dateSort === 'newest' ? dateB - dateA : dateA - dateB;
  });

  const paymentSums = calcPaymentSums(filteredOrders);

  if (user?.role === 'driver') {
    return (
      <DriverPanel
        user={user}
        orders={orders}
        producers={producers}
        onUpdateOrder={updateOrder}
        onAddNotification={addNotif}
        onLogout={onLogout}
        onUpdateUser={async (userId, data) => {
          await updateUser(userId, data);
          // Aktualizuj lokalny stan użytkownika
          const updatedUser = { ...user, ...data };
          setUser(updatedUser);
          localStorage.setItem('herratonUser', JSON.stringify(updatedUser));
        }}
        settlements={settlements}
        users={users}
      />
    );
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} users={users} loading={loading} />;
  }

  const unresolvedNotifs = visibleNotifications.filter(n => !n.resolved).length;

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-logo">📦</div>
            <div>
              <div className="header-title">Herraton</div>
              <div className="header-subtitle">Panel • {user.name} ({getRole(user.role)?.name})</div>
            </div>
          </div>

          <div className="header-actions">
            <button className="btn-secondary" onClick={() => setShowNotifications(true)}>
              🔔 {unresolvedNotifs}
            </button>

            {/* Przycisk czatów klientów */}
            <button 
              className="btn-secondary" 
              onClick={() => setShowClientChats(true)}
              style={{background: clientChats.filter(c => c.unreadByStaff && (!c.assignedTo || c.assignedTo === user?.id)).length > 0 ? 'linear-gradient(135deg,#8B5CF6,#6D28D9)' : undefined, color: clientChats.filter(c => c.unreadByStaff).length > 0 ? 'white' : undefined}}
            >
              💬 Czaty ({clientChats.filter(c => c.status !== 'closed').length})
            </button>

            <button className="btn-secondary complaint-btn" onClick={() => setShowComplaintsPanel(true)}>
              📋 Reklamacje ({visibleComplaints.filter(c => c.status !== 'rozwiazana' && c.status !== 'odrzucona').length})
            </button>

            {(isAdmin || user?.role === 'worker') && (
              <button className="btn-secondary leads-btn" onClick={() => setShowLeadsPanel(true)}>
                🎯 Zainteresowani ({leads.filter(l => !['zamowil', 'rezygnacja'].includes(l.status)).length})
              </button>
            )}

            {/* Menu rozwijane Wysyłka - dla admina i pracownika */}
            {(isAdmin || user?.role === 'worker') && (
              <div className="settings-dropdown" ref={shippingMenuRef}>
                <button 
                  className="btn-secondary shipping-btn" 
                  onClick={() => setShowShippingMenu(!showShippingMenu)}
                >
                  📦 Wysyłka {showShippingMenu ? '▲' : '▼'}
                </button>
                {showShippingMenu && (
                  <div className="settings-menu">
                    <button onClick={() => { setShowSamplesPanel(true); setShowShippingMenu(false); }}>
                      🧪 Próbki ({samples.filter(s => s.status !== 'wyslane').length})
                    </button>
                    <button onClick={() => { setShowMailPanel(true); setShowShippingMenu(false); }}>
                      ✉️ Poczta ({mailItems.filter(m => m.status !== 'wyslane').length})
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Kosz - dla admina i pracownika */}
            {(isAdmin || user?.role === 'worker') && (
              <button className="btn-secondary trash-btn" onClick={() => setShowTrashPanel(true)}>
                🗑️ Kosz {trashedOrders.length > 0 && <span className="trash-count">({trashedOrders.length})</span>}
              </button>
            )}

            {/* Menu rozwijane Ustawienia - dla admina */}
            {isAdmin && (
              <div className="settings-dropdown" ref={settingsMenuRef}>
                <button 
                  className="btn-secondary settings-btn" 
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                >
                  ⚙️ Ustawienia {showSettingsMenu ? '▲' : '▼'}
                </button>
                {showSettingsMenu && (
                  <div className="settings-menu">
                    <button onClick={() => { setShowStatistics(true); setShowSettingsMenu(false); }}>
                      📊 Statystyki
                    </button>
                    <button onClick={() => { setShowSettlementsPanel(true); setShowSettingsMenu(false); }}>
                      💰 Rozliczenia transportowe
                    </button>
                    <button onClick={() => { setShowContactsPanel(true); setShowSettingsMenu(false); }}>
                      📇 Kontakty
                    </button>
                    <button onClick={() => { setShowUsersModal(true); setShowSettingsMenu(false); }}>
                      👥 Użytkownicy
                    </button>
                    <button onClick={() => { setShowProducersModal(true); setShowSettingsMenu(false); }}>
                      🏭 Producenci
                    </button>
                    <button onClick={() => { setShowPriceListManager(true); setShowSettingsMenu(false); }}>
                      📋 Cenniki produktów
                    </button>
                    <button onClick={() => { setShowSettingsModal(true); setShowSettingsMenu(false); }}>
                      🔧 Konfiguracja
                    </button>
                    <div className="settings-menu-divider"></div>
                    <button onClick={() => { exportToExcel(filteredOrders); setShowSettingsMenu(false); }}>
                      📥 Export Excel
                    </button>
                    <button onClick={() => { autoSyncToGoogleSheets(filteredOrders); setShowSettingsMenu(false); }}>
                      🔄 Sync Google Sheets
                    </button>
                    <div className="settings-menu-divider"></div>
                    <button onClick={() => { setShowTutorialConfig(true); setShowSettingsMenu(false); }}>
                      🎓 Konfiguracja samouczka
                    </button>
                    <button onClick={() => { 
                      localStorage.removeItem(`herratonTutorialSeen_${user?.id}`);
                      setShowTutorial(true);
                      setTutorialStep(0);
                      setShowSettingsMenu(false);
                    }}>
                      ▶️ Uruchom samouczek
                    </button>
                    <button onClick={() => { 
                      window.open('/instrukcja.pdf', '_blank');
                      setShowSettingsMenu(false);
                    }}>
                      📖 Instrukcja PDF
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Menu dla pracownika */}
            {user?.role === 'worker' && (
              <div className="settings-dropdown" ref={settingsMenuRef}>
                <button 
                  className="btn-secondary settings-btn" 
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                >
                  ⚙️ Ustawienia {showSettingsMenu ? '▲' : '▼'}
                </button>
                {showSettingsMenu && (
                  <div className="settings-menu">
                    <button onClick={() => { setShowStatistics(true); setShowSettingsMenu(false); }}>
                      📊 Statystyki
                    </button>
                    <button onClick={() => { setShowContactsPanel(true); setShowSettingsMenu(false); }}>
                      📇 Kontakty
                    </button>
                    <button onClick={() => { setShowProducersModal(true); setShowSettingsMenu(false); }}>
                      🏭 Producenci
                    </button>
                    <button onClick={() => { setShowPriceListManager(true); setShowSettingsMenu(false); }}>
                      📋 Cenniki produktów
                    </button>
                    <div className="settings-menu-divider"></div>
                    <button onClick={() => { 
                      localStorage.removeItem(`herratonTutorialSeen_${user?.id}`);
                      setShowTutorial(true);
                      setTutorialStep(0);
                      setShowSettingsMenu(false);
                    }}>
                      🎓 Uruchom samouczek
                    </button>
                    <button onClick={() => { 
                      window.open('/instrukcja.pdf', '_blank');
                      setShowSettingsMenu(false);
                    }}>
                      📖 Instrukcja PDF
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Kontrahent - kontakty i dane firmy */}
            {isContractor && (
              <>
                <button className="btn-secondary contacts-btn" onClick={() => setShowContactsPanel(true)}>
                  📇 Moje kontakty
                </button>
                <button className="btn-secondary stats-btn" onClick={() => setShowStatistics(true)}>📊 Moje statystyki</button>
                <button className="btn-secondary" onClick={() => setShowCompanyModal(true)}>🏢 Dane firmy</button>
              </>
            )}

            <button className="btn-logout" onClick={onLogout}>Wyloguj</button>
          </div>
        </div>
      </header>

      {showNotifications && (
        <NotificationsPanel
          notifications={visibleNotifications}
          onClose={() => setShowNotifications(false)}
          onResolve={handleResolveNotification}
          onDelete={handleDeleteNotification}
          onClearAll={handleClearAllNotifications}
          onOrderClick={(orderId) => {
            const ord = orders.find(o => o.id === orderId);
            if (ord) setViewingOrder(ord);
            setShowNotifications(false);
          }}
        />
      )}

      <main className="main">
        {/* Kompaktowy slider harmonogramu spotkań */}
        {(user?.role === 'admin' || user?.role === 'worker') && (() => {
          const now = new Date();
          const upcomingMeetings = meetings
            .filter(m => new Date(m.dateTime) >= now)
            .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
            .slice(0, 5);

          return (
            <div className="meetings-slider-compact" style={{
              background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '12px',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.2)'
            }}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom: upcomingMeetings.length > 0 ? '8px' : '0'}}>
                <span style={{color:'white',fontWeight:'600',fontSize:'13px'}}>📅 Harmonogram spotkań</span>
                <button 
                  onClick={() => { setEditingMeeting(null); setShowMeetingModal(true); }}
                  style={{background:'rgba(255,255,255,0.2)',border:'none',color:'white',padding:'4px 10px',borderRadius:'6px',cursor:'pointer',fontSize:'11px',fontWeight:'500'}}
                >
                  ✏️ Edytuj
                </button>
              </div>
              {upcomingMeetings.length > 0 ? (
                <div style={{display:'flex',gap:'8px',overflowX:'auto',paddingBottom:'4px'}}>
                  {upcomingMeetings.map(meeting => {
                    const meetDate = new Date(meeting.dateTime);
                    const isToday = meetDate.toDateString() === now.toDateString();
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const isTomorrow = meetDate.toDateString() === tomorrow.toDateString();
                    
                    return (
                      <div 
                        key={meeting.id}
                        onClick={() => { setEditingMeeting(meeting); setShowMeetingModal(true); }}
                        style={{
                          background: isToday ? 'rgba(239,68,68,0.9)' : isTomorrow ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.15)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          minWidth: '140px',
                          cursor: 'pointer',
                          transition: 'transform 0.2s',
                          flexShrink: 0
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <div style={{color:'white',fontWeight:'700',fontSize:'12px',marginBottom:'2px'}}>
                          {isToday ? '🔴 DZIŚ' : isTomorrow ? '🟡 JUTRO' : meetDate.toLocaleDateString('pl-PL', {weekday:'short', day:'numeric', month:'short'})}
                        </div>
                        <div style={{color:'rgba(255,255,255,0.9)',fontSize:'14px',fontWeight:'600'}}>
                          {meetDate.toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'})}
                        </div>
                        {meeting.title && (
                          <div style={{color:'rgba(255,255,255,0.8)',fontSize:'11px',marginTop:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'120px'}}>
                            {meeting.title}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{color:'rgba(255,255,255,0.7)',fontSize:'12px',textAlign:'center',padding:'4px 0'}}>
                  Brak zaplanowanych spotkań
                </div>
              )}
            </div>
          );
        })()}

        {/* Kompaktowy slider planowanych wyjazdów kierowców */}
        {(user?.role === 'admin' || user?.role === 'worker') && (() => {
          const driversWithTrips = users
            .filter(u => u.role === 'driver' && u.plannedTrips && u.plannedTrips.length > 0)
            .map(driver => {
              const todayDate = new Date();
              todayDate.setHours(0,0,0,0);
              const futureTrips = driver.plannedTrips
                .filter(t => new Date(t.departureDate || t.date) >= todayDate)
                .sort((a, b) => new Date(a.departureDate || a.date) - new Date(b.departureDate || b.date));
              return { ...driver, futureTrips };
            })
            .filter(d => d.futureTrips.length > 0);

          if (driversWithTrips.length === 0) return null;

          return (
            <div className="drivers-trips-slider-compact">
              <div className="trips-slider-header-compact">
                <span className="trips-slider-title">🚗 Najbliższe wyjazdy kierowców</span>
              </div>
              <div className="trips-slider-content-compact">
                {driversWithTrips.map(driver => {
                  const nextTrip = driver.futureTrips[0];
                  if (!nextTrip) return null;
                  
                  const depDate = new Date(nextTrip.departureDate || nextTrip.date);
                  const todayCheck = new Date();
                  todayCheck.setHours(0,0,0,0);
                  const isToday = depDate.toDateString() === todayCheck.toDateString();
                  const tomorrow = new Date(todayCheck);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const isTomorrow = depDate.toDateString() === tomorrow.toDateString();
                  
                  return (
                    <div 
                      key={driver.id} 
                      className={`driver-trip-card-compact ${isToday ? 'today' : ''} ${isTomorrow ? 'tomorrow' : ''}`}
                      onClick={() => setShowDriverTripsDetail(driver)}
                    >
                      <div className="card-compact-header">
                        <span className="driver-name-compact">🚚 {driver.name}</span>
                        {driver.futureTrips.length > 1 && (
                          <span className="more-badge">+{driver.futureTrips.length - 1}</span>
                        )}
                      </div>
                      <div className="card-compact-body">
                        <div className="compact-row">
                          <span>📦</span>
                          <span>
                            {formatDate(nextTrip.pickupFrom || nextTrip.date)}
                            {nextTrip.pickupTo && nextTrip.pickupTo !== nextTrip.pickupFrom && (
                              <> — {formatDate(nextTrip.pickupTo)}</>
                            )}
                          </span>
                        </div>
                        <div className="compact-row departure">
                          <span>🚗</span>
                          <span className="departure-date">
                            {isToday ? '🔴 DZIŚ' : isTomorrow ? '🟡 JUTRO' : formatDate(nextTrip.departureDate || nextTrip.date)}
                          </span>
                          {nextTrip.destination && <span className="compact-dest">→ {nextTrip.destination}</span>}
                        </div>
                        {nextTrip.note && (
                          <div className="compact-row note">
                            <span>📝</span>
                            <span className="note-text">{nextTrip.note}</span>
                          </div>
                        )}
                      </div>
                      <div className="card-compact-footer">
                        <span className="view-more">Kliknij, aby zobaczyć wszystkie wyjazdy →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="top-bar">
          <div className="top-left">
            <button className="btn-primary btn-add-order" onClick={() => { setEditingOrder(null); setShowOrderModal(true); }}>
              ➕ Nowe zamówienie
            </button>
            <input
              className="search-input search-box"
              placeholder="🔍 Szukaj (nr, klient, adres, tel...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          {/* Pasek pilności - kompaktowy */}
          {(() => {
            const finishedStatuses = ['gotowe_do_odbioru', 'odebrane', 'w_transporcie', 'dostarczone'];
            let todayCount = 0;
            let threeDaysCount = 0;
            let weekCount = 0;
            let laterCount = 0;
            
            visibleOrders.forEach(o => {
              if (o.produkty && o.produkty.length > 0) {
                o.produkty.forEach(prod => {
                  if (finishedStatuses.includes(prod.status)) return;
                  const d = getDaysUntilPickup(prod.dataOdbioru);
                  if (d === null) return;
                  if (d <= 0) todayCount++;
                  else if (d >= 1 && d <= 3) threeDaysCount++;
                  else if (d >= 4 && d <= 7) weekCount++;
                  else laterCount++;
                });
              } else {
                if (finishedStatuses.includes(o.status)) return;
                const d = getDaysUntilPickup(o.dataOdbioru || o.produkty?.[0]?.dataOdbioru);
                if (d === null) return;
                if (d <= 0) todayCount++;
                else if (d >= 1 && d <= 3) threeDaysCount++;
                else if (d >= 4 && d <= 7) weekCount++;
                else laterCount++;
              }
            });
            
            return (
              <div className="urgency-pills">
                <span className="urgency-pills-label">📅 Odbiory:</span>
                <button 
                  className={`urgency-pill urgent ${urgencyFilter === 'today' ? 'active' : ''} ${todayCount > 0 ? 'has-items' : ''}`}
                  onClick={() => setUrgencyFilter(urgencyFilter === 'today' ? 'all' : 'today')}
                >
                  <span className="pill-count">{todayCount}</span>
                  <span className="pill-label">Dziś</span>
                </button>
                <button 
                  className={`urgency-pill warning ${urgencyFilter === '3days' ? 'active' : ''} ${threeDaysCount > 0 ? 'has-items' : ''}`}
                  onClick={() => setUrgencyFilter(urgencyFilter === '3days' ? 'all' : '3days')}
                >
                  <span className="pill-count">{threeDaysCount}</span>
                  <span className="pill-label">1-3 dni</span>
                </button>
                <button 
                  className={`urgency-pill ok ${urgencyFilter === 'week' ? 'active' : ''} ${weekCount > 0 ? 'has-items' : ''}`}
                  onClick={() => setUrgencyFilter(urgencyFilter === 'week' ? 'all' : 'week')}
                >
                  <span className="pill-count">{weekCount}</span>
                  <span className="pill-label">4-7 dni</span>
                </button>
                <button 
                  className={`urgency-pill later ${urgencyFilter === 'later' ? 'active' : ''} ${laterCount > 0 ? 'has-items' : ''}`}
                  onClick={() => setUrgencyFilter(urgencyFilter === 'later' ? 'all' : 'later')}
                >
                  <span className="pill-count">{laterCount}</span>
                  <span className="pill-label">8+ dni</span>
                </button>
              </div>
            );
          })()}
        </div>

        <div className="filters filters-section">
          <div className="filter-buttons filter-status">
            <button onClick={() => setFilter('all')} className={`status-filter-btn ${filter === 'all' ? 'active' : ''}`}>
              <span className="sf-icon">📋</span>
              <span className="sf-count">{visibleOrders.length}</span>
              <span className="sf-label">Wszystkie</span>
            </button>
            {STATUSES.map(s => {
              // Licz zamówienia które mają ten status (główny LUB w produktach)
              const count = visibleOrders.filter(o => {
                // Sprawdź główny status
                if (o.status === s.id) return true;
                // Sprawdź statusy produktów
                if (o.produkty && o.produkty.some(p => p.status === s.id)) return true;
                return false;
              }).length;
              
              return (
                <button
                  key={s.id}
                  onClick={() => setFilter(s.id)}
                  className={`status-filter-btn ${filter === s.id ? 'active' : ''}`}
                  style={{ background: filter === s.id ? s.color : s.bgColor, color: filter === s.id ? 'white' : s.color }}
                >
                  <span className="sf-icon">{s.icon}</span>
                  <span className="sf-count">{count}</span>
                  <span className="sf-label">{s.name}</span>
                </button>
              );
            })}
          </div>

          <div className="extra-filters">
            {/* Sortowanie po dacie - tylko dla admina/pracownika */}
            {!isContractor && (
              <div className="filter-group filter-sort">
                <label>📅 Sortuj:</label>
                <select value={dateSort} onChange={e => setDateSort(e.target.value)}>
                  <option value="newest">Najnowsze</option>
                  <option value="oldest">Najstarsze</option>
                </select>
              </div>
            )}

            <div className="filter-group filter-country">
              <label>🌍 Kraj:</label>
              <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
                <option value="all">Wszystkie kraje</option>
                {orderCountries.map(code => {
                  const c = getCountry(code);
                  return <option key={code} value={code}>{c?.flag} {c?.name}</option>;
                })}
              </select>
            </div>

            {creators.length > 1 && (
              <div className="filter-group filter-creator">
                <label>👤 Twórca:</label>
                <select value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
                  <option value="all">Wszyscy</option>
                  {creators.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {drivers.length > 0 && !isContractor && (
              <div className="filter-group filter-driver">
                <label>🚚 Kierowca:</label>
                <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}>
                  <option value="all">Wszyscy</option>
                  <option value="unassigned">Nieprzypisani</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}

            {Object.keys(producers).length > 0 && !isContractor && (
              <div className="filter-group filter-producer">
                <label>🏭 Producent:</label>
                <select value={producerFilter} onChange={e => setProducerFilter(e.target.value)}>
                  <option value="all">Wszyscy</option>
                  <option value="unassigned">Nieprzypisani</option>
                  {Object.values(producers).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* Przycisk zbiorczego emaila - tylko dla admina/pracownika */}
            {!isContractor && producerFilter !== 'all' && producerFilter !== 'unassigned' && filteredOrders.length > 0 && (
              <button className="btn-bulk-email" onClick={() => setShowBulkEmailModal(true)}>
                📧 Zbiorczy email ({filteredOrders.length})
              </button>
            )}
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{filteredOrders.length}</div>
            <div className="stat-label">Zamówień</div>
          </div>
          <div className="stat-card">
            <div className="stat-value warning">
              {filteredOrders.filter(o => {
                const d = getDaysUntilPickup(o.dataOdbioru);
                return d !== null && d <= 3 && o.status !== 'dostarczone';
              }).length}
            </div>
            <div className="stat-label">Pilnych (≤3 dni)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value success">{filteredOrders.filter(o => o.status === 'dostarczone').length}</div>
            <div className="stat-label">Dostarczonych</div>
          </div>
          <div className="stat-card">
            <div className="stat-value danger">{filteredOrders.filter(o => o.platnosci?.doZaplaty > 0).length}</div>
            <div className="stat-label">Do zapłaty</div>
            {Object.keys(paymentSums).length > 0 && (
              <div className="stat-breakdown">
                {Object.entries(paymentSums).map(([cur, amt]) => (
                  <div key={cur}>{formatCurrency(amt, cur)}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="orders-grid">
          {filteredOrders.map(o => (
            <OrderCard
              key={o.id}
              order={o}
              onEdit={x => { setEditingOrder(x); setShowOrderModal(true); }}
              onStatusChange={handleStatusChange}
              onProductStatusChange={handleProductStatusChange}
              onEmailClick={(x, p) => setEmailModal({ order: x, producer: p })}
              onClick={(x, productIdx) => setViewingOrder({ order: x, productIndex: productIdx })}
              onDelete={handleDeleteOrder}
              producers={producers}
              drivers={drivers}
              isAdmin={isAdmin}
              isContractor={isContractor}
              exchangeRates={exchangeRates}
              currentUser={user}
            />
          ))}
        </div>

        {filteredOrders.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>Brak zamówień</p>
          </div>
        )}
      </main>

      {showOrderModal && (
        <OrderModal
          order={editingOrder}
          onSave={handleSaveOrder}
          onClose={() => { setShowOrderModal(false); setEditingOrder(null); }}
          producers={producers}
          drivers={drivers}
          currentUser={user}
          orders={orders}
          isContractor={isContractor}
          isAdmin={isAdmin}
          exchangeRates={exchangeRates}
          priceLists={priceLists}
        />
      )}

      {showUsersModal && (
        <UsersModal
          users={users}
          onSave={handleSaveUsers}
          onClose={() => setShowUsersModal(false)}
          isAdmin={isAdmin}
          onEditContractor={(contractor) => {
            setEditingContractor(contractor);
            setShowUsersModal(false);
          }}
        />
      )}

      {showProducersModal && (
        <ProducersModal
          producers={producers}
          onSave={handleSaveProducers}
          onClose={() => setShowProducersModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal 
          onClose={() => setShowSettingsModal(false)} 
          currentUser={user}
          onNotificationReceived={addNotif}
        />
      )}

      {/* Panel rozliczeń transportowych */}
      {showSettlementsPanel && (
        <SettlementsPanel
          settlements={settlements}
          orders={orders}
          users={users}
          currentUser={user}
          onAddSettlement={addSettlement}
          onUpdateSettlement={updateSettlement}
          onDeleteSettlement={deleteSettlement}
          onUpdateOrder={updateOrder}
          onClose={() => setShowSettlementsPanel(false)}
          isDriverView={false}
        />
      )}

      {/* Menedżer cenników */}
      {showPriceListManager && (
        <PriceListManager
          producers={producers}
          priceLists={priceLists}
          onSave={async (priceList) => {
            await addPriceList(priceList);
          }}
          onDelete={async (id) => {
            await deletePriceList(id);
          }}
          onClose={() => setShowPriceListManager(false)}
        />
      )}

      {/* Wyszukiwarka produktów z cennika */}
      {showProductSearch && (
        <ProductSearchModal
          priceLists={priceLists}
          producers={producers}
          onSelect={(product) => {
            // Callback do użycia w formularzu zamówienia
            if (showProductSearch.onSelect) {
              showProductSearch.onSelect(product);
            }
            setShowProductSearch(false);
          }}
          onClose={() => setShowProductSearch(false)}
        />
      )}

      {/* Modal szczegółów wyjazdów kierowcy */}
      {showDriverTripsDetail && (
        <div className="modal-overlay">
          <div className="modal-content modal-medium driver-trips-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🚚 Wyjazdy: {showDriverTripsDetail.name}</h2>
              <button className="btn-close" onClick={() => setShowDriverTripsDetail(null)}>×</button>
            </div>
            <div className="modal-body">
              {showDriverTripsDetail.futureTrips?.length === 0 ? (
                <div className="empty-trips">
                  <p>Brak zaplanowanych wyjazdów</p>
                </div>
              ) : (
                <div className="trips-detail-list">
                  {showDriverTripsDetail.futureTrips?.map((trip, idx) => {
                    const depDate = new Date(trip.departureDate || trip.date);
                    const todayDate = new Date();
                    todayDate.setHours(0,0,0,0);
                    const isToday = depDate.toDateString() === todayDate.toDateString();
                    const tomorrow = new Date(todayDate);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const isTomorrow = depDate.toDateString() === tomorrow.toDateString();
                    
                    return (
                      <div key={idx} className={`trip-detail-card ${isToday ? 'today' : ''} ${isTomorrow ? 'tomorrow' : ''}`}>
                        <div className="trip-detail-header">
                          <span className="trip-number">Wyjazd #{idx + 1}</span>
                          {isToday && <span className="trip-badge today">🔴 DZIŚ</span>}
                          {isTomorrow && <span className="trip-badge tomorrow">🟡 JUTRO</span>}
                        </div>
                        <div className="trip-detail-content">
                          <div className="detail-row">
                            <span className="detail-label">📦 Odbiory:</span>
                            <span className="detail-value">
                              {formatDate(trip.pickupFrom || trip.date)}
                              {trip.pickupTo && trip.pickupTo !== trip.pickupFrom && (
                                <> — {formatDate(trip.pickupTo)}</>
                              )}
                            </span>
                          </div>
                          <div className="detail-row highlight">
                            <span className="detail-label">🚗 Wyjazd:</span>
                            <span className="detail-value">{formatDate(trip.departureDate || trip.date)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">📍 Kierunek:</span>
                            <span className="detail-value">{trip.destination || 'Nieokreślony'}</span>
                          </div>
                          {trip.note && (
                            <div className="detail-row note-row">
                              <span className="detail-label">📝 Uwagi:</span>
                              <span className="detail-value note">{trip.note}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDriverTripsDetail(null)}>Zamknij</button>
            </div>
          </div>
        </div>
      )}

      {showCompanyModal && (
        <CompanyDataModal
          user={user}
          onSave={async (updatedUser) => { 
            await updateUser(user.id, updatedUser);
            // Aktualizuj lokalny state i localStorage
            setUser(updatedUser);
            localStorage.setItem('herratonUser', JSON.stringify(updatedUser));
          }}
          onClose={() => setShowCompanyModal(false)}
        />
      )}

      {/* Modal edycji danych firmy kontrahenta przez admina */}
      {editingContractor && (
        <CompanyDataModal
          user={editingContractor}
          onSave={async (updatedContractor) => { 
            await updateUser(editingContractor.id, updatedContractor);
          }}
          onClose={() => setEditingContractor(null)}
        />
      )}

      {emailModal && (
        <EmailModal
          order={emailModal.order}
          producer={emailModal.producer}
          onClose={() => setEmailModal(null)}
        />
      )}

      {showBulkEmailModal && producerFilter !== 'all' && producerFilter !== 'unassigned' && (
        <BulkEmailModal
          orders={filteredOrders}
          producer={producers[producerFilter]}
          onClose={() => setShowBulkEmailModal(false)}
        />
      )}

      {viewingOrder && (() => {
        // Pobierz aktualne zamówienie z orders (może być zaktualizowane przez Firebase)
        const orderId = viewingOrder.order?.id || viewingOrder.id || viewingOrder;
        const currentOrder = orders.find(o => o.id === orderId) || viewingOrder.order || viewingOrder;
        
        return (
          <OrderDetailModal
            order={currentOrder}
            selectedProductIndex={viewingOrder.productIndex}
            onClose={() => setViewingOrder(null)}
            producers={producers}
            drivers={drivers}
            onDelete={handleDeleteOrder}
            isContractor={isContractor}
            onUpdateOrder={updateOrder}
          />
        );
      })()}

      {/* PANEL CZATÓW KLIENTÓW */}
      {showClientChats && (
        <ClientChatsPanel
          chats={clientChats}
          selectedChat={selectedClientChat}
          onSelectChat={setSelectedClientChat}
          onClose={() => { setShowClientChats(false); setSelectedClientChat(null); }}
          currentUser={user}
        />
      )}

      {showComplaintsPanel && (
        <ComplaintsPanel
          complaints={visibleComplaints}
          orders={visibleOrders}
          onSave={handleSaveComplaint}
          onDelete={handleDeleteComplaint}
          onClose={() => setShowComplaintsPanel(false)}
          currentUser={user}
          onAddNotification={addNotif}
          producers={producers}
        />
      )}

      {showStatistics && isContractor && (
        <ContractorStatisticsPanel
          orders={visibleOrders}
          exchangeRates={exchangeRates}
          onClose={() => setShowStatistics(false)}
          user={user}
        />
      )}

      {showStatistics && !isContractor && (
        <StatisticsPanel
          orders={orders}
          exchangeRates={exchangeRates}
          onClose={() => setShowStatistics(false)}
          users={users}
        />
      )}

      {showLeadsPanel && (
        <LeadsPanel
          leads={leads}
          onSave={handleSaveLead}
          onDelete={handleDeleteLead}
          onClose={() => setShowLeadsPanel(false)}
          currentUser={user}
          onConvertToOrder={handleConvertLeadToOrder}
          users={users}
          orders={orders}
          onViewOrder={(order) => { setShowLeadsPanel(false); setViewingOrder(order); }}
        />
      )}

      {showTrashPanel && (
        <TrashPanel
          orders={trashedOrders}
          onRestore={handleRestoreOrder}
          onPermanentDelete={handlePermanentDelete}
          onClose={() => setShowTrashPanel(false)}
          isAdmin={isAdmin}
          currentUser={user}
        />
      )}

      {showContactsPanel && (
        <ContactsPanel
          orders={orders}
          onClose={() => setShowContactsPanel(false)}
          isContractor={isContractor}
          currentUser={user}
          onCreateOrder={(contactData) => {
            setEditingOrder(contactData);
            setShowOrderModal(true);
          }}
        />
      )}

      {/* Panel Próbek */}
      {showSamplesPanel && (
        <SamplesPanel
          samples={samples}
          onSave={async (sample) => {
            // Sprawdź czy to edycja czy nowy
            const existingSample = samples.find(s => s.id === sample.id);
            if (existingSample) {
              await updateSample(sample.id, sample);
            } else {
              await addSample(sample);
            }
          }}
          onDelete={async (id) => await deleteSample(id)}
          onClose={() => setShowSamplesPanel(false)}
          currentUser={user}
        />
      )}

      {/* Panel Poczty */}
      {showMailPanel && (
        <MailPanel
          mailItems={mailItems}
          onSave={async (mail) => {
            // Sprawdź czy to edycja czy nowy
            const existingMail = mailItems.find(m => m.id === mail.id);
            if (existingMail) {
              await updateMailItem(mail.id, mail);
            } else {
              await addMailItem(mail);
            }
          }}
          onDelete={async (id) => await deleteMailItem(id)}
          onClose={() => setShowMailPanel(false)}
          currentUser={user}
        />
      )}

      {/* POPUP POWIADOMIEŃ - nie dla kontrahenta */}
      {popupNotification && !isContractor && (
        <div className="notification-popup" onClick={() => setPopupNotification(null)}>
          <div className="popup-icon">{popupNotification.icon || '🔔'}</div>
          <div className="popup-content">
            <div className="popup-title">{popupNotification.title}</div>
            <div className="popup-message">{popupNotification.message}</div>
          </div>
          <button className="popup-close" onClick={() => setPopupNotification(null)}>×</button>
        </div>
      )}

      {/* MESSENGER */}
      <Messenger
        currentUser={user}
        users={users}
        messages={messages}
        orders={orders}
        onSendMessage={handleSendMessage}
        onMarkAsRead={handleMarkMessageAsRead}
        isOpen={showMessenger}
        onClose={(open) => setShowMessenger(open)}
        selectedChat={selectedChat}
        setSelectedChat={setSelectedChat}
        onViewOrder={(order) => {
          setShowMessenger(false);
          setViewingOrder(order);
        }}
      />

      {/* POPUP NOWEJ WIADOMOŚCI */}
      {newMessagePopup && !showMessenger && (
        <div className="message-popup" onClick={() => { setNewMessagePopup(null); setShowMessenger(true); }}>
          <div className="message-popup-icon">💬</div>
          <div className="message-popup-content">
            <div className="message-popup-sender">{newMessagePopup.senderName}</div>
            <div className="message-popup-text">{newMessagePopup.text}</div>
          </div>
        </div>
      )}

      {/* MODAL PYTANIA O POWIADOMIENIE KLIENTA O ZMIANIE STATUSU */}
      {statusChangeModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-small status-change-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header status-change-header">
              <h2>📧 Powiadomić klienta?</h2>
              <button className="btn-close" onClick={() => setStatusChangeModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="status-change-info">
                <p className="status-change-order">
                  <strong>Zamówienie:</strong> {statusChangeModal.order?.nrWlasny}
                </p>
                <p className="status-change-client">
                  <strong>Klient:</strong> {statusChangeModal.order?.klient?.imie}
                </p>
                <p className="status-change-email">
                  <strong>Email:</strong> {statusChangeModal.order?.klient?.email}
                </p>
                
                <div className="status-change-visual">
                  <div className="status-old">
                    <span className="status-label">Poprzedni status</span>
                    <span className="status-value">{statusChangeModal.oldStatus}</span>
                  </div>
                  <div className="status-arrow">→</div>
                  <div className="status-new">
                    <span className="status-label">Nowy status</span>
                    <span className="status-value">{statusChangeModal.newStatus}</span>
                  </div>
                </div>
                
                <p className="status-change-question">
                  Czy chcesz wysłać email do klienta z informacją o zmianie statusu zamówienia?
                </p>
              </div>
            </div>
            <div className="modal-footer status-change-footer">
              <button className="btn-secondary" onClick={() => setStatusChangeModal(null)}>
                ❌ Nie, dziękuję
              </button>
              <button className="btn-primary" onClick={() => sendStatusChangeEmail(statusChangeModal)}>
                ✅ Tak, wyślij email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY WYBIERANIA I RYSOWANIA */}
      {isSelectingElement && (
        <TutorialSelectorOverlay
          onSelect={(selectorData) => {
            setIsSelectingElement(false);
            setShowTutorialConfig(true);
            if (editingTutorialStep) {
              setEditingTutorialStep({ ...editingTutorialStep, selector: selectorData });
            } else {
              setEditingTutorialStep({ selector: selectorData, title: '', content: '', role: 'all', category: '' });
            }
          }}
          onCancel={() => {
            setIsSelectingElement(false);
            setShowTutorialConfig(true);
          }}
        />
      )}

      {/* PANEL KONFIGURACJI SAMOUCZKA */}
      {showTutorialConfig && !isSelectingElement && (
        <TutorialConfigPanel
          steps={tutorialSteps}
          categories={tutorialCategories}
          onSave={saveTutorialStep}
          onDelete={deleteTutorialStep}
          onReorder={reorderTutorialSteps}
          onSaveCategory={saveTutorialCategory}
          onDeleteCategory={deleteTutorialCategory}
          onClose={() => setShowTutorialConfig(false)}
          onStartSelecting={() => {
            setShowTutorialConfig(false);
            setTimeout(() => setIsSelectingElement(true), 100);
          }}
          editingStep={editingTutorialStep}
          setEditingStep={setEditingTutorialStep}
        />
      )}

      {/* WYBÓR KATEGORII SAMOUCZKA */}
      {showTutorial && !selectedTutorialCategory && tutorialCategories.length > 0 && (
        <TutorialCategorySelector
          categories={tutorialCategories}
          steps={tutorialSteps}
          onSelect={(catId) => {
            setSelectedTutorialCategory(catId);
            setTutorialStep(0);
          }}
          onSkip={() => {
            localStorage.setItem(`herratonTutorialSeen_${user?.id}`, 'true');
            setShowTutorial(false);
          }}
        />
      )}

      {/* MODAL EDYCJI SPOTKAŃ */}
      {showMeetingModal && (
        <MeetingModal
          meeting={editingMeeting}
          meetings={meetings}
          onSave={saveMeeting}
          onDelete={deleteMeeting}
          onClose={() => { setShowMeetingModal(false); setEditingMeeting(null); }}
        />
      )}

      {/* SAMOUCZEK / TUTORIAL */}
      {showTutorial && (selectedTutorialCategory || tutorialCategories.length === 0) && tutorialSteps.length > 0 && (
        <TutorialOverlay
          steps={tutorialSteps}
          category={selectedTutorialCategory}
          currentStep={tutorialStep}
          userRole={user?.role}
          onNext={() => setTutorialStep(prev => prev + 1)}
          onPrev={() => setTutorialStep(prev => Math.max(0, prev - 1))}
          onSkip={() => {
            localStorage.setItem(`herratonTutorialSeen_${user?.id}`, 'true');
            setShowTutorial(false);
            setTutorialStep(0);
            setSelectedTutorialCategory(null);
          }}
          onFinish={() => {
            localStorage.setItem(`herratonTutorialSeen_${user?.id}`, 'true');
            setShowTutorial(false);
            setTutorialStep(0);
            setSelectedTutorialCategory(null);
          }}
          onBackToCategories={() => {
            setSelectedTutorialCategory(null);
            setTutorialStep(0);
          }}
        />
      )}
    </div>
  );
};

// ============================================
// PANEL CZATÓW KLIENTÓW DLA PRACOWNIKÓW
// ============================================

const ClientChatsPanel = ({ chats, selectedChat, onSelectChat, onClose, currentUser }) => {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showVisualization, setShowVisualization] = useState(false);
  const [vizWidth, setVizWidth] = useState('');
  const [vizDepth, setVizDepth] = useState('');
  const [vizSide, setVizSide] = useState('left');

  // Przejmij czat
  const takeChat = async (chatId) => {
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      await updateDoc(doc(db, 'chats', chatId), {
        assignedTo: currentUser.id,
        assignedToName: currentUser.name || currentUser.email,
        status: 'active'
      });
      
      onSelectChat(chatId);
    } catch (err) {
      console.error('Błąd przejmowania czatu:', err);
    }
  };

  // Wyślij wiadomość
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    setSending(true);
    try {
      const { doc, updateDoc, arrayUnion, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase');

      const message = {
        id: Date.now().toString(),
        type: 'staff',
        text: newMessage.trim(),
        timestamp: new Date().toISOString(),
        senderName: currentUser.name || currentUser.email,
        senderId: currentUser.id
      };

      await updateDoc(doc(db, 'chats', selectedChat), {
        messages: arrayUnion(message),
        lastMessageAt: serverTimestamp(),
        unreadByClient: true,
        unreadByStaff: false
      });

      setNewMessage('');
    } catch (err) {
      console.error('Błąd wysyłania:', err);
    } finally {
      setSending(false);
    }
  };

  // Wyślij wizualizację
  const sendVisualization = async () => {
    if (!vizWidth || !vizDepth || !selectedChat) return;

    try {
      const { doc, updateDoc, arrayUnion, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase');

      const message = {
        id: Date.now().toString(),
        type: 'visualization',
        width: vizWidth,
        depth: vizDepth,
        side: vizSide,
        timestamp: new Date().toISOString(),
        senderName: currentUser.name || currentUser.email
      };

      await updateDoc(doc(db, 'chats', selectedChat), {
        messages: arrayUnion(message),
        lastMessageAt: serverTimestamp(),
        unreadByClient: true
      });

      setShowVisualization(false);
      setVizWidth('');
      setVizDepth('');
    } catch (err) {
      console.error('Błąd wysyłania wizualizacji:', err);
    }
  };

  // Zamknij czat
  const closeChat = async (chatId) => {
    if (!window.confirm('Zamknąć ten czat?')) return;
    
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase');
      
      await updateDoc(doc(db, 'chats', chatId), {
        status: 'closed'
      });
    } catch (err) {
      console.error('Błąd zamykania czatu:', err);
    }
  };

  const currentChat = chats.find(c => c.id === selectedChat);
  const waitingChats = chats.filter(c => c.status === 'waiting');
  const activeChats = chats.filter(c => c.status === 'active' && c.assignedTo === currentUser.id);
  const unreadCount = chats.filter(c => c.unreadByStaff && (c.assignedTo === currentUser.id || !c.assignedTo)).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{width:'95%',maxWidth:'1200px',height:'85vh',display:'flex',flexDirection:'column',padding:0}}>
        {/* Header */}
        <div style={{padding:'16px 20px',borderBottom:'1px solid #E2E8F0',background:'linear-gradient(135deg,#1E293B,#334155)',color:'white',borderRadius:'12px 12px 0 0'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <h2 style={{margin:0,fontSize:'18px',display:'flex',alignItems:'center',gap:'10px'}}>
              💬 Czaty z klientami
              {unreadCount > 0 && (
                <span style={{background:'#EF4444',padding:'2px 8px',borderRadius:'10px',fontSize:'12px'}}>{unreadCount} nowych</span>
              )}
            </h2>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.1)',border:'none',color:'white',width:'32px',height:'32px',borderRadius:'8px',cursor:'pointer',fontSize:'18px'}}>×</button>
          </div>
        </div>

        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          {/* Lista czatów */}
          <div style={{width:'300px',borderRight:'1px solid #E2E8F0',overflow:'auto',background:'#F8FAFC'}}>
            {/* Oczekujące */}
            {waitingChats.length > 0 && (
              <div>
                <div style={{padding:'12px 16px',background:'#FEF3C7',fontWeight:'600',fontSize:'12px',color:'#92400E'}}>
                  ⏳ Oczekujące ({waitingChats.length})
                </div>
                {waitingChats.map(chat => (
                  <div
                    key={chat.id}
                    onClick={() => takeChat(chat.id)}
                    style={{
                      padding:'12px 16px',
                      borderBottom:'1px solid #E2E8F0',
                      cursor:'pointer',
                      background: chat.id === selectedChat ? '#EDE9FE' : 'white'
                    }}
                  >
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontWeight:'600',fontSize:'14px'}}>{chat.clientName}</div>
                      <span style={{fontSize:'10px',background:'#F59E0B',color:'white',padding:'2px 6px',borderRadius:'4px'}}>NOWY</span>
                    </div>
                    <div style={{fontSize:'12px',color:'#64748B',marginTop:'4px'}}>{chat.categoryName}</div>
                    <div style={{fontSize:'11px',color:'#94A3B8',marginTop:'2px'}}>
                      {chat.clientCountry} • {chat.lastMessageAt?.toDate ? chat.lastMessageAt.toDate().toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}) : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Aktywne */}
            {activeChats.length > 0 && (
              <div>
                <div style={{padding:'12px 16px',background:'#D1FAE5',fontWeight:'600',fontSize:'12px',color:'#065F46'}}>
                  💬 Twoje czaty ({activeChats.length})
                </div>
                {activeChats.map(chat => (
                  <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    style={{
                      padding:'12px 16px',
                      borderBottom:'1px solid #E2E8F0',
                      cursor:'pointer',
                      background: chat.id === selectedChat ? '#EDE9FE' : 'white'
                    }}
                  >
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontWeight:'600',fontSize:'14px'}}>{chat.clientName}</div>
                      {chat.unreadByStaff && (
                        <span style={{width:'8px',height:'8px',background:'#8B5CF6',borderRadius:'50%'}}></span>
                      )}
                    </div>
                    <div style={{fontSize:'12px',color:'#64748B',marginTop:'4px'}}>{chat.categoryName}</div>
                  </div>
                ))}
              </div>
            )}

            {waitingChats.length === 0 && activeChats.length === 0 && (
              <div style={{padding:'40px 20px',textAlign:'center',color:'#94A3B8'}}>
                <div style={{fontSize:'48px',marginBottom:'12px'}}>💬</div>
                <div>Brak aktywnych czatów</div>
              </div>
            )}
          </div>

          {/* Okno czatu */}
          <div style={{flex:1,display:'flex',flexDirection:'column',background:'#F1F5F9'}}>
            {currentChat ? (
              <>
                {/* Header czatu */}
                <div style={{padding:'12px 16px',background:'white',borderBottom:'1px solid #E2E8F0'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:'600',fontSize:'15px'}}>{currentChat.clientName}</div>
                      <div style={{fontSize:'12px',color:'#64748B'}}>
                        {currentChat.categoryName} • {currentChat.clientEmail || currentChat.clientPhone || 'Brak kontaktu'}
                      </div>
                      {currentChat.customDimensions && (
                        <div style={{fontSize:'11px',color:'#8B5CF6',marginTop:'4px'}}>
                          📐 Wymiary: {currentChat.customDimensions.width}x{currentChat.customDimensions.depth} cm ({currentChat.customDimensions.side === 'left' ? 'lewy' : 'prawy'})
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => closeChat(currentChat.id)}
                      style={{padding:'6px 12px',borderRadius:'6px',border:'none',background:'#FEE2E2',color:'#DC2626',fontSize:'12px',cursor:'pointer'}}
                    >
                      Zamknij czat
                    </button>
                  </div>
                </div>

                {/* Wiadomości */}
                <div style={{flex:1,overflow:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
                  {(currentChat.messages || []).map((msg, idx) => (
                    <div key={msg.id || idx} style={{
                      display:'flex',
                      justifyContent: msg.type === 'staff' ? 'flex-end' : msg.type === 'system' ? 'center' : 'flex-start'
                    }}>
                      {msg.type === 'system' ? (
                        <div style={{background:'#E2E8F0',padding:'8px 14px',borderRadius:'16px',fontSize:'12px',color:'#64748B'}}>
                          {msg.text}
                        </div>
                      ) : msg.type === 'visualization' ? (
                        <div style={{background:'white',padding:'12px',borderRadius:'12px',boxShadow:'0 2px 8px rgba(0,0,0,0.1)',maxWidth:'280px'}}>
                          <div style={{fontSize:'11px',color:'#8B5CF6',fontWeight:'600',marginBottom:'8px'}}>📐 Wizualizacja</div>
                          <div style={{background:'#F8FAFC',borderRadius:'8px',padding:'12px',textAlign:'center'}}>
                            <svg width="200" height="150" viewBox="0 0 200 150">
                              {msg.side === 'left' ? (
                                <path d="M 20 20 L 180 20 L 180 60 L 80 60 L 80 130 L 20 130 Z" fill="#8B5CF6" stroke="#6D28D9" strokeWidth="2"/>
                              ) : (
                                <path d="M 20 20 L 180 20 L 180 130 L 120 130 L 120 60 L 20 60 Z" fill="#8B5CF6" stroke="#6D28D9" strokeWidth="2"/>
                              )}
                              <text x="100" y="12" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="600">{msg.width} cm</text>
                              <text x="10" y="75" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="600" transform="rotate(-90, 10, 75)">{msg.depth} cm</text>
                            </svg>
                          </div>
                          <div style={{fontSize:'10px',color:'#64748B',marginTop:'6px',textAlign:'center'}}>
                            {msg.width}x{msg.depth} cm • {msg.side === 'left' ? 'Lewy' : 'Prawy'}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          background: msg.type === 'staff' ? 'linear-gradient(135deg,#8B5CF6,#6D28D9)' : 'white',
                          color: msg.type === 'staff' ? 'white' : '#1E293B',
                          padding:'10px 14px',
                          borderRadius: msg.type === 'staff' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          maxWidth:'70%',
                          boxShadow:'0 2px 6px rgba(0,0,0,0.1)'
                        }}>
                          {msg.type === 'client' && (
                            <div style={{fontSize:'10px',color:'#8B5CF6',fontWeight:'600',marginBottom:'4px'}}>{msg.senderName}</div>
                          )}
                          {msg.photo && (
                            <img src={msg.photo} alt="" style={{maxWidth:'100%',maxHeight:'200px',borderRadius:'8px',marginBottom: msg.text ? '8px' : 0}} />
                          )}
                          {msg.text && <div style={{fontSize:'13px',lineHeight:'1.4'}}>{msg.text}</div>}
                          <div style={{fontSize:'10px',opacity:0.7,marginTop:'4px',textAlign:'right'}}>
                            {new Date(msg.timestamp).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Modal wizualizacji */}
                {showVisualization && (
                  <div style={{padding:'16px',background:'#F5F3FF',borderTop:'1px solid #C4B5FD'}}>
                    <div style={{display:'flex',gap:'12px',alignItems:'flex-end'}}>
                      <div style={{flex:1}}>
                        <label style={{display:'block',fontSize:'11px',color:'#6B7280',marginBottom:'4px'}}>Szerokość (cm)</label>
                        <input
                          type="number"
                          value={vizWidth}
                          onChange={(e) => setVizWidth(e.target.value)}
                          placeholder="250"
                          style={{width:'100%',padding:'8px',borderRadius:'6px',border:'1px solid #C4B5FD',fontSize:'13px',boxSizing:'border-box'}}
                        />
                      </div>
                      <div style={{flex:1}}>
                        <label style={{display:'block',fontSize:'11px',color:'#6B7280',marginBottom:'4px'}}>Głębokość (cm)</label>
                        <input
                          type="number"
                          value={vizDepth}
                          onChange={(e) => setVizDepth(e.target.value)}
                          placeholder="150"
                          style={{width:'100%',padding:'8px',borderRadius:'6px',border:'1px solid #C4B5FD',fontSize:'13px',boxSizing:'border-box'}}
                        />
                      </div>
                      <div style={{flex:1}}>
                        <label style={{display:'block',fontSize:'11px',color:'#6B7280',marginBottom:'4px'}}>Strona</label>
                        <select
                          value={vizSide}
                          onChange={(e) => setVizSide(e.target.value)}
                          style={{width:'100%',padding:'8px',borderRadius:'6px',border:'1px solid #C4B5FD',fontSize:'13px'}}
                        >
                          <option value="left">⬅️ Lewy</option>
                          <option value="right">➡️ Prawy</option>
                        </select>
                      </div>
                      <button
                        onClick={sendVisualization}
                        style={{padding:'8px 16px',borderRadius:'6px',border:'none',background:'#8B5CF6',color:'white',fontWeight:'600',fontSize:'13px',cursor:'pointer'}}
                      >
                        Wyślij
                      </button>
                      <button
                        onClick={() => setShowVisualization(false)}
                        style={{padding:'8px 12px',borderRadius:'6px',border:'1px solid #C4B5FD',background:'white',color:'#6B7280',cursor:'pointer'}}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Input */}
                <div style={{padding:'12px 16px',background:'white',borderTop:'1px solid #E2E8F0'}}>
                  <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                    <button
                      onClick={() => setShowVisualization(!showVisualization)}
                      title="Wyślij wizualizację narożnika"
                      style={{
                        width:'40px',
                        height:'40px',
                        borderRadius:'8px',
                        border:'1px solid #E2E8F0',
                        background: showVisualization ? '#F5F3FF' : 'white',
                        cursor:'pointer',
                        fontSize:'16px'
                      }}
                    >
                      📐
                    </button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Napisz wiadomość..."
                      style={{flex:1,padding:'10px 14px',borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:'14px'}}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sending || !newMessage.trim()}
                      style={{
                        padding:'10px 20px',
                        borderRadius:'8px',
                        border:'none',
                        background: newMessage.trim() ? 'linear-gradient(135deg,#8B5CF6,#6D28D9)' : '#E2E8F0',
                        color:'white',
                        fontWeight:'600',
                        cursor: newMessage.trim() ? 'pointer' : 'default'
                      }}
                    >
                      Wyślij
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8'}}>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:'64px',marginBottom:'16px'}}>💬</div>
                  <div style={{fontSize:'16px'}}>Wybierz czat z listy</div>
                  <div style={{fontSize:'13px',marginTop:'8px'}}>lub przejmij oczekujący</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MODAL EDYCJI SPOTKAŃ
// ============================================

const MeetingModal = ({ meeting, meetings, onSave, onDelete, onClose }) => {
  const [formData, setFormData] = useState({
    title: meeting?.title || '',
    dateTime: meeting?.dateTime || new Date().toISOString().slice(0, 16),
    note: meeting?.note || ''
  });

  const handleSave = async () => {
    if (!formData.dateTime) {
      alert('Wybierz datę i godzinę');
      return;
    }
    const success = await onSave(meeting?.id ? { ...formData, id: meeting.id } : formData);
    if (success) onClose();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Usunąć to spotkanie?')) {
      await onDelete(id);
    }
  };

  return (
    <>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:99998}} onClick={onClose}></div>
      <div style={{
        position:'fixed',
        top:'50%',
        left:'50%',
        transform:'translate(-50%,-50%)',
        background:'white',
        borderRadius:'16px',
        padding:'24px',
        width:'90%',
        maxWidth:'500px',
        maxHeight:'80vh',
        overflow:'auto',
        zIndex:99999,
        boxShadow:'0 25px 50px rgba(0,0,0,0.3)'
      }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
          <h2 style={{margin:0,fontSize:'18px',color:'#1E293B'}}>📅 Harmonogram spotkań</h2>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'24px',cursor:'pointer',color:'#94A3B8'}}>×</button>
        </div>

        {/* Formularz dodawania/edycji */}
        <div style={{background:'#F8FAFC',padding:'16px',borderRadius:'12px',marginBottom:'20px'}}>
          <h3 style={{margin:'0 0 12px',fontSize:'14px',color:'#64748B'}}>{meeting?.id ? '✏️ Edytuj spotkanie' : '➕ Nowe spotkanie'}</h3>
          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="Tytuł spotkania (opcjonalne)"
              style={{padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:'14px'}}
            />
            <input
              type="datetime-local"
              value={formData.dateTime}
              onChange={(e) => setFormData({...formData, dateTime: e.target.value})}
              style={{padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:'14px'}}
            />
            <textarea
              value={formData.note}
              onChange={(e) => setFormData({...formData, note: e.target.value})}
              placeholder="Notatka (opcjonalne)"
              rows={2}
              style={{padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:'14px',resize:'vertical'}}
            />
            <button
              onClick={handleSave}
              style={{padding:'10px',borderRadius:'8px',border:'none',background:'linear-gradient(135deg,#7C3AED,#5B21B6)',color:'white',fontWeight:'600',cursor:'pointer'}}
            >
              {meeting?.id ? '💾 Zapisz zmiany' : '➕ Dodaj spotkanie'}
            </button>
          </div>
        </div>

        {/* Lista spotkań */}
        <div>
          <h3 style={{margin:'0 0 12px',fontSize:'14px',color:'#64748B'}}>📋 Lista spotkań</h3>
          {meetings.length === 0 ? (
            <div style={{textAlign:'center',padding:'20px',color:'#94A3B8',background:'#F8FAFC',borderRadius:'8px'}}>
              Brak zaplanowanych spotkań
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'8px',maxHeight:'250px',overflowY:'auto'}}>
              {meetings.sort((a,b) => new Date(a.dateTime) - new Date(b.dateTime)).map(m => {
                const meetDate = new Date(m.dateTime);
                const now = new Date();
                const isPast = meetDate < now;
                
                return (
                  <div key={m.id} style={{
                    display:'flex',
                    alignItems:'center',
                    gap:'12px',
                    padding:'10px 12px',
                    background: isPast ? '#F1F5F9' : 'white',
                    border:'1px solid #E2E8F0',
                    borderRadius:'8px',
                    opacity: isPast ? 0.6 : 1
                  }}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:'600',fontSize:'13px',color:'#1E293B'}}>
                        {meetDate.toLocaleDateString('pl-PL', {weekday:'short', day:'numeric', month:'short', year:'numeric'})}
                        <span style={{marginLeft:'8px',color:'#7C3AED',fontWeight:'700'}}>
                          {meetDate.toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      {m.title && <div style={{fontSize:'12px',color:'#64748B'}}>{m.title}</div>}
                      {m.note && <div style={{fontSize:'11px',color:'#94A3B8',marginTop:'2px'}}>{m.note}</div>}
                    </div>
                    <button
                      onClick={() => { setFormData({ title: m.title || '', dateTime: m.dateTime, note: m.note || '' }); }}
                      style={{background:'#EFF6FF',border:'none',padding:'6px 10px',borderRadius:'6px',cursor:'pointer',fontSize:'12px'}}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      style={{background:'#FEE2E2',border:'none',padding:'6px 10px',borderRadius:'6px',cursor:'pointer',fontSize:'12px',color:'#DC2626'}}
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ============================================
// WYBÓR KATEGORII SAMOUCZKA
// ============================================

const TutorialCategorySelector = ({ categories, steps, onSelect, onSkip }) => {
  return (
    <div style={{position:'fixed',inset:0,zIndex:999999,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'white',borderRadius:'20px',padding:'30px',maxWidth:'600px',width:'90%',maxHeight:'80vh',overflow:'auto'}}>
        <div style={{textAlign:'center',marginBottom:'24px'}}>
          <div style={{fontSize:'48px',marginBottom:'12px'}}>🎓</div>
          <h2 style={{margin:'0 0 8px',fontSize:'24px',color:'#1E293B'}}>Samouczek systemu Herraton</h2>
          <p style={{margin:0,color:'#64748B'}}>Wybierz kategorię, którą chcesz poznać</p>
        </div>
        
        <div style={{display:'flex',flexDirection:'column',gap:'12px',marginBottom:'24px'}}>
          {categories.map(cat => {
            const stepCount = steps.filter(s => s.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => onSelect(cat.id)}
                style={{
                  padding:'16px 20px',
                  borderRadius:'12px',
                  border:'2px solid #E2E8F0',
                  background:'white',
                  cursor:'pointer',
                  textAlign:'left',
                  transition:'all 0.2s',
                  display:'flex',
                  alignItems:'center',
                  gap:'16px'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
              >
                <span style={{fontSize:'28px'}}>{cat.icon || '📚'}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:'600',fontSize:'16px',color:'#1E293B'}}>{cat.name}</div>
                  {cat.description && <div style={{fontSize:'13px',color:'#64748B',marginTop:'2px'}}>{cat.description}</div>}
                </div>
                <span style={{background:'#E2E8F0',padding:'4px 10px',borderRadius:'12px',fontSize:'12px',color:'#64748B'}}>
                  {stepCount} {stepCount === 1 ? 'krok' : 'kroków'}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{display:'flex',gap:'12px'}}>
          <button
            onClick={onSkip}
            style={{flex:1,padding:'14px',borderRadius:'10px',border:'1px solid #E2E8F0',background:'white',color:'#64748B',fontWeight:'600',cursor:'pointer'}}
          >
            Pomiń samouczek
          </button>
          <button
            onClick={() => onSelect(null)}
            style={{flex:1,padding:'14px',borderRadius:'10px',border:'none',background:'linear-gradient(135deg,#3B82F6,#2563EB)',color:'white',fontWeight:'600',cursor:'pointer'}}
          >
            Pokaż wszystko
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// OVERLAY WYBIERANIA I RYSOWANIA (z menu)
// ============================================

const TutorialSelectorOverlay = ({ onSelect, onCancel }) => {
  const [phase, setPhase] = useState('menu'); // 'menu' lub 'drawing'
  const [triggerSelector, setTriggerSelector] = useState(null);
  const [triggerLabel, setTriggerLabel] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [rect, setRect] = useState(null);
  const [arrowPosition, setArrowPosition] = useState('bottom');
  const [tooltipPosition, setTooltipPosition] = useState('bottom');
  const [showArrow, setShowArrow] = useState(true);

  // Lista wszystkich elementów do otwarcia
  const menuItems = [
    { category: '📋 Zamówienia', items: [
      { label: '➕ Nowe zamówienie', selector: '.btn-add-order', description: 'Formularz dodawania zamówienia' },
      { label: '📋 Lista zamówień', selector: '.orders-list', description: 'Tabela zamówień' },
      { label: '🔍 Filtr statusu', selector: '.status-filter', description: 'Filtrowanie po statusie' },
      { label: '📅 Filtr daty', selector: '.date-filter', description: 'Filtrowanie po dacie' },
    ]},
    { category: '⚙️ Ustawienia', items: [
      { label: '⚙️ Menu ustawień', selector: '.settings-btn', description: 'Otwiera menu ustawień' },
      { label: '👥 Użytkownicy', selector: '[data-action="users"]', description: 'Zarządzanie użytkownikami' },
      { label: '🏭 Producenci', selector: '[data-action="producers"]', description: 'Lista producentów' },
      { label: '🏢 Dane firmy', selector: '[data-action="company"]', description: 'Ustawienia firmy' },
      { label: '📊 Statystyki', selector: '[data-action="statistics"]', description: 'Panel statystyk' },
      { label: '🗑️ Kosz', selector: '[data-action="trash"]', description: 'Usunięte zamówienia' },
      { label: '🎓 Samouczek', selector: '[data-action="tutorial-config"]', description: 'Konfiguracja samouczka' },
    ]},
    { category: '📦 Wysyłka', items: [
      { label: '📦 Menu wysyłki', selector: '.shipping-btn', description: 'Otwiera menu wysyłki' },
      { label: '🚚 Wyjazdy', selector: '[data-action="trips"]', description: 'Zarządzanie wyjazdami' },
      { label: '💰 Stawki transportowe', selector: '[data-action="transport-rates"]', description: 'Cennik transportu' },
      { label: '📑 Rozliczenia', selector: '[data-action="settlements"]', description: 'Rozliczenia kierowców' },
    ]},
    { category: '📋 Reklamacje', items: [
      { label: '📋 Panel reklamacji', selector: '.complaint-btn, [data-action="complaints"]', description: 'Lista reklamacji' },
    ]},
    { category: '🎯 Leady', items: [
      { label: '🎯 Panel leadów', selector: '.leads-btn, [data-action="leads"]', description: 'Zarządzanie leadami' },
    ]},
    { category: '💬 Komunikacja', items: [
      { label: '💬 Messenger', selector: '.messenger-fab', description: 'Czat wewnętrzny' },
      { label: '🔔 Powiadomienia', selector: '.notification-btn', description: 'Panel powiadomień' },
      { label: '📧 Poczta', selector: '[data-action="mail"]', description: 'Skrzynka pocztowa' },
      { label: '📧 Email masowy', selector: '[data-action="bulk-email"]', description: 'Wysyłka masowa' },
    ]},
    { category: '📦 Produkty', items: [
      { label: '🔍 Wyszukiwarka produktów', selector: '[data-action="product-search"]', description: 'Szukaj w cennikach' },
      { label: '📋 Cenniki', selector: '[data-action="pricelists"]', description: 'Zarządzanie cennikami' },
    ]},
    { category: '👥 Kontakty', items: [
      { label: '👥 Panel kontaktów', selector: '[data-action="contacts"]', description: 'Lista kontaktów' },
      { label: '📦 Próbki', selector: '[data-action="samples"]', description: 'Zarządzanie próbkami' },
    ]},
    { category: '🖥️ Interfejs', items: [
      { label: '📊 Nagłówek', selector: '.header, .app-header', description: 'Górny pasek' },
      { label: '🔍 Wyszukiwarka', selector: '.search-input, .search-box', description: 'Pole wyszukiwania' },
      { label: '👤 Profil użytkownika', selector: '.user-info, .user-profile', description: 'Info o użytkowniku' },
    ]},
  ];

  // Blokuj scroll gdy jest zaznaczony prostokąt
  useEffect(() => {
    if (rect) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [rect]);

  // Blokuj scroll wheel gdy rysujemy lub mamy prostokąt
  useEffect(() => {
    const preventScroll = (e) => {
      if (phase === 'drawing' || rect) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
    };
  }, [phase, rect]);

  // Filtruj elementy
  const filteredItems = searchQuery 
    ? menuItems.map(cat => ({
        ...cat,
        items: cat.items.filter(item => 
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(cat => cat.items.length > 0)
    : menuItems;

  const selectTrigger = (item) => {
    setTriggerSelector(item.selector);
    setTriggerLabel(item.label);
    
    // Spróbuj kliknąć element
    setTimeout(() => {
      const selectors = item.selector.split(',').map(s => s.trim());
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          el.click();
          break;
        }
      }
      setTimeout(() => setPhase('drawing'), 300);
    }, 100);
  };

  const skipTrigger = () => {
    setTriggerSelector(null);
    setTriggerLabel(null);
    setPhase('drawing');
  };

  // Rysowanie prostokąta - pozycja względem VIEWPORT
  const handleMouseDown = (e) => {
    if (phase !== 'drawing') return;
    if (e.target.closest('.selector-ui')) return;
    setIsDrawing(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = (e) => {
    if (!isDrawing || !startPos) return;
    setIsDrawing(false);
    
    const x = Math.min(startPos.x, e.clientX);
    const y = Math.min(startPos.y, e.clientY);
    const width = Math.abs(e.clientX - startPos.x);
    const height = Math.abs(e.clientY - startPos.y);
    
    if (width > 20 && height > 20) {
      setRect({ x, y, width, height });
    }
  };

  const handleConfirm = () => {
    if (rect) {
      const position = {
        top: rect.y,
        left: rect.x,
        width: rect.width,
        height: rect.height,
        openMenu: triggerSelector,
        arrowPosition: showArrow ? arrowPosition : 'none',
        tooltipPosition: tooltipPosition
      };
      
      // Odblokuj scroll
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      
      if (triggerSelector) {
        const selectors = triggerSelector.split(',').map(s => s.trim());
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); break; }
        }
      }
      onSelect(JSON.stringify(position));
    }
  };

  const handleReset = () => {
    setRect(null);
    setStartPos(null);
    setCurrentPos(null);
    // Odblokuj scroll przy resecie
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  };

  const handleCancel = useCallback(() => {
    // Odblokuj scroll
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    
    if (triggerSelector) {
      const selectors = triggerSelector.split(',').map(s => s.trim());
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.click(); break; }
      }
    }
    onCancel();
  }, [triggerSelector, onCancel]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel]);

  const drawingRect = isDrawing && startPos && currentPos ? {
    x: Math.min(startPos.x, currentPos.x),
    y: Math.min(startPos.y, currentPos.y),
    width: Math.abs(currentPos.x - startPos.x),
    height: Math.abs(currentPos.y - startPos.y)
  } : null;

  const displayRect = rect || drawingRect;
  const showPanel = !isDrawing;

  return (
    <div 
      style={{position:'fixed',inset:0,zIndex:999999,cursor: phase === 'drawing' ? 'crosshair' : 'default'}}
      onMouseDown={phase === 'drawing' ? handleMouseDown : undefined}
      onMouseMove={phase === 'drawing' ? handleMouseMove : undefined}
      onMouseUp={phase === 'drawing' ? handleMouseUp : undefined}
    >
      {/* Tło */}
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',pointerEvents:'none'}}/>

      {/* Narysowany prostokąt */}
      {phase === 'drawing' && displayRect && (
        <div style={{
          position:'fixed',
          top: displayRect.y,
          left: displayRect.x,
          width: displayRect.width,
          height: displayRect.height,
          border:'3px solid #3B82F6',
          borderRadius:'8px',
          background:'rgba(59, 130, 246, 0.1)',
          boxShadow:'0 0 0 9999px rgba(0,0,0,0.5)',
          pointerEvents:'none'
        }} />
      )}
      
      {/* FAZA 1: Menu wyboru elementu */}
      {phase === 'menu' && (
        <div className="selector-ui" style={{
          position:'fixed',
          top:'50%',
          left:'50%',
          transform:'translate(-50%,-50%)',
          background:'white',
          borderRadius:'16px',
          boxShadow:'0 25px 50px rgba(0,0,0,0.3)',
          width:'90%',
          maxWidth:'700px',
          maxHeight:'80vh',
          display:'flex',
          flexDirection:'column',
          overflow:'hidden'
        }}>
          <div style={{padding:'20px',borderBottom:'1px solid #E2E8F0'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <h2 style={{margin:0,fontSize:'18px',color:'#1E293B'}}>🎯 Co ma się otworzyć?</h2>
              <button onClick={handleCancel} style={{background:'none',border:'none',fontSize:'24px',cursor:'pointer',color:'#94A3B8'}}>×</button>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Szukaj... (np. zamówienie, ustawienia, reklamacje)"
              style={{width:'100%',padding:'12px 16px',borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:'14px'}}
              autoFocus
            />
          </div>
          
          <div style={{flex:1,overflowY:'auto',padding:'12px 20px'}}>
            {filteredItems.map((cat, catIdx) => (
              <div key={catIdx} style={{marginBottom:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:'700',color:'#64748B',marginBottom:'8px',textTransform:'uppercase'}}>{cat.category}</div>
                <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  {cat.items.map((item, itemIdx) => (
                    <button
                      key={itemIdx}
                      onClick={() => selectTrigger(item)}
                      style={{
                        display:'flex',
                        alignItems:'center',
                        gap:'12px',
                        padding:'10px 14px',
                        borderRadius:'8px',
                        border:'1px solid #E2E8F0',
                        background:'white',
                        cursor:'pointer',
                        textAlign:'left',
                        transition:'all 0.15s'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#3B82F6'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                    >
                      <span style={{fontSize:'18px'}}>{item.label.split(' ')[0]}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:'600',fontSize:'14px',color:'#1E293B'}}>{item.label.split(' ').slice(1).join(' ')}</div>
                        <div style={{fontSize:'12px',color:'#64748B'}}>{item.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{padding:'16px 20px',borderTop:'1px solid #E2E8F0',background:'#F8FAFC'}}>
            <button
              onClick={skipTrigger}
              style={{width:'100%',padding:'12px',borderRadius:'8px',border:'2px dashed #94A3B8',background:'transparent',color:'#64748B',fontWeight:'600',cursor:'pointer'}}
            >
              ⏭️ Pomiń - nie muszę nic otwierać (zaznaczę element widoczny na ekranie)
            </button>
          </div>
        </div>
      )}

      {/* FAZA 2: Panel rysowania */}
      {phase === 'drawing' && showPanel && (
        <div className="selector-ui" style={{
          position:'fixed',
          top:'10px',
          left:'50%',
          transform:'translateX(-50%)',
          background:'linear-gradient(135deg, #1E3A5F, #2D5A87)',
          color:'white',
          padding:'14px 20px',
          borderRadius:'12px',
          boxShadow:'0 10px 40px rgba(0,0,0,0.4)',
          display:'flex',
          flexDirection:'column',
          gap:'10px',
          maxWidth:'95vw'
        }}>
          {triggerLabel && (
            <div style={{fontSize:'12px',opacity:0.8,borderBottom:'1px solid rgba(255,255,255,0.2)',paddingBottom:'8px'}}>
              📂 Otwarto: {triggerLabel}
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:'12px',fontSize:'14px',flexWrap:'wrap'}}>
            <span>🎯 {rect ? '✅ Zaznaczono! (strona zablokowana)' : 'Narysuj prostokąt myszką'}</span>
            {rect ? (
              <>
                <button onClick={(e) => { e.stopPropagation(); handleReset(); }} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'white',padding:'6px 12px',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'12px'}}>🔄 Ponownie</button>
                <button onClick={(e) => { e.stopPropagation(); handleConfirm(); }} style={{background:'#10B981',border:'none',color:'white',padding:'6px 12px',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'12px'}}>✓ Zatwierdź</button>
              </>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); handleCancel(); }} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'white',padding:'6px 12px',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'12px'}}>✕ Anuluj</button>
            )}
          </div>

          {rect && (
            <div style={{display:'flex',gap:'16px',flexWrap:'wrap',borderTop:'1px solid rgba(255,255,255,0.2)',paddingTop:'10px'}}>
              <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'11px',cursor:'pointer'}}>
                  <input type="checkbox" checked={showArrow} onChange={(e) => setShowArrow(e.target.checked)} style={{cursor:'pointer'}} onClick={(e) => e.stopPropagation()} />
                  Strzałka:
                </label>
                {showArrow && ['top', 'bottom', 'left', 'right'].map(pos => (
                  <button key={pos} onClick={(e) => { e.stopPropagation(); setArrowPosition(pos); }} style={{background: arrowPosition === pos ? '#F59E0B' : 'rgba(255,255,255,0.15)',border:'none',color:'white',padding:'4px 8px',borderRadius:'4px',cursor:'pointer',fontSize:'11px'}}>
                    {pos === 'top' ? '⬆️' : pos === 'bottom' ? '⬇️' : pos === 'left' ? '⬅️' : '➡️'}
                  </button>
                ))}
              </div>
              <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                <span style={{fontSize:'11px',opacity:0.8}}>Opis:</span>
                {['top', 'bottom', 'left', 'right', 'center'].map(pos => (
                  <button key={pos} onClick={(e) => { e.stopPropagation(); setTooltipPosition(pos); }} style={{background: tooltipPosition === pos ? '#3B82F6' : 'rgba(255,255,255,0.15)',border:'none',color:'white',padding:'4px 8px',borderRadius:'4px',cursor:'pointer',fontSize:'11px'}}>
                    {pos === 'center' ? '⬤' : pos === 'top' ? '⬆️' : pos === 'bottom' ? '⬇️' : pos === 'left' ? '⬅️' : '➡️'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'drawing' && displayRect && displayRect.width > 50 && showPanel && (
        <div className="selector-ui" style={{position:'fixed',bottom:'20px',left:'50%',transform:'translateX(-50%)',background:'#1E293B',color:'#60A5FA',padding:'8px 16px',borderRadius:'8px',fontSize:'13px'}}>
          📐 {Math.round(displayRect.width)} × {Math.round(displayRect.height)} px
          {rect && <span style={{marginLeft:'10px',color:'#10B981'}}>🔒 Scroll zablokowany</span>}
        </div>
      )}
    </div>
  );
};


// ============================================
// PANEL KONFIGURACJI SAMOUCZKA
// ============================================

const TutorialConfigPanel = ({ 
  steps, categories, onSave, onDelete, onReorder, onSaveCategory, onDeleteCategory, onClose,
  onStartSelecting,
  editingStep, setEditingStep
}) => {
  const [activeTab, setActiveTab] = useState('steps'); // 'steps', 'categories'
  const [formData, setFormData] = useState({ title: '', content: '', selector: '', role: 'all', category: '' });
  const [newCategory, setNewCategory] = useState({ name: '', icon: '📚', description: '' });
  const [editingCategory, setEditingCategory] = useState(null);

  useEffect(() => {
    if (editingStep) {
      setFormData({
        title: editingStep.title || '',
        content: editingStep.content || '',
        selector: editingStep.selector || '',
        role: editingStep.role || 'all',
        category: editingStep.category || ''
      });
    }
  }, [editingStep]);

  const handleSave = async () => {
    if (!formData.title.trim()) { alert('Wprowadź tytuł'); return; }
    const stepData = { ...formData, ...(editingStep?.id ? { id: editingStep.id } : {}) };
    const success = await onSave(stepData);
    if (success) { 
      setFormData({ title: '', content: '', selector: '', role: 'all', category: '' }); 
      setEditingStep(null);
    }
  };

  const handleSaveCategory = async () => {
    if (!newCategory.name.trim()) { alert('Wprowadź nazwę kategorii'); return; }
    const catData = editingCategory 
      ? { ...newCategory, id: editingCategory.id }
      : newCategory;
    const success = await onSaveCategory(catData);
    if (success) {
      setNewCategory({ name: '', icon: '📚', description: '' });
      setEditingCategory(null);
    }
  };

  const startSelecting = () => {
    setEditingStep({ ...editingStep, ...formData });
    onStartSelecting();
  };

  return (
    <>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:99998}} onClick={onClose}></div>
      <div style={{
        position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
        background:'white',borderRadius:'16px',boxShadow:'0 25px 50px rgba(0,0,0,0.3)',
        zIndex:99999,width:'95%',maxWidth:'1000px',maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden'
      }}>
        {/* Header z tabami */}
        <div style={{padding:'16px 20px',borderBottom:'1px solid #E2E8F0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={() => setActiveTab('steps')} style={{padding:'8px 16px',borderRadius:'8px',border:'none',background: activeTab === 'steps' ? '#3B82F6' : '#F1F5F9',color: activeTab === 'steps' ? 'white' : '#64748B',fontWeight:'600',cursor:'pointer'}}>
              📝 Kroki ({steps.length})
            </button>
            <button onClick={() => setActiveTab('categories')} style={{padding:'8px 16px',borderRadius:'8px',border:'none',background: activeTab === 'categories' ? '#3B82F6' : '#F1F5F9',color: activeTab === 'categories' ? 'white' : '#64748B',fontWeight:'600',cursor:'pointer'}}>
              📁 Kategorie ({categories.length})
            </button>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'24px',cursor:'pointer',color:'#94A3B8'}}>×</button>
        </div>

        {/* Body */}
        <div style={{padding:'20px',display:'flex',gap:'24px',overflow:'hidden',flex:1}}>
          {activeTab === 'steps' ? (
            <>
              {/* Lista kroków */}
              <div style={{flex:1,minWidth:'280px',maxHeight:'60vh',overflowY:'auto'}}>
                <h3 style={{margin:'0 0 12px',fontSize:'14px',color:'#64748B'}}>Lista kroków</h3>
                {steps.length === 0 ? (
                  <div style={{padding:'40px',textAlign:'center',color:'#94A3B8',background:'#F8FAFC',borderRadius:'12px'}}>
                    <div style={{fontSize:'40px',marginBottom:'8px'}}>📝</div>
                    <div>Brak kroków - dodaj pierwszy</div>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                    {steps.map((s, i) => {
                      const cat = categories.find(c => c.id === s.category);
                      return (
                        <div key={s.id} style={{padding:'12px',background: editingStep?.id === s.id ? '#DBEAFE' : 'white',border:'1px solid #E2E8F0',borderRadius:'8px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                            <span style={{background:'#3B82F6',color:'white',width:'24px',height:'24px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:'700'}}>{i + 1}</span>
                            <strong style={{flex:1,fontSize:'13px'}}>{s.title}</strong>
                          </div>
                          {cat && <div style={{fontSize:'11px',color:'#8B5CF6',marginBottom:'6px'}}>📁 {cat.name}</div>}
                          <div style={{display:'flex',gap:'6px'}}>
                            <button onClick={() => setEditingStep(s)} style={{padding:'4px 10px',fontSize:'11px',borderRadius:'4px',border:'1px solid #E2E8F0',background:'white',cursor:'pointer'}}>✏️</button>
                            <button onClick={() => window.confirm('Usunąć?') && onDelete(s.id)} style={{padding:'4px 10px',fontSize:'11px',borderRadius:'4px',border:'none',background:'#FEE2E2',color:'#DC2626',cursor:'pointer'}}>🗑️</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Formularz kroku */}
              <div style={{flex:1,minWidth:'320px'}}>
                <h3 style={{margin:'0 0 12px',fontSize:'14px',color:'#64748B'}}>{editingStep?.id ? '✏️ Edytuj krok' : '➕ Nowy krok'}</h3>
                <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                  <input type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} placeholder="Tytuł (np. 🔔 Powiadomienia)" style={{padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:'14px'}} />
                  
                  {/* Opis z ikonkami */}
                  <div>
                    <textarea value={formData.content} onChange={(e) => setFormData({...formData, content: e.target.value})} placeholder="Opis kroku..." rows={3} style={{width:'100%',padding:'10px',borderRadius:'8px 8px 0 0',border:'1px solid #E2E8F0',borderBottom:'none',fontSize:'14px',resize:'vertical',boxSizing:'border-box'}} />
                    <div style={{background:'#F1F5F9',padding:'8px',borderRadius:'0 0 8px 8px',border:'1px solid #E2E8F0',borderTop:'none'}}>
                      <div style={{fontSize:'10px',color:'#64748B',marginBottom:'6px'}}>Kliknij ikonę aby dodać do opisu:</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:'2px'}}>
                        {['📋','📦','⚙️','👥','🏭','🏢','📊','🗑️','🎓','🚚','💰','📑','💬','🔔','📧','🔍','👤','➕','✅','❌','⬆️','⬇️','⬅️','➡️','📅','💾','🔄','✏️','📝','📁','🎯','💡','🔒','📌','📎','👀','📱','💻','⏰','🔧','💳','💵','📈','📉','✓','✕','⚠️','ℹ️','❓','❗','🆕','🏆','🎁','🎉','👍','👎','👋','💪','🤝','🔥','⚡','⭐','💎','🧪','🧾','📸','🖼️','📜','📄','🗂️','📇','📘','📖'].map(icon => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() => setFormData({...formData, content: formData.content + icon})}
                            style={{fontSize:'16px',padding:'4px 6px',border:'none',background:'transparent',cursor:'pointer',borderRadius:'4px'}}
                            onMouseOver={(e) => e.currentTarget.style.background = '#DBEAFE'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Kategoria */}
                  <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} style={{padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0'}}>
                    <option value="">-- Bez kategorii --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>

                  {/* Rola */}
                  <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} style={{padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0'}}>
                    <option value="all">👥 Wszyscy</option>
                    <option value="admin">👑 Administrator</option>
                    <option value="worker">👷 Pracownik</option>
                    <option value="driver">🚚 Kierowca</option>
                    <option value="contractor">🏢 Kontrahent</option>
                  </select>

                  {/* Obszar do podświetlenia */}
                  <div style={{background:'#F8FAFC',padding:'12px',borderRadius:'8px'}}>
                    <div style={{fontSize:'12px',fontWeight:'600',marginBottom:'8px',color:'#374151'}}>Obszar do podświetlenia:</div>
                    {formData.selector ? (
                      <div style={{display:'flex',alignItems:'center',gap:'8px',background:'#DBEAFE',padding:'8px 12px',borderRadius:'6px'}}>
                        <span style={{fontSize:'12px'}}>✅ Obszar zaznaczony</span>
                        <button onClick={() => setFormData({...formData, selector: ''})} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',marginLeft:'auto'}}>✕</button>
                      </div>
                    ) : (
                      <button onClick={startSelecting} style={{width:'100%',padding:'10px',borderRadius:'6px',border:'2px dashed #3B82F6',background:'#EFF6FF',color:'#1D4ED8',fontWeight:'600',fontSize:'12px',cursor:'pointer'}}>
                        🎯 Kliknij aby zaznaczyć obszar
                      </button>
                    )}
                    <div style={{fontSize:'11px',color:'#64748B',marginTop:'6px'}}>
                      Najpierw klikniesz element do otwarcia (opcjonalne), potem narysujesz prostokąt
                    </div>
                  </div>

                  {/* Przyciski */}
                  <div style={{display:'flex',gap:'10px'}}>
                    {editingStep?.id && (
                      <button onClick={() => { setEditingStep(null); setFormData({title:'',content:'',selector:'',role:'all',category:''}); }} style={{flex:1,padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0',background:'white',cursor:'pointer',fontWeight:'600'}}>Anuluj</button>
                    )}
                    <button onClick={handleSave} style={{flex:1,padding:'10px',borderRadius:'8px',border:'none',background:'linear-gradient(135deg,#10B981,#059669)',color:'white',cursor:'pointer',fontWeight:'600'}}>
                      {editingStep?.id ? '💾 Zapisz' : '➕ Dodaj'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Lista kategorii */}
              <div style={{flex:1,minWidth:'280px',maxHeight:'60vh',overflowY:'auto'}}>
                <h3 style={{margin:'0 0 12px',fontSize:'14px',color:'#64748B'}}>Lista kategorii</h3>
                {categories.length === 0 ? (
                  <div style={{padding:'40px',textAlign:'center',color:'#94A3B8',background:'#F8FAFC',borderRadius:'12px'}}>
                    <div style={{fontSize:'40px',marginBottom:'8px'}}>📁</div>
                    <div>Brak kategorii - dodaj pierwszą</div>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                    {categories.map(c => {
                      const stepCount = steps.filter(s => s.category === c.id).length;
                      return (
                        <div key={c.id} style={{padding:'12px',background: editingCategory?.id === c.id ? '#F3E8FF' : 'white',border:'1px solid #E2E8F0',borderRadius:'8px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'4px'}}>
                            <span style={{fontSize:'24px'}}>{c.icon}</span>
                            <strong style={{flex:1}}>{c.name}</strong>
                            <span style={{fontSize:'11px',color:'#64748B'}}>{stepCount} kroków</span>
                          </div>
                          {c.description && <div style={{fontSize:'12px',color:'#64748B',marginBottom:'8px'}}>{c.description}</div>}
                          <div style={{display:'flex',gap:'6px'}}>
                            <button onClick={() => { setEditingCategory(c); setNewCategory({ name: c.name, icon: c.icon, description: c.description || '' }); }} style={{padding:'4px 10px',fontSize:'11px',borderRadius:'4px',border:'1px solid #E2E8F0',background:'white',cursor:'pointer'}}>✏️</button>
                            <button onClick={() => window.confirm('Usunąć kategorię?') && onDeleteCategory(c.id)} style={{padding:'4px 10px',fontSize:'11px',borderRadius:'4px',border:'none',background:'#FEE2E2',color:'#DC2626',cursor:'pointer'}}>🗑️</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Formularz kategorii */}
              <div style={{flex:1,minWidth:'280px'}}>
                <h3 style={{margin:'0 0 12px',fontSize:'14px',color:'#64748B'}}>{editingCategory ? '✏️ Edytuj kategorię' : '➕ Nowa kategoria'}</h3>
                <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                  <div style={{display:'flex',gap:'10px'}}>
                    <input type="text" value={newCategory.icon} onChange={(e) => setNewCategory({...newCategory, icon: e.target.value})} placeholder="📚" style={{width:'60px',padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:'20px',textAlign:'center'}} />
                    <input type="text" value={newCategory.name} onChange={(e) => setNewCategory({...newCategory, name: e.target.value})} placeholder="Nazwa kategorii" style={{flex:1,padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0'}} />
                  </div>
                  <textarea value={newCategory.description} onChange={(e) => setNewCategory({...newCategory, description: e.target.value})} placeholder="Opis kategorii (opcjonalnie)" rows={2} style={{padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0',resize:'vertical'}} />
                  <div style={{display:'flex',gap:'10px'}}>
                    {editingCategory && (
                      <button onClick={() => { setEditingCategory(null); setNewCategory({ name: '', icon: '📚', description: '' }); }} style={{flex:1,padding:'10px',borderRadius:'8px',border:'1px solid #E2E8F0',background:'white',cursor:'pointer',fontWeight:'600'}}>Anuluj</button>
                    )}
                    <button onClick={handleSaveCategory} style={{flex:1,padding:'10px',borderRadius:'8px',border:'none',background:'linear-gradient(135deg,#8B5CF6,#7C3AED)',color:'white',cursor:'pointer',fontWeight:'600'}}>
                      {editingCategory ? '💾 Zapisz' : '➕ Dodaj'}
                    </button>
                  </div>
                </div>

                {/* Podpowiedź ikon */}
                <div style={{marginTop:'16px',padding:'12px',background:'#F8FAFC',borderRadius:'8px'}}>
                  <div style={{fontSize:'12px',fontWeight:'600',marginBottom:'8px'}}>Popularne ikony:</div>
                  <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                    {['📦','⚙️','👥','📊','💰','📋','🚚','💬','🔔','📁','🎯','✅'].map(icon => (
                      <button key={icon} onClick={() => setNewCategory({...newCategory, icon})} style={{fontSize:'20px',padding:'6px',borderRadius:'6px',border:'1px solid #E2E8F0',background:'white',cursor:'pointer'}}>{icon}</button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'12px 20px',borderTop:'1px solid #E2E8F0',background:'#F8FAFC',textAlign:'right'}}>
          <button onClick={onClose} style={{padding:'10px 24px',borderRadius:'8px',border:'1px solid #E2E8F0',background:'white',cursor:'pointer',fontWeight:'600'}}>Zamknij</button>
        </div>
      </div>
    </>
  );
};


// ============================================
// KOMPONENT SAMOUCZKA
// ============================================

const TutorialOverlay = ({ steps, category, currentStep, userRole, onNext, onPrev, onSkip, onFinish, onBackToCategories }) => {
  const [menuOpened, setMenuOpened] = useState(false);

  // Filtruj kroki dla danej roli i kategorii
  const filteredSteps = steps.filter(s => {
    const roleMatch = s.role === 'all' || s.role === userRole;
    const catMatch = !category || s.category === category;
    return roleMatch && catMatch;
  });
  
  const step = filteredSteps[currentStep];
  const total = filteredSteps.length;
  const isLast = currentStep >= total - 1;
  const isFirst = currentStep === 0;

  // Parsuj pozycję z JSON
  let rect = null;
  let openMenu = null;
  let arrowPos = 'bottom';
  let tooltipPos = 'bottom';
  
  if (step?.selector) {
    try {
      const parsed = JSON.parse(step.selector);
      rect = {
        top: parsed.top,
        left: parsed.left,
        width: parsed.width,
        height: parsed.height
      };
      openMenu = parsed.openMenu;
      arrowPos = parsed.arrowPosition || 'bottom';
      tooltipPos = parsed.tooltipPosition || 'bottom';
    } catch {
      rect = null;
    }
  }

  // BLOKUJ SCROLL podczas samouczka + AUTO-SCROLL do elementu
  useEffect(() => {
    // Najpierw auto-scroll do zaznaczonego elementu
    if (rect) {
      const targetY = rect.top - 100; // 100px marginesu od góry
      if (targetY > 0) {
        window.scrollTo({ top: targetY, behavior: 'instant' });
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
    
    // Potem blokuj scroll
    const timer = setTimeout(() => {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }, 50);
    
    const preventScroll = (e) => {
      e.preventDefault();
    };
    
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
    };
  }, [rect, currentStep]);

  // Otwórz menu jeśli potrzebne
  useEffect(() => {
    if (openMenu && !menuOpened) {
      const btn = document.querySelector(openMenu);
      if (btn) {
        btn.click();
        setMenuOpened(true);
      }
    }
    
    return () => {
      if (menuOpened && openMenu) {
        const btn = document.querySelector(openMenu);
        if (btn) btn.click();
        setMenuOpened(false);
      }
    };
  }, [currentStep, openMenu, menuOpened]);

  useEffect(() => {
    setMenuOpened(false);
  }, [currentStep]);

  if (!step) {
    // Brak kroków - zakończ
    if (total === 0) {
      return (
        <div style={{position:'fixed',inset:0,zIndex:999999,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'white',padding:'30px',borderRadius:'16px',textAlign:'center'}}>
            <div style={{fontSize:'48px',marginBottom:'12px'}}>✅</div>
            <h3 style={{margin:'0 0 12px'}}>Brak kroków do wyświetlenia</h3>
            <button onClick={onFinish} style={{padding:'12px 24px',borderRadius:'8px',border:'none',background:'#3B82F6',color:'white',fontWeight:'600',cursor:'pointer'}}>Zamknij</button>
          </div>
        </div>
      );
    }
    return null;
  }

  // Strzałki dla różnych kierunków
  const arrows = {
    top: '⬇️',
    bottom: '⬆️',
    left: '➡️',
    right: '⬅️'
  };

  // Oblicz pozycje
  const tooltipWidth = 380;
  const tooltipHeight = 280;
  const gap = 20;
  const arrowSize = 40;
  
  let tooltipStyle = {};
  let arrowStyle = {};
  let showArrowEl = arrowPos !== 'none';
  
  if (rect && tooltipPos !== 'center') {
    switch (tooltipPos) {
      case 'top':
        tooltipStyle = { top: Math.max(10, rect.top - tooltipHeight - gap - (showArrowEl ? arrowSize : 0)), left: Math.max(10, Math.min(rect.left + rect.width/2 - tooltipWidth/2, window.innerWidth - tooltipWidth - 10)), width: tooltipWidth };
        break;
      case 'bottom':
        tooltipStyle = { top: rect.top + rect.height + gap + (showArrowEl ? arrowSize : 0), left: Math.max(10, Math.min(rect.left + rect.width/2 - tooltipWidth/2, window.innerWidth - tooltipWidth - 10)), width: tooltipWidth };
        break;
      case 'left':
        tooltipStyle = { top: Math.max(10, Math.min(rect.top + rect.height/2 - tooltipHeight/2, window.innerHeight - tooltipHeight - 10)), left: Math.max(10, rect.left - tooltipWidth - gap - (showArrowEl ? arrowSize : 0)), width: tooltipWidth };
        break;
      case 'right':
        tooltipStyle = { top: Math.max(10, Math.min(rect.top + rect.height/2 - tooltipHeight/2, window.innerHeight - tooltipHeight - 10)), left: rect.left + rect.width + gap + (showArrowEl ? arrowSize : 0), width: tooltipWidth };
        break;
      default:
        tooltipStyle = { top: rect.top + rect.height + gap + arrowSize, left: Math.max(10, Math.min(rect.left + rect.width/2 - tooltipWidth/2, window.innerWidth - tooltipWidth - 10)), width: tooltipWidth };
    }
    
    if (showArrowEl) {
      switch (arrowPos) {
        case 'top':
          arrowStyle = { top: rect.top - arrowSize - 8, left: rect.left + rect.width/2 - 16 };
          break;
        case 'bottom':
          arrowStyle = { top: rect.top + rect.height + 8, left: rect.left + rect.width/2 - 16 };
          break;
        case 'left':
          arrowStyle = { top: rect.top + rect.height/2 - 16, left: rect.left - arrowSize - 8 };
          break;
        case 'right':
          arrowStyle = { top: rect.top + rect.height/2 - 16, left: rect.left + rect.width + 8 };
          break;
        default:
          arrowStyle = { top: rect.top + rect.height + 8, left: rect.left + rect.width/2 - 16 };
      }
    }
  } else {
    // Środek ekranu
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: tooltipWidth };
    showArrowEl = false;
  }

  const closeMenuAndNavigate = (callback) => {
    if (menuOpened && openMenu) {
      const btn = document.querySelector(openMenu);
      if (btn) btn.click();
      setMenuOpened(false);
    }
    callback();
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:999999}}>
      {/* Ciemne tło z wyciętym otworem */}
      {rect ? (
        <svg style={{position:'fixed',inset:0,width:'100%',height:'100%'}}>
          <defs>
            <mask id="tutmask">
              <rect width="100%" height="100%" fill="white"/>
              <rect x={rect.left-4} y={rect.top-4} width={rect.width+8} height={rect.height+8} rx="8" fill="black"/>
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.85)" mask="url(#tutmask)"/>
        </svg>
      ) : (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)'}}/>
      )}

      {/* Ramka podświetlenia */}
      {rect && (
        <div style={{
          position:'fixed',
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          border:'3px solid #3B82F6',
          borderRadius:'10px',
          boxShadow:'0 0 0 4px rgba(59,130,246,0.3), 0 0 40px rgba(59,130,246,0.6)',
          pointerEvents:'none',
          animation:'tutpulse 1.5s infinite',
          zIndex: 1000001
        }}/>
      )}

      {/* Strzałka */}
      {showArrowEl && rect && (
        <div style={{
          position:'fixed',
          ...arrowStyle,
          fontSize:'36px',
          zIndex: 1000004,
          animation:'tutbounce 0.6s infinite',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))'
        }}>
          {arrows[arrowPos]}
        </div>
      )}

      {/* Tooltip */}
      <div style={{
        position:'fixed',
        ...tooltipStyle,
        background:'white',
        borderRadius:'16px',
        boxShadow:'0 20px 50px rgba(0,0,0,0.4)',
        overflow:'hidden',
        zIndex: 1000002
      }}>
        {/* Header */}
        <div style={{background:'linear-gradient(135deg, #1E3A5F, #2D5A87)',color:'white',padding:'14px 18px',display:'flex',alignItems:'center',gap:'10px'}}>
          <span style={{fontSize:'22px',fontWeight:'700'}}>{currentStep + 1}</span>
          <span style={{opacity:0.7}}>/ {total}</span>
          <div style={{flex:1,height:'4px',background:'rgba(255,255,255,0.2)',borderRadius:'2px',margin:'0 12px'}}>
            <div style={{height:'100%',width:`${((currentStep+1)/total)*100}%`,background:'linear-gradient(90deg, #60A5FA, #34D399)',borderRadius:'2px',transition:'width 0.3s'}}/>
          </div>
          <button onClick={() => closeMenuAndNavigate(onSkip)} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'white',width:'28px',height:'28px',borderRadius:'50%',cursor:'pointer',fontSize:'14px'}}>✕</button>
        </div>

        {/* Body */}
        <div style={{padding:'20px'}}>
          <h3 style={{margin:'0 0 12px',fontSize:'18px',fontWeight:'700',color:'#1E293B'}}>{step.title}</h3>
          <p style={{margin:0,fontSize:'14px',color:'#64748B',lineHeight:1.7,whiteSpace:'pre-line'}}>{step.content}</p>
        </div>

        {/* Footer */}
        <div style={{padding:'14px 20px',background:'#F8FAFC',borderTop:'1px solid #E2E8F0',display:'flex',gap:'10px',flexWrap:'wrap'}}>
          {onBackToCategories && (
            <button onClick={() => closeMenuAndNavigate(onBackToCategories)} style={{padding:'10px 14px',borderRadius:'8px',border:'1px solid #E2E8F0',background:'white',color:'#64748B',fontWeight:'600',cursor:'pointer',fontSize:'13px'}}>
              📁 Kategorie
            </button>
          )}
          <div style={{flex:1}}></div>
          {!isFirst && (
            <button onClick={() => closeMenuAndNavigate(onPrev)} style={{padding:'12px 16px',borderRadius:'8px',border:'none',background:'#E2E8F0',color:'#64748B',fontWeight:'600',cursor:'pointer'}}>← Wstecz</button>
          )}
          {isFirst && (
            <button onClick={() => closeMenuAndNavigate(onSkip)} style={{padding:'12px 16px',borderRadius:'8px',border:'1px solid #E2E8F0',background:'transparent',color:'#94A3B8',fontWeight:'600',cursor:'pointer'}}>Pomiń</button>
          )}
          {isLast ? (
            <button onClick={() => closeMenuAndNavigate(onFinish)} style={{padding:'12px 20px',borderRadius:'8px',border:'none',background:'linear-gradient(135deg, #10B981, #059669)',color:'white',fontWeight:'600',cursor:'pointer'}}>Zakończ ✓</button>
          ) : (
            <button onClick={() => closeMenuAndNavigate(onNext)} style={{padding:'12px 20px',borderRadius:'8px',border:'none',background:'linear-gradient(135deg, #3B82F6, #2563EB)',color:'white',fontWeight:'600',cursor:'pointer'}}>Dalej →</button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes tutpulse { 0%,100%{box-shadow:0 0 0 4px rgba(59,130,246,0.3),0 0 40px rgba(59,130,246,0.6)} 50%{box-shadow:0 0 0 8px rgba(59,130,246,0.2),0 0 60px rgba(59,130,246,0.8)} }
        @keyframes tutbounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>
    </div>
  );
};

// ROUTER - sprawdza publiczne ścieżki przed główną aplikacją
const AppRouter = () => {
  const currentPath = window.location.pathname;
  
  // Publiczny czat - nie wymaga logowania
  if (currentPath === '/czat') {
    return <PublicChat />;
  }
  
  // Panel śledzenia zamówienia - nie wymaga logowania
  const orderMatch = currentPath.match(/^\/zamowienie\/(.+)$/);
  if (orderMatch) {
    return <PublicOrderPanel token={orderMatch[1]} />;
  }
  
  // Formularz reklamacji - nie wymaga logowania
  const complaintMatch = currentPath.match(/^\/reklamacja\/(.+)$/);
  if (complaintMatch) {
    return <PublicComplaintForm token={complaintMatch[1]} />;
  }
  
  // Główna aplikacja
  return <App />;
};

export default AppRouter;
