import React, { useState, useEffect, useRef } from 'react';
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
  initializeDefaultData
} from './firebase';
import { exportToExcel, autoSyncToGoogleSheets, setGoogleScriptUrl, getGoogleScriptUrl } from './export';
import './App.css';

// Funkcja wysyłania emaila przez MailerSend (via Vercel API)
// attachments: [{ filename: 'plik.pdf', content: 'base64...', type: 'application/pdf' }]
const sendEmailViaMailerSend = async (toEmail, toName, subject, textContent, htmlContent = null, attachments = []) => {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        toEmail,
        toName: toName || 'Klient',
        subject,
        textContent,
        htmlContent: htmlContent || textContent.replace(/\n/g, '<br>'),
        attachments
      })
    });

    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('Email wysłany pomyślnie!');
      return { success: true };
    } else {
      console.error('Błąd wysyłania emaila:', data.error);
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('Błąd połączenia:', error);
    return { success: false, error };
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
      <div className="login-screen">
        <div className="login-box">
          <div className="login-logo">📦</div>
          <h1>Herraton</h1>
          <p>Ładowanie...</p>
          <div className="spinner"></div>
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
  
  const status = getStatus(order.status);
  const country = getCountry(order.kraj);
  const days = getDaysUntilPickup(order.dataOdbioru);
  const urgency = getUrgencyStyle(days);
  const producer = Object.values(producers).find(p => p.id === order.zaladunek);
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);
  
  const hasMultipleProducts = order.produkty && order.produkty.length > 1;
  
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
      
      // Dodaj rabaty z rabatyKierowcow jeśli nie ma w produktach
      if (order.rabatyKierowcow) {
        Object.entries(order.rabatyKierowcow).forEach(([driverId, rabat]) => {
          if (protocols[driverId] && !protocols[driverId].rabat) {
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

  const handleSendConfirmation = () => {
    if (!order.klient?.email) {
      alert('Brak adresu email klienta!');
      return;
    }
    
    const { subject, body } = generateConfirmationEmail();
    
    // Wyślij przez MailerSend
    sendEmailViaMailerSend(
      order.klient.email,
      order.klient.imie,
      subject,
      body
    ).then(result => {
      if (result.success) {
        alert('✅ Email z potwierdzeniem zamówienia został wysłany!');
      } else {
        alert('❌ Błąd wysyłania emaila. Spróbuj ponownie.');
      }
    });
    
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
    <div className="modal-overlay" onClick={onClose}>
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

          {/* RABAT PRZY DOSTAWIE */}
          {order.rabatPrzyDostawie && (
            <div className="detail-section discount-section">
              <label>💸 RABAT PRZY DOSTAWIE</label>
              <div className="discount-display">
                <div className="discount-amount">
                  -{formatCurrency(order.rabatPrzyDostawie.kwota, order.platnosci?.waluta)}
                </div>
                <div className="discount-details">
                  <p><strong>Powód:</strong> {order.rabatPrzyDostawie.powod}</p>
                  <p><strong>Udzielony przez:</strong> {order.rabatPrzyDostawie.kierowca}</p>
                  <p><strong>Data:</strong> {formatDateTime(order.rabatPrzyDostawie.data)}</p>
                </div>
              </div>
            </div>
          )}

          <HistoryPanel historia={order.historia} utworzonePrzez={order.utworzonePrzez} />
            </>
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
          <button className="btn-danger" onClick={handleDelete}>🗑️ Usuń zamówienie</button>
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>

      {/* Modal podglądu zdjęcia */}
      {previewImage && <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />}

      {/* Modal wysyłania potwierdzenia dostawy */}
      {showDeliveryEmailModal && (
        <div className="modal-overlay" onClick={() => setShowDeliveryEmailModal(false)} style={{zIndex: 2000}}>
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
        <div className="modal-overlay" onClick={() => setShowEmailConfirmation(false)} style={{zIndex: 2000}}>
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
        <div className="modal-overlay" onClick={() => setShowProtocolModal(false)} style={{zIndex: 2000}}>
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

  // Funkcja generująca treść emaila z potwierdzeniem
  const generateConfirmationEmail = () => {
    const walutaSymbol = CURRENCIES.find(c => c.code === form.platnosci?.waluta)?.symbol || 'zł';
    const cenaCalkowita = form.platnosci?.cenaCalkowita || 0;
    const zaplacono = form.platnosci?.zaplacono || 0;
    const doZaplaty = form.platnosci?.doZaplaty || (cenaCalkowita - zaplacono);
    
    const subject = `Potwierdzenie zamówienia nr ${form.nrWlasny}`;
    
    const body = `Szanowny/a ${form.klient?.imie || 'Kliencie'},

Dziękujemy za złożenie zamówienia! Poniżej znajdziesz szczegóły:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 POTWIERDZENIE ZAMÓWIENIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔢 Numer zamówienia: ${form.nrWlasny}
📅 Data zamówienia: ${formatDate(form.dataZlecenia)}

📦 OPIS PRODUKTÓW:
${form.towar || 'Brak opisu'}

📍 ADRES DOSTAWY:
${form.klient?.adres || 'Nie podano'}

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

  // Funkcja wysyłania emaila
  const handleSendConfirmation = () => {
    if (!form.klient?.email) {
      alert('Brak adresu email klienta!');
      return;
    }
    
    const { subject, body } = generateConfirmationEmail();
    
    // Wyślij przez MailerSend
    sendEmailViaMailerSend(
      form.klient.email,
      form.klient.imie,
      subject,
      body
    ).then(result => {
      if (result.success) {
        alert('✅ Email z potwierdzeniem zamówienia został wysłany!');
      } else {
        alert('❌ Błąd wysyłania emaila. Spróbuj ponownie.');
      }
    });
    
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
    
    // Odejmij rabat jeśli był udzielony przez kierowcę
    const rabat = form.rabatPrzyDostawie?.kwota || 0;
    if (rabat > 0) {
      const rabatNetto = rabat / vatMultiplier;
      const rabatPLN = convertToPLN(rabatNetto, form.platnosci?.waluta);
      marzaPLN -= rabatPLN;
    }
    
    // Oblicz procent marży (od ceny po rabacie)
    const skutecznaCenaNettoPLN = rabat > 0 
      ? cenaNettoPLN - convertToPLN(rabat / vatMultiplier, form.platnosci?.waluta)
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
      rabatPLN: rabat > 0 ? Math.round(convertToPLN(rabat / vatMultiplier, form.platnosci?.waluta) * 100) / 100 : 0
    };
  };

  const handleSave = async () => {
    setSaving(true);
    
    // Synchronizuj pola towar i zaladunek dla kompatybilności wstecznej
    const formToSave = { ...form };
    if (formToSave.produkty && formToSave.produkty.length > 0) {
      // Połącz opisy wszystkich produktów
      formToSave.towar = formToSave.produkty.map((p, idx) => {
        const prodName = Object.values(producers).find(pr => pr.id === p.producent)?.name || p.producentNazwa || '';
        const prefix = formToSave.produkty.length > 1 ? `[${p.nrPodzamowienia || idx + 1}] ` : '';
        return `${prefix}${p.towar}${prodName ? ` (${prodName})` : ''}`;
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
    <div className="modal-overlay" onClick={onClose}>
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
            {form.klient?.email && (
              <button type="button" className="btn-secondary" onClick={() => setShowConfirmationModal(true)}>
                📧 Wyślij potwierdzenie do klienta
              </button>
            )}
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
          <div className="confirmation-modal-overlay" onClick={() => setShowConfirmationModal(false)}>
            <div className="confirmation-modal" onClick={e => e.stopPropagation()}>
              <div className="confirmation-modal-header">
                <h3>📧 Podgląd potwierdzenia zamówienia</h3>
                <button className="btn-close" onClick={() => setShowConfirmationModal(false)}>×</button>
              </div>
              <div className="confirmation-modal-body">
                <div className="email-preview">
                  <div className="email-to">
                    <strong>Do:</strong> {form.klient?.email}
                  </div>
                  <div className="email-subject">
                    <strong>Temat:</strong> Potwierdzenie zamówienia nr {form.nrWlasny}
                  </div>
                  <div className="email-body-preview">
                    <pre>{generateConfirmationEmail().body}</pre>
                  </div>
                </div>
              </div>
              <div className="confirmation-modal-footer">
                <button className="btn-secondary" onClick={() => setShowConfirmationModal(false)}>Anuluj</button>
                <button className="btn-primary" onClick={handleSendConfirmation}>
                  📤 Wyślij email
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
              <div className="confirmation-modal-overlay" onClick={() => setShowEmailModal(null)}>
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
            <div className="confirmation-modal-overlay" onClick={() => setShowEmailModal(null)}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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

const SettingsModal = ({ onClose }) => {
  const [url, setUrl] = useState(getGoogleScriptUrl());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setGoogleScriptUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ Ustawienia</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>URL Google Apps Script</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..." />
            <small>Wklej URL z kroku 10 instrukcji</small>
          </div>
          {saved && <div className="success-message">✅ Zapisano!</div>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
          <button className="btn-primary" onClick={handleSave}>💾 Zapisz</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL REKLAMACJI
// ============================================

const ComplaintsPanel = ({ complaints, orders, onSave, onDelete, onClose, currentUser, onAddNotification }) => {
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
    if (!selectedComplaint || !newComment.trim()) return;
    const updated = {
      ...selectedComplaint,
      komentarze: [...(selectedComplaint.komentarze || []), {
        id: Date.now(),
        tekst: newComment,
        data: new Date().toISOString(),
        autor: currentUser.name
      }]
    };
    await onSave(updated, selectedComplaint.id);
    setSelectedComplaint(updated);
    setNewComment('');
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
      <div className="modal-overlay" onClick={onClose}>
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
              <button className="btn-primary" onClick={openNewForm}>➕ Nowa reklamacja</button>
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
      <div className="modal-overlay" onClick={onClose}>
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
      <div className="modal-overlay" onClick={onClose}>
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

                {/* Zdjęcia */}
                {selectedComplaint.zdjecia?.length > 0 && (
                  <div className="detail-section-card">
                    <h4>📷 Zdjęcia ({selectedComplaint.zdjecia.length})</h4>
                    <div className="photos-grid">
                      {selectedComplaint.zdjecia.map(photo => (
                        <div key={photo.id} className="photo-item">
                          <img src={photo.url} alt="Reklamacja" />
                        </div>
                      ))}
                    </div>
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

                {/* Komentarze */}
                <div className="detail-section-card">
                  <h4>💬 Komentarze ({selectedComplaint.komentarze?.length || 0})</h4>
                  <div className="comments-list">
                    {(selectedComplaint.komentarze || []).map(comment => (
                      <div key={comment.id} className="comment-item">
                        <div className="comment-header">
                          <strong>{comment.autor}</strong>
                          <span>{formatDateTime(comment.data)}</span>
                        </div>
                        <p>{comment.tekst}</p>
                      </div>
                    ))}
                    {(!selectedComplaint.komentarze || selectedComplaint.komentarze.length === 0) && (
                      <p className="no-comments">Brak komentarzy</p>
                    )}
                  </div>
                  <div className="comment-form">
                    <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Dodaj komentarz..." rows={2} />
                    <button className="btn-primary" onClick={handleAddComment} disabled={!newComment.trim()}>➕</button>
                  </div>
                </div>
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
  
  const inquiryBody = `Dzień dobry,

Pytanie o zamówienie nr ${order.nrWlasny || 'BRAK'} - termin: ${formatDate(order.dataOdbioru)}.

Opis: ${order.towar}

Proszę o informację o statusie realizacji.

Z poważaniem`;

  const orderBody = `Dzień dobry,

Zlecam realizację zamówienia:

Nr zamówienia: ${order.nrWlasny || 'BRAK'}
Opis: ${order.towar}
Termin odbioru: ${formatDate(order.dataOdbioru) || 'Do ustalenia'}

Proszę o potwierdzenie przyjęcia zlecenia.

Z poważaniem`;

  const body = emailType === 'inquiry' ? inquiryBody : orderBody;
  const subject = emailType === 'inquiry' 
    ? `Zapytanie - zamówienie ${order.nrWlasny}` 
    : `ZLECENIE - zamówienie ${order.nrWlasny}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
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

  const toggleOrder = (orderId) => {
    setSelectedOrders(prev => prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]);
  };

  const selectAll = () => {
    setSelectedOrders(selectedOrders.length === orders.length ? [] : orders.map(o => o.id));
  };

  const generateBody = () => {
    const selected = orders.filter(o => selectedOrders.includes(o.id));
    
    if (emailType === 'inquiry') {
      const ordersList = selected.map(o => 
        `• Nr ${o.nrWlasny} - ${o.towar?.substring(0, 50) || 'brak opisu'}... (termin: ${formatDate(o.dataOdbioru) || 'brak'})`
      ).join('\n');

      return `Dzień dobry,

Proszę o informację o statusie realizacji następujących zamówień:

${ordersList}

Proszę o informację zwrotną.

Z poważaniem`;
    } else {
      const ordersList = selected.map(o => 
        `━━━━━━━━━━━━━━━━━━━━━━
Nr zamówienia: ${o.nrWlasny}
Opis: ${o.towar || 'brak opisu'}
Termin odbioru: ${formatDate(o.dataOdbioru) || 'Do ustalenia'}`
      ).join('\n\n');

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
    <div className="modal-overlay" onClick={onClose}>
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
  const status = getStatus(order.status);
  const country = getCountry(order.kraj);
  const days = getDaysUntilPickup(order.dataOdbioru);

  // Sprawdź czy użytkownik może usunąć zamówienie
  const canDelete = isAdmin || order.utworzonePrzez?.id === currentUser?.id || order.kontrahentId === currentUser?.id;
  // Nie pokazuj migającego powiadomienia dla zamówień w transporcie, dostarczonych lub odebranych
  const showUrgency = !['w_transporcie', 'dostarczone', 'odebrane'].includes(order.status);
  const urgency = showUrgency ? getUrgencyStyle(days) : null;
  const producer = Object.values(producers).find(p => p.id === order.zaladunek);
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);
  
  // Czy to zamówienie łączone (wiele produktów)?
  const hasMultipleProducts = order.produkty && order.produkty.length > 1;

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
    
    // Odejmij rabat jeśli był udzielony przez kierowcę
    if (order.rabatPrzyDostawie?.kwota > 0) {
      const rabatNetto = order.rabatPrzyDostawie.kwota / vatMultiplier;
      const rabatPLN = convertToPLN(rabatNetto, order.platnosci?.waluta);
      marzaPLN -= rabatPLN;
    }
    
    return Math.round(marzaPLN * 100) / 100;
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(order.id);
  };

  return (
    <div className="order-card" onClick={() => onClick(order)}>
      <div className="order-card-header">
        <div className="order-card-title">
          <span className="country-flag">{country?.flag}</span>
          <span className="order-number">{order.nrWlasny || '—'}</span>
          {hasMultipleProducts && <span className="multi-product-badge">📦 {order.produkty.length}</span>}
          {urgency && <span className={`urgency-badge small ${urgency.blink ? 'blink' : ''}`} style={{ background: urgency.bg, color: urgency.color }}>⏰{urgency.label}</span>}
        </div>
        {!hasMultipleProducts && (
          <select
            value={order.status}
            onClick={e => e.stopPropagation()}
            onChange={e => { e.stopPropagation(); onStatusChange(order.id, e.target.value); }}
            className="status-select"
            style={{ background: status?.bgColor, color: status?.color }}
          >
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
        )}
      </div>

      <div className="order-card-body">
        {/* Jeśli wiele produktów - pokaż listę z osobnymi statusami */}
        {hasMultipleProducts ? (
          <div className="order-products-list">
            {order.produkty.map((prod, idx) => {
              const prodStatus = getStatus(prod.status);
              const prodProducer = Object.values(producers).find(p => p.id === prod.producent);
              const prodDriver = drivers.find(d => d.id === prod.kierowca);
              return (
                <div 
                  key={prod.id || idx} 
                  className="order-product-item clickable"
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
                    {prod.dataOdbioru && <span className="mini-tag date">📅 {formatDate(prod.dataOdbioru)}</span>}
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
          <>
            <p className="order-product">{order.towar || 'Brak opisu'}</p>
            <div className="order-tags">
              {producer && !isContractor && <span className="tag tag-producer">🏭 {producer.name}</span>}
              {order.dataOdbioru && <span className="tag tag-date">📅 {formatDate(order.dataOdbioru)}</span>}
              {driver && <span className="tag tag-driver">🚚 {driver.name}</span>}
            </div>
          </>
        )}

        <div className="order-client">
          <div className="client-name">{order.klient?.imie || '—'}</div>
          <div className="client-address">📍 {order.klient?.adres || '—'}</div>
        </div>

        <div className="order-payment">
          {order.platnosci?.cenaCalkowita > 0 && (
            <span>Cena: <strong>{formatCurrency(order.platnosci.cenaCalkowita, order.platnosci.waluta)}</strong></span>
          )}
          {order.platnosci?.doZaplaty > 0 && (
            <span className="unpaid">
              Do zapłaty: <strong>{formatCurrency(order.platnosci.doZaplaty, order.platnosci.waluta)}</strong>
              {order.rabatPrzyDostawie?.kwota > 0 && (
                <small className="payment-discount-info">
                  <br/>
                  <span className="original-amount">Było: {formatCurrency(order.platnosci.originalDoZaplaty || (order.platnosci.doZaplaty + order.rabatPrzyDostawie.kwota), order.platnosci.waluta)}</span>
                  <span className="discount-applied"> → Rabat: -{formatCurrency(order.rabatPrzyDostawie.kwota, order.platnosci.waluta)}</span>
                </small>
              )}
            </span>
          )}
          {order.platnosci?.doZaplaty === 0 && order.platnosci?.cenaCalkowita > 0 && (
            <span className="paid-badge">✓ Opłacone</span>
          )}
          {/* Marża - tylko dla admina - ZAWSZE W PLN */}
          {isAdmin && (order.koszty?.zakupNetto > 0 || order.koszty?.zakupBrutto > 0 || (order.produkty?.some(p => p.koszty?.zakupNetto > 0))) && (
            <span className={calcMarzaPLN() >= 0 ? 'margin-badge positive' : 'margin-badge negative'}>
              📊 Marża: <strong>{formatCurrency(calcMarzaPLN(), 'PLN')}</strong>
              {order.rabatPrzyDostawie?.kwota > 0 && <small className="discount-note"> (po rabacie)</small>}
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

        <div className="order-card-footer">
          <span className="order-creator">👤 {order.utworzonePrzez?.nazwa || '?'} • {formatDate(order.utworzonePrzez?.data)}</span>
          <div className="order-actions">
            <button onClick={e => { e.stopPropagation(); onEdit(order); }} className="btn-icon">✏️</button>
            {producer && !isContractor && <button onClick={e => { e.stopPropagation(); onEmailClick(order, producer); }} className="btn-icon btn-email">📧</button>}
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
      // Zapisz rabat tylko do MOICH produktów
      const updatedProdukty = order.produkty.map((prod, idx) => {
        if (myProductIndexes.includes(idx)) {
          return {
            ...prod,
            rabat: rabat
          };
        }
        return prod;
      });

      // Zapisz też w zbiorze rabatów per kierowca
      const rabatyKierowcow = order.rabatyKierowcow || {};
      rabatyKierowcow[user.id] = rabat;

      // Oblicz sumę wszystkich rabatów
      const sumaRabatow = Object.values(rabatyKierowcow).reduce((sum, r) => sum + (r.kwota || 0), 0);
      
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
        ...order,
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

  const openNotes = (order) => {
    setShowNotes(order.id);
    setNotes(order.uwagiKierowcy || '');
    setEstPickup(order.szacowanyOdbior || '');
    setEstDelivery(order.szacowanaDostwa || '');
  };

  const saveNotes = async () => {
    const order = orders.find(o => o.id === showNotes);
    if (!order) return;
    const hist = [...(order.historia || [])];
    if (notes !== order.uwagiKierowcy) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Uwagi: ${notes}` });
    if (estPickup !== order.szacowanyOdbior) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Szacowany odbiór: ${formatDate(estPickup)}` });
    if (estDelivery !== order.szacowanaDostwa) hist.push({ data: new Date().toISOString(), uzytkownik: user.name, akcja: `Szacowana dostawa: ${formatDate(estDelivery)}` });

    await onUpdateOrder(order.id, { ...order, uwagiKierowcy: notes, szacowanyOdbior: estPickup, szacowanaDostwa: estDelivery, historia: hist });

    if (notes && notes !== order.uwagiKierowcy) {
      onAddNotification({ icon: '📝', title: `Uwagi: ${order.nrWlasny}`, message: `Kierowca ${user.name}: ${notes}`, orderId: order.id });
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

      await onUpdateOrder(order.id, {
        produkty: updatedProdukty,
        // Zapisz też umowę dla tego kierowcy
        umowyOdbioru: {
          ...(order.umowyOdbioru || {}),
          [user.id]: umowaOdbioru
        },
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

  const confirmDelivery = async (order) => {
    await onUpdateOrder(order.id, {
      ...order,
      status: 'dostarczone',
      potwierdzenieDostawy: { data: new Date().toISOString(), kierowca: user.name },
      historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: 'Dostawa potwierdzona' }]
    });
    onAddNotification({ icon: '✔️', title: `Dostarczono: ${order.nrWlasny}`, message: `Kierowca ${user.name} potwierdził dostawę do ${order.klient?.imie}`, orderId: order.id });
    
    // Jeśli klient ma email - pokaż modal z pytaniem o wysłanie potwierdzenia
    if (order.klient?.email) {
      setShowDeliveryConfirmation(order);
      setDeliveryEmailLanguage(protocolLanguage); // Użyj wybranego języka protokołu
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
    const rabat = order.rabatPrzyDostawie;
    const hasDiscount = rabat && rabat.kwota > 0;
    const zaplacono = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
    const originalDoZaplaty = order.platnosci?.originalDoZaplaty || (cenaCalkowita - zaplacono);
    const rabatKwota = hasDiscount ? rabat.kwota : 0;
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
                <span>🎁 Udzielono rabatu (${rabat.powod || 'brak powodu'}):</span>
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
    
    // Informacje o rabacie
    const rabat = order.rabatPrzyDostawie;
    const hasDiscount = rabat && rabat.kwota > 0;
    
    // Uwagi klienta - sprawdzamy WSZYSTKIE możliwe pola (w tym umowaOdbioru!)
    const clientRemarks = order.umowaOdbioru?.uwagiKlienta || order.uwagiKlienta || order.uwagiOdKlienta || order.uwagi || order.uwagiPrzyDostawie || '';
    
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
        noSignature: 'Podpis klienta: OCZEKUJE NA PODPIS',
        discountTitle: 'UDZIELONY RABAT',
        discountAmount: 'Kwota rabatu',
        discountReason: 'Powód rabatu',
        discountBy: 'Rabat udzielony przez'
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
        noSignature: 'Client signature: AWAITING SIGNATURE',
        discountTitle: 'DISCOUNT APPLIED',
        discountAmount: 'Discount amount',
        discountReason: 'Discount reason',
        discountBy: 'Discount given by'
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
        noSignature: 'Kundenunterschrift: WARTET AUF UNTERSCHRIFT',
        discountTitle: 'GEWÄHRTER RABATT',
        discountAmount: 'Rabattbetrag',
        discountReason: 'Rabattgrund',
        discountBy: 'Rabatt gewährt von'
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
        noSignature: 'Firma del cliente: ESPERANDO FIRMA',
        discountTitle: 'DESCUENTO APLICADO',
        discountAmount: 'Importe del descuento',
        discountReason: 'Motivo del descuento',
        discountBy: 'Descuento otorgado por'
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
        noSignature: 'Handtekening klant: WACHT OP HANDTEKENING',
        discountTitle: 'TOEGEKENDE KORTING',
        discountAmount: 'Kortingsbedrag',
        discountReason: 'Reden korting',
        discountBy: 'Korting gegeven door'
      }
    };
    
    const pt = PROTOCOL_TRANS[deliveryEmailLanguage] || PROTOCOL_TRANS.pl;
    
    const subject = `${t.subject} ${order.nrWlasny}`;
    
    // Uwagi klienta - sprawdzamy WSZYSTKIE możliwe pola
    const uwagiDoWyslania = clientRemarks || order.uwagiPrzyDostawie || order.deliveryRemarks || '';
    
    // Obliczenia płatności - POPRAWIONE
    const zaplaconoPrzedDostawa = order.platnosci?.zaplacono || order.platnosci?.zaliczka || 0;
    
    // Oryginalna kwota do zapłaty (PRZED rabatem) = cena - zaliczka
    const originalDoZaplaty = order.platnosci?.originalDoZaplaty || (cenaCalkowita - zaplaconoPrzedDostawa);
    
    // Kwota rabatu
    const rabatKwota = hasDiscount ? rabat.kwota : 0;
    
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
   ├─ Udzielony przez: ${rabat.kierowca || user.name}
   ├─ Data: ${formatDate(rabat.data || dataPlatnosci)}
   └─ Powód: ${rabat.powod || 'Nie podano'}`;
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
    
    // Protokół odbioru jako tekst
    const protocolText = `

═══════════════════════════════════════════════════════════
📋 ${pt.protocolTitle}
═══════════════════════════════════════════════════════════

${pt.orderNumber}: ${order.nrWlasny}
${pt.deliveryDate}: ${formatDate(dataPlatnosci)}
${pt.driver}: ${user.name}

───────────────────────────────────────────────────────────
${pt.product}:
${order.towar || '-'}

${pt.value}: ${cenaCalkowita.toFixed(2)} ${walutaSymbol}
${hasDiscount ? `${pt.discountAmount}: -${rabat.kwota.toFixed(2)} ${walutaSymbol}` : ''}
───────────────────────────────────────────────────────────

${pt.recipient}: ${order.klient?.imie || '-'}
${pt.address}: ${order.klient?.adres || '-'}

───────────────────────────────────────────────────────────
${pt.declaration}

${pt.clientRemarks}: ${uwagiDoWyslania || pt.noRemarks}

${hasSignature ? pt.signature : pt.noSignature}
═══════════════════════════════════════════════════════════`;
    
    const body = `${t.greeting} ${order.klient?.imie || t.client},

${t.intro}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ${t.title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔢 ${t.orderNumber}: ${order.nrWlasny}
📅 ${t.deliveryDate}: ${formatDate(dataPlatnosci)}
🚚 ${t.driver}: ${user.name}

📦 ${t.product}:
${order.towar || '-'}
${paymentSummary}
${protocolText}
${hasPhotos ? `\n📸 Zdjęcia dostawy: ${order.zdjeciaDostawy.length} zdjęć w załączniku` : ''}

${t.thanks}
${t.welcome}

${t.regards},
${t.team}

---
📧 Ta wiadomość została wysłana automatycznie. Prosimy nie odpowiadać na ten email.`;

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
      const signatureUrl = typeof order.podpisKlienta === 'string' 
        ? order.podpisKlienta 
        : order.podpisKlienta.url;
      
      if (signatureUrl && typeof signatureUrl === 'string' && signatureUrl.includes(',')) {
        const signatureBase64 = signatureUrl.split(',')[1];
        if (signatureBase64) {
          attachments.push({
            filename: `podpis_${order.nrWlasny}.png`,
            content: signatureBase64
          });
        }
      }
    }

    // Wyślij przez MailerSend z załącznikami
    sendEmailViaMailerSend(
      order.klient.email,
      order.klient.imie,
      subject,
      body,
      null,
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
                    
                    if (order.produkty && order.produkty.length > 0) {
                      // Zamówienie łączone - sumuj tylko produkty tego kierowcy
                      order.produkty.forEach(p => {
                        const prodDriverId = p.kierowca || order.przypisanyKierowca;
                        if (prodDriverId === user.id) {
                          if (p.doPobrania > 0) {
                            myAmount += p.doPobrania;
                          }
                          // Pobierz metodę pobrania i notatkę
                          if (p.metodaPobrania && !metodaPobrania) {
                            metodaPobrania = p.metodaPobrania;
                          }
                          if (p.notatkaKierowcy && !notatkaKierowcy) {
                            notatkaKierowcy = p.notatkaKierowcy;
                          }
                        }
                      });
                    } else {
                      // Stare zamówienie - sprawdź czy jest przypisane do tego kierowcy
                      if (order.przypisanyKierowca === user.id) {
                        myAmount = order.platnosci?.doZaplaty || 0;
                      }
                    }
                    
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
                            {myAmount > 0 && (
                              <div className="payment-amount">{formatCurrency(myAmount, order.platnosci?.waluta)}</div>
                            )}
                          </div>
                          
                          {/* Metoda pobrania */}
                          {metodaPobrania && metodaPobrania !== 'oplacone' && (
                            <div className="payment-method-info">
                              <span className="method-badge">
                                {metodaLabels[metodaPobrania]?.icon || '💵'} {metodaLabels[metodaPobrania]?.name || 'Gotówka'}
                              </span>
                            </div>
                          )}
                          
                          {(order.platnosci?.zaliczka > 0 || order.platnosci?.zaplacono > 0) && (
                            <div className="payment-advance-info">
                              💳 Klient wpłacił już zaliczkę: <strong>{formatCurrency(order.platnosci?.zaplacono || order.platnosci?.zaliczka, order.platnosci?.waluta)}</strong>
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
                        {(order.platnosci?.doZaplaty > 0 || (order.rabatyKierowcow && order.rabatyKierowcow[user.id]) || order.rabatPrzyDostawie) && (() => {
                          // Pobierz rabat tego kierowcy (z moich produktów)
                          const myProductIndexes = order._myProductIndexes || [];
                          const mojRabatZProduktu = myProductIndexes.length > 0 && order.produkty
                            ? order.produkty.find((p, idx) => myProductIndexes.includes(idx) && p.rabat)?.rabat
                            : null;
                          const mojRabat = mojRabatZProduktu || order.rabatyKierowcow?.[user.id] || (order.rabatPrzyDostawie?.kierowcaId === user.id ? order.rabatPrzyDostawie : null);
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
                      ? order.produkty.find((p, idx) => myProductIndexes.includes(idx) && p.rabat)?.rabat
                      : null;
                    const mojRabat = mojRabatZProduktu || order.rabatyKierowcow?.[user.id] || (order.rabatPrzyDostawie?.kierowcaId === user.id ? order.rabatPrzyDostawie : null);
                    if (mojRabat) {
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
        <div className="modal-overlay" onClick={() => setShowNotes(null)}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📝 Uwagi i daty</h2>
              <button className="btn-close" onClick={() => setShowNotes(null)}>×</button>
            </div>
            <div className="modal-body">
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
        <div className="modal-overlay" onClick={() => setShowDiscount(null)}>
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
                  ? order.produkty.find((p, idx) => myProductIndexes.includes(idx) && p.rabat)?.rabat
                  : null;
                const existingDiscount = mojRabatZProduktu || order.rabatyKierowcow?.[user.id];
                
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
        <div className="modal-overlay" onClick={() => setShowPhotoManager(null)}>
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
        <div className="modal-overlay" onClick={() => setShowSignature(null)}>
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
        <div className="modal-overlay" onClick={() => setShowDeliveryConfirmation(null)}>
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
        <div className="modal-overlay" onClick={() => setShowStatusChangeEmail(null)}>
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
        <div className="modal-overlay" onClick={() => { setShowTripsModal(false); cancelEditTrip(); }}>
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
        <div className="modal-overlay" onClick={() => { setShowTransportRatesModal(false); setEditingRate(null); }}>
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
      <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
      <div className="modal-overlay" onClick={onClose}>
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
      <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
  const [showPriceListManager, setShowPriceListManager] = useState(false); // Cenniki
  const [showProductSearch, setShowProductSearch] = useState(false); // Wyszukiwarka produktów
  const [showDriverTripsDetail, setShowDriverTripsDetail] = useState(null); // Szczegóły wyjazdów kierowcy
  const [editingContractor, setEditingContractor] = useState(null); // Do edycji danych kontrahenta przez admina
  const [emailModal, setEmailModal] = useState(null);
  const [popupNotification, setPopupNotification] = useState(null);
  const [leads, setLeads] = useState([]);
  
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

  const prevNotifCount = useRef(0);
  const prevMessageCount = useRef(0);
  const settingsMenuRef = useRef(null);

  const drivers = users.filter(u => u.role === 'driver');
  const isContractor = user?.role === 'contractor';
  const isAdmin = user?.role === 'admin';

  // Zamknij menu po kliknięciu poza nim
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target)) {
        setShowSettingsMenu(false);
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
      setLoading(false);
    };
    init();

    const unsubOrders = subscribeToOrders(setOrders);
    const unsubUsers = subscribeToUsers(setUsers);
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
    };
  }, []);

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

  const addNotif = async (data) => {
    await addNotification({
      ...data,
      createdAt: new Date().toISOString(),
      resolved: false,
      forContractor: data.forContractor || null
    });
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
    
    // Zapisz zmianę statusu
    await updateOrder(orderId, {
      ...order,
      status: newStatus,
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
      const d = getDaysUntilPickup(o.dataOdbioru);
      if (d === null) return false;
      if (urgencyFilter === 'today' && d !== 0) return false;
      if (urgencyFilter === '3days' && !(d >= 0 && d <= 3)) return false;
      if (urgencyFilter === 'week' && !(d >= 0 && d <= 7)) return false;
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

            <button className="btn-secondary complaint-btn" onClick={() => setShowComplaintsPanel(true)}>
              📋 Reklamacje ({visibleComplaints.filter(c => c.status !== 'rozwiazana' && c.status !== 'odrzucona').length})
            </button>

            {(isAdmin || user?.role === 'worker') && (
              <button className="btn-secondary leads-btn" onClick={() => setShowLeadsPanel(true)}>
                🎯 Zainteresowani ({leads.filter(l => !['zamowil', 'rezygnacja'].includes(l.status)).length})
              </button>
            )}

            {/* Przycisk Kontakty - dla admina i pracownika */}
            {(isAdmin || user?.role === 'worker') && (
              <button className="btn-secondary contacts-btn" onClick={() => setShowContactsPanel(true)}>
                📇 Kontakty
              </button>
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
                    <button onClick={() => { setShowProducersModal(true); setShowSettingsMenu(false); }}>
                      🏭 Producenci
                    </button>
                    <button onClick={() => { setShowPriceListManager(true); setShowSettingsMenu(false); }}>
                      📋 Cenniki produktów
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
            <button className="btn-primary" onClick={() => { setEditingOrder(null); setShowOrderModal(true); }}>
              ➕ Nowe zamówienie
            </button>
            <input
              className="search-input"
              placeholder="🔍 Szukaj (nr, klient, adres, tel...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="filters">
          <div className="filter-buttons">
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
              <div className="filter-group">
                <label>📅 Sortuj:</label>
                <select value={dateSort} onChange={e => setDateSort(e.target.value)}>
                  <option value="newest">Najnowsze</option>
                  <option value="oldest">Najstarsze</option>
                </select>
              </div>
            )}

            <div className="filter-group">
              <label>🌍 Kraj:</label>
              <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
                <option value="all">Wszystkie kraje</option>
                {orderCountries.map(code => {
                  const c = getCountry(code);
                  return <option key={code} value={code}>{c?.flag} {c?.name}</option>;
                })}
              </select>
            </div>

            <div className="filter-group">
              <label>⏰ Pilność:</label>
              <div className="urgency-filters">
                {[{ id: 'all', l: 'Wszystkie' }, { id: 'today', l: '🔴 Dziś' }, { id: '3days', l: '🟠 3 dni' }, { id: 'week', l: '🟢 7 dni' }].map(u => (
                  <button key={u.id} onClick={() => setUrgencyFilter(u.id)} className={`filter-btn small ${urgencyFilter === u.id ? 'active' : ''}`}>
                    {u.l}
                  </button>
                ))}
              </div>
            </div>

            {creators.length > 1 && (
              <div className="filter-group">
                <label>👤 Twórca:</label>
                <select value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
                  <option value="all">Wszyscy</option>
                  {creators.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {drivers.length > 0 && !isContractor && (
              <div className="filter-group">
                <label>🚚 Kierowca:</label>
                <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}>
                  <option value="all">Wszyscy</option>
                  <option value="unassigned">Nieprzypisani</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}

            {Object.keys(producers).length > 0 && !isContractor && (
              <div className="filter-group">
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

      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}

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
        <div className="modal-overlay" onClick={() => setShowDriverTripsDetail(null)}>
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

      {viewingOrder && (
        <OrderDetailModal
          order={viewingOrder.order || viewingOrder}
          selectedProductIndex={viewingOrder.productIndex}
          onClose={() => setViewingOrder(null)}
          producers={producers}
          drivers={drivers}
          onDelete={handleDeleteOrder}
          isContractor={isContractor}
          onUpdateOrder={handleSaveOrder}
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
        <div className="modal-overlay" onClick={() => setStatusChangeModal(null)}>
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
    </div>
  );
};

export default App;
