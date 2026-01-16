import React, { useState, useEffect, useRef } from 'react';
import {
  subscribeToOrders, addOrder, updateOrder, deleteOrder,
  subscribeToUsers, addUser, updateUser, deleteUser,
  subscribeToProducers, addProducer, updateProducer, deleteProducer,
  subscribeToNotifications, addNotification, updateNotification, deleteNotification,
  subscribeToComplaints, addComplaint, updateComplaint, deleteComplaint,
  subscribeToLeads, addLead, updateLead, deleteLead,
  subscribeToMessages, addMessage, updateMessage,
  initializeDefaultData
} from './firebase';
import { exportToExcel, autoSyncToGoogleSheets, setGoogleScriptUrl, getGoogleScriptUrl } from './export';
import './App.css';

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

const OrderDetailModal = ({ order, onClose, producers, drivers, onDelete, isContractor }) => {
  const [previewImage, setPreviewImage] = useState(null);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [showDeliveryEmailModal, setShowDeliveryEmailModal] = useState(false);
  const [deliveryEmailLang, setDeliveryEmailLang] = useState('pl');
  const status = getStatus(order.status);
  const country = getCountry(order.kraj);
  const days = getDaysUntilPickup(order.dataOdbioru);
  const urgency = getUrgencyStyle(days);
  const producer = Object.values(producers).find(p => p.id === order.zaladunek);
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);

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

    const mailtoLink = `mailto:${order.klient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
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
    const mailtoLink = `mailto:${order.klient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
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
              {urgency && <span className={`urgency-badge ${urgency.blink ? 'blink' : ''}`} style={{ background: urgency.bg, color: urgency.color }}>⏰ {urgency.label}</span>}
            </div>
            <span className="status-badge" style={{ background: status?.bgColor, color: status?.color }}>{status?.icon} {status?.name}</span>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="detail-section">
            <label>📦 TOWAR</label>
            <p>{order.towar}</p>
          </div>

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
// MODAL EDYCJI ZAMÓWIENIA - POPRAWIONY (zamyka się po zapisie)
// ============================================

const OrderModal = ({ order, onSave, onClose, producers, drivers, currentUser, orders, isContractor, isAdmin, exchangeRates }) => {
  const [form, setForm] = useState(order || {
    nrWlasny: '',
    kraj: 'PL',
    status: 'nowe',
    dataZlecenia: new Date().toISOString().split('T')[0],
    towar: '',
    zaladunek: '',
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
    
    // Otwórz klienta email z wypełnioną treścią
    const mailtoLink = `mailto:${form.klient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
    
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
    
    // Marża w PLN
    const marzaPLN = cenaNettoPLN - zakupNettoPLN - transportNettoPLN;
    const marzaProcentowa = cenaNettoPLN > 0 ? Math.round(marzaPLN / cenaNettoPLN * 100) : 0;
    
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
      marzaProcentowa
    };
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(form, currentUser);
    setSaving(false);
    onClose(); // ZAMKNIJ MODAL PO ZAPISIE
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-form" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{order ? '✏️ Edytuj' : '➕ Nowe'} zamówienie</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label>KRAJ DOSTAWY</label>
              <select value={form.kraj || 'PL'} onChange={e => setForm({ ...form, kraj: e.target.value })}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>NR ZAMÓWIENIA</label>
              <input value={form.nrWlasny} onChange={e => setForm({ ...form, nrWlasny: e.target.value })} placeholder="Auto" />
            </div>
            {!isContractor && (
              <div className="form-group">
                <label>STATUS</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>DATA ZLECENIA</label>
              <input type="date" value={form.dataZlecenia} onChange={e => setForm({ ...form, dataZlecenia: e.target.value })} />
            </div>
          </div>

          {!isContractor && (
            <div className="form-grid">
              <div className="form-group">
                <label>PRODUCENT</label>
                <select value={form.zaladunek} onChange={e => setForm({ ...form, zaladunek: e.target.value })}>
                  <option value="">-- Wybierz producenta --</option>
                  {Object.values(producers).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>KIEROWCA</label>
                <select value={form.przypisanyKierowca || ''} onChange={e => setForm({ ...form, przypisanyKierowca: e.target.value || null })}>
                  <option value="">-- Wybierz kierowcę --</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>🚚 {d.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="form-group full">
            <label>TOWAR</label>
            <textarea value={form.towar} onChange={e => setForm({ ...form, towar: e.target.value })} rows={3} placeholder="Szczegółowy opis zamówienia..." />
          </div>

          <div className="form-section">
            <h3>👤 Dane klienta</h3>
            <div className="form-grid">
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
                      <div 
                        key={idx} 
                        className="suggestion-item"
                        onMouseDown={() => selectSuggestion(s)}
                      >
                        <div className="suggestion-name">{s.imie}</div>
                        <div className="suggestion-details">
                          {s.telefon && <span>📞 {s.telefon}</span>}
                          {s.email && <span>✉️ {s.email}</span>}
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
              <div className="form-group span-2">
                <label>ADRES DOSTAWY</label>
                <input value={form.klient?.adres || ''} onChange={e => updateKlient('adres', e.target.value)} placeholder="ul. Przykładowa 1, 00-000 Miasto" />
              </div>
              <div className="form-group">
                <label>EMAIL</label>
                <input value={form.klient?.email || ''} onChange={e => updateKlient('email', e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="form-group">
                <label>LINK DO FACEBOOK</label>
                <input value={form.klient?.facebookUrl || ''} onChange={e => updateKlient('facebookUrl', e.target.value)} placeholder="https://facebook.com/..." />
              </div>
            </div>
          </div>

          <div className="form-section payment">
            <h3>💰 Płatności</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>WALUTA</label>
                <select value={form.platnosci?.waluta || 'PLN'} onChange={e => updatePlatnosci('waluta', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>CENA CAŁKOWITA</label>
                <input type="number" value={form.platnosci?.cenaCalkowita || ''} onChange={e => updatePlatnosci('cenaCalkowita', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label>ZAPŁACONO</label>
                <input type="number" value={form.platnosci?.zaplacono || ''} onChange={e => updatePlatnosci('zaplacono', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label>METODA PŁATNOŚCI</label>
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
                <input type="number" value={form.platnosci?.doZaplaty || 0} readOnly className={form.platnosci?.doZaplaty > 0 ? 'unpaid' : 'paid'} />
              </div>
            </div>

            {/* PŁATNOŚĆ PRZY DOSTAWIE - dla kierowcy */}
            {form.platnosci?.doZaplaty > 0 && (
              <div className="delivery-payment-section">
                <h4>🚚 Płatność przy dostawie</h4>
                <p className="delivery-payment-info">
                  Klient musi jeszcze zapłacić: <strong>{formatCurrency(form.platnosci.doZaplaty, form.platnosci?.waluta)}</strong>
                </p>
                <div className="form-grid">
                  <div className="form-group">
                    <label>JAK KLIENT ZAPŁACI RESZTĘ? *</label>
                    <select 
                      value={form.platnosci?.metodaPrzyDostawie || 'gotowka'} 
                      onChange={e => updatePlatnosci('metodaPrzyDostawie', e.target.value)}
                      className="delivery-payment-select"
                    >
                      {DELIVERY_PAYMENT_METHODS.filter(m => m.id !== 'brak').map(m => (
                        <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>UWAGI DO PŁATNOŚCI</label>
                    <input 
                      type="text" 
                      value={form.platnosci?.uwagiPlatnosc || ''} 
                      onChange={e => updatePlatnosci('uwagiPlatnosc', e.target.value)}
                      placeholder="np. Klient poprosi o fakturę, czeka na kredyt..."
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SEKCJA KOSZTÓW - TYLKO DLA ADMINA */}
          {isAdmin && (
            <div className="form-section costs">
              <h3>📊 Koszty i marża (widoczne tylko dla admina)</h3>
              
              {/* Wiersz 1: Stawka VAT */}
              <div className="form-grid">
                <div className="form-group">
                  <label>STAWKA VAT (%)</label>
                  <select value={form.koszty?.vatRate || 23} onChange={e => updateKoszty('vatRate', parseInt(e.target.value))}>
                    <option value={23}>23% (standard)</option>
                    <option value={8}>8%</option>
                    <option value={5}>5%</option>
                    <option value={0}>0% (zwolniony)</option>
                  </select>
                </div>
              </div>

              {/* KOSZT TOWARU */}
              <div className="cost-section">
                <h4>🏭 Koszt towaru</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>WALUTA</label>
                    <select value={form.koszty?.waluta || 'PLN'} onChange={e => updateKoszty('waluta', e.target.value)}>
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.symbol}) {exchangeRates && exchangeRates[c.code] && c.code !== 'PLN' ? `• ${exchangeRates[c.code].toFixed(4)} PLN` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>KOSZT BRUTTO</label>
                    <div className="input-with-currency">
                      <input 
                        type="number" 
                        step="0.01"
                        value={form.koszty?.zakupBrutto || ''} 
                        onChange={e => updateKoszty('zakupBrutto', parseFloat(e.target.value) || 0)} 
                        placeholder="0.00" 
                      />
                      <span className="currency-label">{getCurrency(form.koszty?.waluta || 'PLN').symbol}</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>KOSZT NETTO (auto)</label>
                    <div className="input-with-currency">
                      <input 
                        type="number" 
                        step="0.01"
                        value={form.koszty?.zakupNetto || ''} 
                        onChange={e => updateKoszty('zakupNetto', parseFloat(e.target.value) || 0)} 
                        placeholder="0.00" 
                      />
                      <span className="currency-label">{getCurrency(form.koszty?.waluta || 'PLN').symbol}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* KOSZT TRANSPORTU */}
              <div className="cost-section">
                <h4>🚚 Koszt transportu</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>WALUTA</label>
                    <select value={form.koszty?.transportWaluta || 'PLN'} onChange={e => updateKoszty('transportWaluta', e.target.value)}>
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.symbol}) {exchangeRates && exchangeRates[c.code] && c.code !== 'PLN' ? `• ${exchangeRates[c.code].toFixed(4)} PLN` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>KOSZT BRUTTO</label>
                    <div className="input-with-currency">
                      <input 
                        type="number" 
                        step="0.01"
                        value={form.koszty?.transportBrutto || ''} 
                        onChange={e => updateKoszty('transportBrutto', parseFloat(e.target.value) || 0)} 
                        placeholder="0.00" 
                      />
                      <span className="currency-label">{getCurrency(form.koszty?.transportWaluta || 'PLN').symbol}</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>KOSZT NETTO (auto)</label>
                    <div className="input-with-currency">
                      <input 
                        type="number" 
                        step="0.01"
                        value={form.koszty?.transportNetto || ''} 
                        onChange={e => updateKoszty('transportNetto', parseFloat(e.target.value) || 0)} 
                        placeholder="0.00" 
                      />
                      <span className="currency-label">{getCurrency(form.koszty?.transportWaluta || 'PLN').symbol}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Podsumowanie marży */}
              <div className="margin-summary">
                <div className="margin-breakdown">
                  <div className="margin-item">
                    <span className="margin-label">Cena od klienta (brutto)</span>
                    <span className="margin-value">
                      {formatCurrency(calcMarza().cenaBrutto, form.platnosci?.waluta)}
                      {form.platnosci?.waluta !== 'PLN' && (
                        <small className="converted"> = {formatCurrency(calcMarza().cenaBruttoPLN, 'PLN')}</small>
                      )}
                    </span>
                  </div>
                  <div className="margin-item">
                    <span className="margin-label">Cena od klienta (netto po VAT {form.koszty?.vatRate || 23}%)</span>
                    <span className="margin-value">
                      {formatCurrency(calcMarza().cenaNetto, form.platnosci?.waluta)}
                      {form.platnosci?.waluta !== 'PLN' && (
                        <small className="converted"> = {formatCurrency(calcMarza().cenaNettoPLN, 'PLN')}</small>
                      )}
                    </span>
                  </div>
                  <div className="margin-item subtract">
                    <span className="margin-label">− Koszt towaru (netto)</span>
                    <span className="margin-value">
                      {formatCurrency(calcMarza().zakupNettoOriginal, form.koszty?.waluta)}
                      {form.koszty?.waluta !== 'PLN' && (
                        <small className="converted"> = {formatCurrency(calcMarza().zakupNettoPLN, 'PLN')}</small>
                      )}
                    </span>
                  </div>
                  <div className="margin-item subtract">
                    <span className="margin-label">− Transport (netto)</span>
                    <span className="margin-value">
                      {formatCurrency(calcMarza().transportNettoOriginal, form.koszty?.transportWaluta)}
                      {form.koszty?.transportWaluta !== 'PLN' && (
                        <small className="converted"> = {formatCurrency(calcMarza().transportNettoPLN, 'PLN')}</small>
                      )}
                    </span>
                  </div>
                </div>
                <div className={`margin-total ${calcMarza().marzaPLN >= 0 ? 'positive' : 'negative'}`}>
                  <span className="margin-label">= MARŻA NETTO (PLN)</span>
                  <span className="margin-value">
                    {formatCurrency(calcMarza().marzaPLN, 'PLN')}
                    <span className="margin-percent">({calcMarza().marzaProcentowa}%)</span>
                  </span>
                </div>
              </div>

              {/* Informacja o kursach */}
              {exchangeRates && (
                <div className="exchange-rates-info">
                  <small>💱 Kursy NBP: {Object.entries(exchangeRates).filter(([k]) => ['EUR', 'USD', 'GBP', 'CHF'].includes(k)).map(([k, v]) => `${k}: ${v.toFixed(4)}`).join(' | ')}</small>
                </div>
              )}
            </div>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label>PLANOWANA DATA ODBIORU</label>
              <input type="date" value={form.dataOdbioru || ''} onChange={e => setForm({ ...form, dataOdbioru: e.target.value })} />
            </div>
            <div className="form-group">
              <label>PLANOWANA DATA DOSTAWY</label>
              <input type="date" value={form.dataDostawy || ''} onChange={e => setForm({ ...form, dataDostawy: e.target.value })} />
            </div>
          </div>

          <div className="form-group full">
            <label>UWAGI</label>
            <textarea value={form.uwagi || ''} onChange={e => setForm({ ...form, uwagi: e.target.value })} rows={2} placeholder="Dodatkowe uwagi..." />
          </div>
        </div>

        <div className="modal-footer">
          <div className="footer-left">
            {form.klient?.email && (
              <button 
                type="button"
                className="btn-send-confirmation" 
                onClick={() => setShowConfirmationModal(true)}
                title="Wyślij potwierdzenie zamówienia na email klienta"
              >
                📧 Wyślij potwierdzenie
              </button>
            )}
          </div>
          <div className="footer-right">
            <button className="btn-secondary" onClick={onClose}>Anuluj</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '⏳ Zapisuję...' : '💾 Zapisz zamówienie'}
            </button>
          </div>
        </div>

        {/* Modal podglądu potwierdzenia */}
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
    await onSave(list);
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
    await onSave(list);
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

const OrderCard = ({ order, onEdit, onStatusChange, onEmailClick, onClick, producers, drivers, onDelete, isAdmin, isContractor, exchangeRates, currentUser }) => {
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
    
    // Koszty - konwertuj do PLN
    const zakupNetto = order.koszty?.zakupNetto || 0;
    const zakupNettoPLN = convertToPLN(zakupNetto, order.koszty?.waluta);
    
    const transportNetto = order.koszty?.transportNetto || order.koszty?.transport || 0;
    const transportNettoPLN = convertToPLN(transportNetto, order.koszty?.transportWaluta || order.koszty?.waluta);
    
    // Marża w PLN
    return Math.round((cenaNettoPLN - zakupNettoPLN - transportNettoPLN) * 100) / 100;
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
          {urgency && <span className={`urgency-badge small ${urgency.blink ? 'blink' : ''}`} style={{ background: urgency.bg, color: urgency.color }}>⏰{urgency.label}</span>}
        </div>
        <select
          value={order.status}
          onClick={e => e.stopPropagation()}
          onChange={e => { e.stopPropagation(); onStatusChange(order.id, e.target.value); }}
          className="status-select"
          style={{ background: status?.bgColor, color: status?.color }}
        >
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
        </select>
      </div>

      <div className="order-card-body">
        <p className="order-product">{order.towar || 'Brak opisu'}</p>

        <div className="order-client">
          <div className="client-name">{order.klient?.imie || '—'}</div>
          <div className="client-address">📍 {order.klient?.adres || '—'}</div>
        </div>

        <div className="order-tags">
          {producer && !isContractor && <span className="tag tag-producer">🏭 {producer.name}</span>}
          {order.dataOdbioru && <span className="tag tag-date">📅 {formatDate(order.dataOdbioru)}</span>}
          {driver && <span className="tag tag-driver">🚚 {driver.name}</span>}
        </div>

        <div className="order-payment">
          {order.platnosci?.cenaCalkowita > 0 && (
            <span>Cena: <strong>{formatCurrency(order.platnosci.cenaCalkowita, order.platnosci.waluta)}</strong></span>
          )}
          {order.platnosci?.doZaplaty > 0 && (
            <span className="unpaid">Do zapłaty: <strong>{formatCurrency(order.platnosci.doZaplaty, order.platnosci.waluta)}</strong></span>
          )}
          {order.platnosci?.doZaplaty === 0 && order.platnosci?.cenaCalkowita > 0 && (
            <span className="paid-badge">✓ Opłacone</span>
          )}
          {/* Marża - tylko dla admina - ZAWSZE W PLN */}
          {isAdmin && order.koszty && (order.koszty.zakupNetto > 0 || order.koszty.zakupBrutto > 0) && (
            <span className={calcMarzaPLN() >= 0 ? 'margin-badge positive' : 'margin-badge negative'}>
              📊 Marża: <strong>{formatCurrency(calcMarzaPLN(), 'PLN')}</strong>
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

const DriverPanel = ({ user, orders, producers, onUpdateOrder, onAddNotification, onLogout }) => {
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

  const myOrders = orders.filter(o => o.przypisanyKierowca === user.id);
  const toPickup = myOrders.filter(o => ['potwierdzone', 'w_produkcji', 'gotowe_do_odbioru'].includes(o.status));
  const pickedUp = myOrders.filter(o => o.status === 'odebrane');
  const inTransit = myOrders.filter(o => o.status === 'w_transporcie');
  const delivered = myOrders.filter(o => o.status === 'dostarczone');

  const tabs = [
    { id: 'pickup', label: 'Do odbioru', count: toPickup.length, icon: '📦' },
    { id: 'picked', label: 'Odebrane', count: pickedUp.length, icon: '🚚' },
    { id: 'transit', label: 'W transporcie', count: inTransit.length, icon: '🚗' },
    { id: 'delivered', label: 'Dostarczone', count: delivered.length, icon: '✔️' },
  ];

  const getTabOrders = () => {
    switch (activeTab) {
      case 'pickup': return toPickup;
      case 'picked': return pickedUp;
      case 'transit': return inTransit;
      case 'delivered': return delivered;
      default: return [];
    }
  };
  const changeStatus = async (order, newStatus) => {
    const oldStatusName = getStatus(order.status)?.name || order.status;
    const statusName = getStatus(newStatus).name;
    
    await onUpdateOrder(order.id, {
      ...order,
      status: newStatus,
      historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: `Status: ${statusName}` }]
    });
    onAddNotification({ icon: '🔄', title: `Status: ${order.nrWlasny}`, message: `Kierowca ${user.name} zmienił status na: ${statusName}`, orderId: order.id });
    
    // Dla statusów "odebrane" i "w_transporcie" - zapytaj o email
    if ((newStatus === 'odebrane' || newStatus === 'w_transporcie') && order.klient?.email) {
      setShowStatusChangeEmail({
        order,
        oldStatus: oldStatusName,
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

    const mailtoLink = `mailto:${order.klient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
    setShowStatusChangeEmail(null);
  };

  // Zapisz rabat
  const saveDiscount = async () => {
    const order = orders.find(o => o.id === showDiscount);
    if (!order) return;
    
    const amount = parseFloat(discountAmount) || 0;
    if (amount <= 0) {
      alert('Podaj kwotę rabatu');
      return;
    }

    const rabat = {
      kwota: amount,
      powod: discountReason || 'Brak podanego powodu',
      data: new Date().toISOString(),
      kierowca: user.name
    };

    // Aktualizuj płatności
    const newDoZaplaty = Math.max(0, (order.platnosci?.doZaplaty || 0) - amount);

    await onUpdateOrder(order.id, {
      ...order,
      rabatPrzyDostawie: rabat,
      platnosci: {
        ...order.platnosci,
        doZaplaty: newDoZaplaty,
        rabat: amount
      },
      historia: [...(order.historia || []), { 
        data: new Date().toISOString(), 
        uzytkownik: user.name, 
        akcja: `Rabat przy dostawie: ${formatCurrency(amount, order.platnosci?.waluta)} - ${discountReason || 'brak powodu'}` 
      }]
    });

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

      const updatedPhotos = [...(currentOrder[field] || []), photo];

      await onUpdateOrder(orderId, {
        [field]: updatedPhotos,
        historia: [...(currentOrder.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: `Dodano zdjęcie ${type === 'pickup' ? 'odbioru' : 'dostawy'}` }]
      });

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
    const order = orders.find(o => o.id === showSignature);
    if (!order) return;
    const dataUrl = canvasRef.current.toDataURL();
    const now = new Date();
    
    // Tworzenie pełnej umowy odbioru
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
      podpis: { url: dataUrl, timestamp: now.toISOString() },
      jezyk: protocolLanguage, // Zapisz wybrany język
      trescUmowy: `Potwierdzam odbiór zamówienia nr ${order.nrWlasny}. Produkt: ${order.towar || 'brak opisu'}. ${!clientRemarks ? 'Nie zgłaszam uwag do produktu ani do dostawy.' : `Uwagi: ${clientRemarks}`}`
    };

    await onUpdateOrder(order.id, {
      ...order,
      podpisKlienta: { url: dataUrl, timestamp: now.toISOString(), by: user.name },
      umowaOdbioru: umowaOdbioru,
      historia: [...(order.historia || []), { 
        data: now.toISOString(), 
        uzytkownik: user.name, 
        akcja: `Podpis klienta${clientRemarks ? ` (z uwagami: ${clientRemarks})` : ' (bez uwag)'}` 
      }]
    });
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
  const openSignatureModal = (orderId) => {
    setClientRemarks('');
    setShowSignature(orderId);
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

  // Funkcja wysyłania potwierdzenia dostawy
  const sendDeliveryConfirmationEmail = (order) => {
    const t = DELIVERY_EMAIL_TRANSLATIONS[deliveryEmailLanguage] || DELIVERY_EMAIL_TRANSLATIONS.pl;
    const walutaSymbol = CURRENCIES.find(c => c.code === order.platnosci?.waluta)?.symbol || 'zł';
    const zaplacono = order.platnosci?.zaplacono || 0;
    const cenaCalkowita = order.platnosci?.cenaCalkowita || 0;
    const dataPlatnosci = order.potwierdzenieDostawy?.data || new Date().toISOString();
    const hasPhotos = order.zdjeciaDostawy && order.zdjeciaDostawy.length > 0;
    const hasSignature = order.podpisKlienta;
    
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
    
    const pt = PROTOCOL_TRANS[deliveryEmailLanguage] || PROTOCOL_TRANS.pl;
    
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
${pt.driver}: ${user.name}

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
🚚 ${t.driver}: ${user.name}

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

    const mailtoLink = `mailto:${order.klient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
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
          <button className="btn-logout" onClick={onLogout}>Wyloguj</button>
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

        <div className="driver-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`driver-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              <span className="tab-count">{t.count}</span>
              <span className="tab-label">{t.icon} {t.label}</span>
            </button>
          ))}
        </div>

        {getTabOrders().length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>Brak zamówień w tej kategorii</p>
          </div>
        ) : (
          <div className="driver-orders">
            {getTabOrders().map(order => {
              const status = getStatus(order.status);
              const producer = Object.values(producers).find(p => p.id === order.zaladunek);
              const country = getCountry(order.kraj);

              return (
                <div key={order.id} className="driver-order-card">
                  <div className="driver-order-header">
                    <div className="driver-order-title">
                      <span className="country-flag">{country?.flag}</span>
                      <span className="order-number">{order.nrWlasny}</span>
                    </div>
                    <span className="status-badge" style={{ background: status.bgColor, color: status.color }}>
                      {status.icon} {status.name}
                    </span>
                  </div>

                  <p className="driver-order-product">{order.towar}</p>

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

                  <div className="driver-section client-section">
                    <div className="section-title">👤 Klient</div>
                    <div className="section-name">{order.klient?.imie || '—'}</div>
                    <div className="section-detail">📍 {order.klient?.adres || '—'}</div>
                    <div className="section-contacts">
                      {order.klient?.telefon && <a href={`tel:${order.klient.telefon}`}>📞 {order.klient.telefon}</a>}
                      {order.klient?.facebookUrl && <a href={order.klient.facebookUrl} target="_blank" rel="noopener noreferrer">📘 Facebook</a>}
                    </div>
                  </div>

                  {order.platnosci?.doZaplaty > 0 && (
                    <div className="driver-payment-alert">
                      <div className="payment-header">
                        <div className="payment-label">💰 Do pobrania od klienta</div>
                        <div className="payment-amount">{formatCurrency(order.platnosci.doZaplaty, order.platnosci.waluta)}</div>
                      </div>
                      <div className="payment-details">
                        {order.platnosci.metodaPrzyDostawie && (
                          <div className="payment-method-badge">
                            {getDeliveryPaymentMethod(order.platnosci.metodaPrzyDostawie).icon} {getDeliveryPaymentMethod(order.platnosci.metodaPrzyDostawie).name}
                          </div>
                        )}
                        {!order.platnosci.metodaPrzyDostawie && (
                          <div className="payment-method-badge default">💵 Gotówka (domyślnie)</div>
                        )}
                      </div>
                      {order.platnosci.uwagiPlatnosc && (
                        <div className="payment-notes">📝 {order.platnosci.uwagiPlatnosc}</div>
                      )}
                    </div>
                  )}

                  {order.platnosci?.doZaplaty === 0 && order.platnosci?.cenaCalkowita > 0 && (
                    <div className="driver-payment-ok">
                      <span>✅ Zapłacone w całości</span>
                    </div>
                  )}

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
                          <button 
                            className="btn-driver photo camera" 
                            onClick={() => document.getElementById(`pickup-camera-${order.id}`).click()}
                          >
                            📸 Aparat
                          </button>
                          <input 
                            id={`pickup-camera-${order.id}`} 
                            type="file" 
                            accept="image/*" 
                            capture="environment"
                            style={{ display: 'none', position: 'absolute', left: '-9999px' }} 
                            onChange={(e) => handlePhotoCapture(order, 'pickup', e)} 
                          />
                          <button 
                            className="btn-driver photo gallery" 
                            onClick={() => document.getElementById(`pickup-gallery-${order.id}`).click()}
                          >
                            🖼️ Galeria
                          </button>
                          <input 
                            id={`pickup-gallery-${order.id}`} 
                            type="file" 
                            accept="image/*"
                            style={{ display: 'none', position: 'absolute', left: '-9999px' }} 
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
                          <button 
                            className="btn-driver photo camera" 
                            onClick={() => document.getElementById(`delivery-camera-${order.id}`).click()}
                          >
                            📸 Aparat
                          </button>
                          <input 
                            id={`delivery-camera-${order.id}`} 
                            type="file" 
                            accept="image/*" 
                            capture="environment"
                            style={{ display: 'none', position: 'absolute', left: '-9999px' }} 
                            onChange={(e) => handlePhotoCapture(order, 'delivery', e)} 
                          />
                          <button 
                            className="btn-driver photo gallery" 
                            onClick={() => document.getElementById(`delivery-gallery-${order.id}`).click()}
                          >
                            🖼️ Galeria
                          </button>
                          <input 
                            id={`delivery-gallery-${order.id}`} 
                            type="file" 
                            accept="image/*"
                            style={{ display: 'none', position: 'absolute', left: '-9999px' }} 
                            onChange={(e) => handlePhotoCapture(order, 'delivery', e)} 
                          />
                        </div>
                        <button className="btn-driver signature" onClick={() => openSignatureModal(order.id)}>✍️ Podpis klienta</button>
                        {order.platnosci?.doZaplaty > 0 && (
                          <button className="btn-driver discount" onClick={() => setShowDiscount(order.id)}>💸 Udziel rabatu</button>
                        )}
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

                  {/* Wyświetl info o rabacie jeśli był */}
                  {order.rabatPrzyDostawie && (
                    <div className="discount-info-card">
                      <span className="discount-badge">💸 Rabat: {formatCurrency(order.rabatPrzyDostawie.kwota, order.platnosci?.waluta)}</span>
                      <span className="discount-reason">{order.rabatPrzyDostawie.powod}</span>
                    </div>
                  )}
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

      {/* Modal rabatu */}
      {showDiscount && (
        <div className="modal-overlay" onClick={() => setShowDiscount(null)}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>💸 Udziel rabatu</h2>
              <button className="btn-close" onClick={() => setShowDiscount(null)}>×</button>
            </div>
            <div className="modal-body">
              {(() => {
                const order = orders.find(o => o.id === showDiscount);
                return order && (
                  <>
                    <div className="discount-order-info">
                      <p><strong>Zamówienie:</strong> {order.nrWlasny}</p>
                      <p><strong>Do zapłaty:</strong> {formatCurrency(order.platnosci?.doZaplaty, order.platnosci?.waluta)}</p>
                    </div>
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
                      <p>Nowa kwota do zapłaty: <strong>{formatCurrency(Math.max(0, (order.platnosci?.doZaplaty || 0) - (parseFloat(discountAmount) || 0)), order.platnosci?.waluta)}</strong></p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDiscount(null)}>Anuluj</button>
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
                const order = orders.find(o => o.id === showSignature);
                const now = new Date();
                return order && (
                  <>
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
          <div className="modal-content modal-small delivery-confirmation-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header delivery-confirmation-header">
              <h2>📧 Wysłać potwierdzenie dostawy?</h2>
              <button className="btn-close" onClick={() => setShowDeliveryConfirmation(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="delivery-confirm-info">
                <p><strong>Zamówienie:</strong> {showDeliveryConfirmation.nrWlasny}</p>
                <p><strong>Klient:</strong> {showDeliveryConfirmation.klient?.imie}</p>
                <p><strong>Email:</strong> {showDeliveryConfirmation.klient?.email}</p>
                
                <div className="form-group" style={{marginTop: '16px'}}>
                  <label>Język wiadomości i protokołu:</label>
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
                  {showDeliveryConfirmation.zdjeciaDostawy?.length > 0 && (
                    <p>📸 {showDeliveryConfirmation.zdjeciaDostawy.length} zdjęć z dostawy</p>
                  )}
                </div>
                
                <p className="delivery-confirm-question">
                  Czy chcesz wysłać klientowi email z potwierdzeniem dostawy?
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDeliveryConfirmation(null)}>
                ❌ Nie
              </button>
              <button className="btn-primary" onClick={() => sendDeliveryConfirmationEmail(showDeliveryConfirmation)}>
                ✅ Tak, wyślij
              </button>
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
  const [activeTab, setActiveTab] = useState('monthly'); // monthly, countries, creators
  
  const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

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
      if (creatorFilter !== 'all') {
        const creatorId = o.utworzonePrzez?.oddzial || o.kontrahentId;
        if (creatorId !== creatorFilter) return false;
      }
      return true;
    });
  };

  // Oblicz statystyki z tablicy zamówień
  const calcStatsFromOrders = (ordersList) => {
    let obrotBrutto = 0;
    let obrotNetto = 0;
    let kosztTowaru = 0;
    let kosztTransportu = 0;
    
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
    });

    const marza = obrotNetto - kosztTowaru - kosztTransportu;
    const marzaProc = obrotNetto > 0 ? (marza / obrotNetto * 100) : 0;

    return {
      zamowienia: ordersList.length,
      obrotBrutto: Math.round(obrotBrutto * 100) / 100,
      obrotNetto: Math.round(obrotNetto * 100) / 100,
      kosztTowaru: Math.round(kosztTowaru * 100) / 100,
      kosztTransportu: Math.round(kosztTransportu * 100) / 100,
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
            <div className={`summary-card profit ${yearSummary.marza >= 0 ? 'positive' : 'negative'}`}>
              <div className="summary-icon">💰</div>
              <div className="summary-content">
                <span className="summary-label">ZYSK / MARŻA</span>
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

  // Funkcja wysyłania emaila o zmianie statusu
  const sendStatusChangeEmail = (modalData) => {
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
Zespół obsługi zamówień`;

    const mailtoLink = `mailto:${order.klient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
    setStatusChangeModal(null);
  };

  const handleSaveUsers = async (newList) => {
    for (const old of users) {
      if (!newList.find(x => x.id === old.id) && old.username !== 'admin') {
        try { await deleteUser(old.id); } catch {}
      }
    }
    for (const u of newList) {
      if (!u.id || String(u.id).startsWith('new_')) {
        const payload = { ...u };
        delete payload.id;
        try { await addUser(payload); } catch {}
      } else {
        try { await updateUser(u.id, u); } catch {}
      }
    }
  };

  const handleSaveProducers = async (list) => {
    const currentIds = new Set(Object.keys(producers));
    const nextIds = new Set(list.map(p => p.id));
    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        try { await deleteProducer(id); } catch {}
      }
    }
    for (const p of list) {
      if (producers[p.id]) {
        try { await updateProducer(p.id, p); } catch {}
      } else {
        try { await addProducer(p); } catch {}
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
    if (filter !== 'all' && o.status !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [o.nrWlasny, o.towar, o.klient?.imie, o.klient?.adres, o.klient?.telefon, o.klient?.email].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (countryFilter !== 'all' && o.kraj !== countryFilter) return false;
    if (creatorFilter !== 'all' && (o.utworzonePrzez?.nazwa || '') !== creatorFilter) return false;
    if (driverFilter !== 'all') {
      if (driverFilter === 'unassigned') {
        if (o.przypisanyKierowca) return false;
      } else {
        if (o.przypisanyKierowca !== driverFilter) return false;
      }
    }
    if (producerFilter !== 'all') {
      if (producerFilter === 'unassigned') {
        if (o.zaladunek) return false;
      } else {
        if (o.zaladunek !== producerFilter) return false;
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
                    <button onClick={() => { setShowUsersModal(true); setShowSettingsMenu(false); }}>
                      👥 Użytkownicy
                    </button>
                    <button onClick={() => { setShowProducersModal(true); setShowSettingsMenu(false); }}>
                      🏭 Producenci
                    </button>
                    <button onClick={() => { setShowSettingsModal(true); setShowSettingsMenu(false); }}>
                      🔧 Konfiguracja
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
        <div className="top-bar">
          <div className="top-left">
            <button className="btn-primary" onClick={() => { setEditingOrder(null); setShowOrderModal(true); }}>
              ➕ Nowe zamówienie
            </button>

            {isAdmin && (
              <>
                <button className="btn-secondary" onClick={() => exportToExcel(filteredOrders)}>
                  📥 Export Excel
                </button>
                <button className="btn-secondary" onClick={() => autoSyncToGoogleSheets(filteredOrders)}>
                  🔄 Sync Sheets
                </button>
              </>
            )}
          </div>

          <div className="top-right">
            <input
              className="search-input"
              placeholder="Szukaj (nr, klient, adres, tel...)"
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
            {STATUSES.map(s => (
              <button
                key={s.id}
                onClick={() => setFilter(s.id)}
                className={`status-filter-btn ${filter === s.id ? 'active' : ''}`}
                style={{ background: filter === s.id ? s.color : s.bgColor, color: filter === s.id ? 'white' : s.color }}
              >
                <span className="sf-icon">{s.icon}</span>
                <span className="sf-count">{visibleOrders.filter(o => o.status === s.id).length}</span>
                <span className="sf-label">{s.name}</span>
              </button>
            ))}
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
              onEmailClick={(x, p) => setEmailModal({ order: x, producer: p })}
              onClick={x => setViewingOrder(x)}
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
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
          producers={producers}
          drivers={drivers}
          onDelete={handleDeleteOrder}
          isContractor={isContractor}
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
