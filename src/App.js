import React, { useState, useEffect, useRef } from 'react';
import {
  subscribeToOrders, addOrder, updateOrder, deleteOrder,
  subscribeToUsers, addUser, updateUser, deleteUser,
  subscribeToProducers, addProducer, updateProducer, deleteProducer,
  subscribeToNotifications, addNotification, updateNotification, deleteNotification,
  subscribeToComplaints, addComplaint, updateComplaint, deleteComplaint,
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

const OrderDetailModal = ({ order, onClose, producers, drivers, onDelete }) => {
  const [previewImage, setPreviewImage] = useState(null);
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
            {producer && (
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

          <HistoryPanel historia={order.historia} utworzonePrzez={order.utworzonePrzez} />
        </div>

        <div className="modal-footer">
          <button className="btn-danger" onClick={handleDelete}>🗑️ Usuń zamówienie</button>
          <button className="btn-secondary" onClick={onClose}>Zamknij</button>
        </div>
      </div>

      {/* Modal podglądu zdjęcia */}
      {previewImage && <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />}
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
      transport: 0,
      vatRate: 23 // domyślna stawka VAT
    },
    uwagi: '',
    dataOdbioru: '',
    dataDostawy: '',
    przypisanyKierowca: null,
    kontrahentId: isContractor ? currentUser.id : null
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order && form.kraj) {
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
    } else if (field === 'vatRate') {
      koszty.vatRate = value;
      // Przelicz brutto na nowo na podstawie netto
      if (koszty.zakupNetto > 0) {
        const newMultiplier = 1 + value / 100;
        koszty.zakupBrutto = Math.round(koszty.zakupNetto * newMultiplier * 100) / 100;
      }
    } else {
      koszty[field] = value;
    }
    
    setForm({ ...form, koszty });
  };

  // Konwersja waluty kosztów na walutę sprzedaży
  const convertToSalesСurrency = (amount, fromCurrency) => {
    const toCurrency = form.platnosci?.waluta || 'PLN';
    if (fromCurrency === toCurrency || !exchangeRates) return amount;
    
    // Przelicz przez PLN jako walutę bazową
    const rateFrom = exchangeRates[fromCurrency] || 1;
    const rateTo = exchangeRates[toCurrency] || 1;
    
    // amount w fromCurrency -> PLN -> toCurrency
    const inPLN = amount * rateFrom;
    return Math.round(inPLN / rateTo * 100) / 100;
  };

  // Wyliczenie marży (prawidłowe)
  // Cena brutto od klienta → Cena netto (÷1.23) → minus koszty zakupu netto → minus transport
  const calcMarza = () => {
    const cenaBrutto = form.platnosci?.cenaCalkowita || 0;
    const vatRate = form.koszty?.vatRate || 23;
    const vatMultiplier = 1 + vatRate / 100;
    
    // Cena netto od klienta
    const cenaNetto = cenaBrutto / vatMultiplier;
    
    // Koszty w walucie kosztów
    const zakupNetto = form.koszty?.zakupNetto || 0;
    const transport = form.koszty?.transport || 0;
    
    // Konwertuj koszty do waluty sprzedaży jeśli różne
    const kosztWaluta = form.koszty?.waluta || 'PLN';
    const zakupNettoConverted = convertToSalesСurrency(zakupNetto, kosztWaluta);
    const transportConverted = convertToSalesСurrency(transport, kosztWaluta);
    
    // Marża = cena netto - koszty zakupu netto - transport
    const marza = cenaNetto - zakupNettoConverted - transportConverted;
    
    return {
      cenaBrutto,
      cenaNetto: Math.round(cenaNetto * 100) / 100,
      zakupNetto: zakupNettoConverted,
      transport: transportConverted,
      marza: Math.round(marza * 100) / 100,
      marzaProcentowa: cenaNetto > 0 ? Math.round(marza / cenaNetto * 100) : 0
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
              <div className="form-group">
                <label>IMIĘ I NAZWISKO</label>
                <input value={form.klient?.imie || ''} onChange={e => updateKlient('imie', e.target.value)} placeholder="Jan Kowalski" />
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
          </div>

          {/* SEKCJA KOSZTÓW - TYLKO DLA ADMINA */}
          {isAdmin && (
            <div className="form-section costs">
              <h3>📊 Koszty i marża (widoczne tylko dla admina)</h3>
              
              {/* Wiersz 1: Waluta kosztów i stawka VAT */}
              <div className="form-grid">
                <div className="form-group">
                  <label>WALUTA KOSZTÓW</label>
                  <select value={form.koszty?.waluta || 'PLN'} onChange={e => updateKoszty('waluta', e.target.value)}>
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol}) {exchangeRates && exchangeRates[c.code] ? `- kurs: ${exchangeRates[c.code].toFixed(4)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
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

              {/* Wiersz 2: Koszty zakupu - auto przeliczanie */}
              <div className="costs-row">
                <div className="form-group">
                  <label>KOSZT ZAKUPU NETTO</label>
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
                  <small>Wpisz netto - brutto przeliczy się automatycznie</small>
                </div>
                <div className="form-group">
                  <label>KOSZT ZAKUPU BRUTTO</label>
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
                  <small>Lub wpisz brutto - netto przeliczy się automatycznie</small>
                </div>
                <div className="form-group">
                  <label>KOSZT TRANSPORTU (NETTO)</label>
                  <div className="input-with-currency">
                    <input 
                      type="number" 
                      step="0.01"
                      value={form.koszty?.transport || ''} 
                      onChange={e => updateKoszty('transport', parseFloat(e.target.value) || 0)} 
                      placeholder="0.00" 
                    />
                    <span className="currency-label">{getCurrency(form.koszty?.waluta || 'PLN').symbol}</span>
                  </div>
                </div>
              </div>

              {/* Wiersz 3: Podsumowanie marży */}
              <div className="margin-summary">
                <div className="margin-breakdown">
                  <div className="margin-item">
                    <span className="margin-label">Cena od klienta (brutto)</span>
                    <span className="margin-value">{formatCurrency(calcMarza().cenaBrutto, form.platnosci?.waluta)}</span>
                  </div>
                  <div className="margin-item">
                    <span className="margin-label">Cena od klienta (netto po VAT {form.koszty?.vatRate || 23}%)</span>
                    <span className="margin-value">{formatCurrency(calcMarza().cenaNetto, form.platnosci?.waluta)}</span>
                  </div>
                  <div className="margin-item subtract">
                    <span className="margin-label">− Koszt zakupu (netto)</span>
                    <span className="margin-value">
                      {formatCurrency(calcMarza().zakupNetto, form.platnosci?.waluta)}
                      {form.koszty?.waluta !== form.platnosci?.waluta && form.koszty?.zakupNetto > 0 && (
                        <small className="converted"> (z {formatCurrency(form.koszty?.zakupNetto, form.koszty?.waluta)})</small>
                      )}
                    </span>
                  </div>
                  <div className="margin-item subtract">
                    <span className="margin-label">− Transport (netto)</span>
                    <span className="margin-value">
                      {formatCurrency(calcMarza().transport, form.platnosci?.waluta)}
                      {form.koszty?.waluta !== form.platnosci?.waluta && form.koszty?.transport > 0 && (
                        <small className="converted"> (z {formatCurrency(form.koszty?.transport, form.koszty?.waluta)})</small>
                      )}
                    </span>
                  </div>
                </div>
                <div className={`margin-total ${calcMarza().marza >= 0 ? 'positive' : 'negative'}`}>
                  <span className="margin-label">= MARŻA NETTO</span>
                  <span className="margin-value">
                    {formatCurrency(calcMarza().marza, form.platnosci?.waluta)}
                    <span className="margin-percent">({calcMarza().marzaProcentowa}%)</span>
                  </span>
                </div>
              </div>

              {/* Informacja o kursach */}
              {exchangeRates && (
                <div className="exchange-rates-info">
                  <small>💱 Kursy walut (NBP): {Object.entries(exchangeRates).filter(([k]) => k !== 'PLN').slice(0, 4).map(([k, v]) => `${k}: ${v.toFixed(4)}`).join(' | ')}</small>
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
          <button className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Zapisuję...' : '💾 Zapisz zamówienie'}
          </button>
        </div>
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
// MODAL UŻYTKOWNIKÓW - Z RESETOWANIEM HASŁA
// ============================================

const UsersModal = ({ users, onSave, onClose, isAdmin }) => {
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
                    </div>
                    <div className="list-item-actions">
                      {isAdmin && <button className="btn-small" onClick={() => setEditingId(u.id)}>✏️ Edytuj</button>}
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
  const [filter, setFilter] = useState('all');
  const [newComment, setNewComment] = useState('');
  const [resolution, setResolution] = useState('');
  const [newComplaint, setNewComplaint] = useState({
    orderId: '',
    typ: 'uszkodzenie',
    opis: '',
    wiadomoscKlienta: '',
    oczekiwaniaKlienta: '',
    zdjecia: [],
    priorytet: 'normalny'
  });

  // Pobierz rolę użytkownika
  const getUserRoleLabel = (user) => {
    if (!user) return 'Nieznany';
    const role = USER_ROLES.find(r => r.id === user.role);
    return role ? `${role.icon} ${role.name}` : '👤 Użytkownik';
  };

  const filteredComplaints = filter === 'all' 
    ? complaints 
    : complaints.filter(c => c.status === filter);

  const handleAdd = async () => {
    if (!newComplaint.orderId || !newComplaint.opis) {
      alert('Wybierz zamówienie i opisz reklamację');
      return;
    }
    const order = orders.find(o => o.id === newComplaint.orderId);
    
    // Określ typ użytkownika
    const userRole = getUserRoleLabel(currentUser);
    
    const complaint = {
      ...newComplaint,
      numer: generateComplaintNumber(complaints),
      orderId: newComplaint.orderId,
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
        complaintId: null, // ID zostanie nadane przez Firebase
        type: 'complaint'
      });
    }
    
    setNewComplaint({ orderId: '', typ: 'uszkodzenie', opis: '', wiadomoscKlienta: '', oczekiwaniaKlienta: '', zdjecia: [], priorytet: 'normalny' });
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
        setNewComplaint(prev => ({
          ...prev,
          zdjecia: [...prev.zdjecia, { id: Date.now() + Math.random(), url: reader.result, nazwa: file.name }]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const selectedOrder = newComplaint.orderId ? orders.find(o => o.id === newComplaint.orderId) : null;
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
              <button className="btn-primary" onClick={() => setView('form')}>➕ Nowa reklamacja</button>
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

  // ========== FORMULARZ NOWEJ REKLAMACJI ==========
  if (view === 'form') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>➕ Nowa reklamacja</h2>
            <button className="btn-close" onClick={() => setView('list')}>×</button>
          </div>
          <div className="modal-body">
            <div className="complaint-form-layout">
              <div className="complaint-form-main">
                <div className="form-section">
                  <h3>📦 Wybierz zamówienie</h3>
                  <div className="form-group">
                    <label>ZAMÓWIENIE *</label>
                    <select value={newComplaint.orderId} onChange={e => setNewComplaint({...newComplaint, orderId: e.target.value})}>
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
                      <select value={newComplaint.typ} onChange={e => setNewComplaint({...newComplaint, typ: e.target.value})}>
                        {COMPLAINT_TYPES.map(t => (
                          <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>PRIORYTET</label>
                      <select value={newComplaint.priorytet} onChange={e => setNewComplaint({...newComplaint, priorytet: e.target.value})}>
                        <option value="niski">🟢 Niski</option>
                        <option value="normalny">🟡 Normalny</option>
                        <option value="wysoki">🔴 Wysoki</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>OPIS PROBLEMU *</label>
                    <textarea value={newComplaint.opis} onChange={e => setNewComplaint({...newComplaint, opis: e.target.value})} rows={4} placeholder="Opisz szczegółowo problem..." />
                  </div>
                </div>

                <div className="form-section">
                  <h3>💬 Wiadomość od klienta</h3>
                  <div className="form-group">
                    <label>TREŚĆ WIADOMOŚCI KLIENTA</label>
                    <textarea value={newComplaint.wiadomoscKlienta} onChange={e => setNewComplaint({...newComplaint, wiadomoscKlienta: e.target.value})} rows={3} placeholder="Wklej lub przepisz wiadomość od klienta..." />
                  </div>
                  <div className="form-group">
                    <label>OCZEKIWANIA KLIENTA</label>
                    <textarea value={newComplaint.oczekiwaniaKlienta} onChange={e => setNewComplaint({...newComplaint, oczekiwaniaKlienta: e.target.value})} rows={2} placeholder="Czego oczekuje klient? (zwrot, wymiana, naprawa...)" />
                  </div>
                </div>

                <div className="form-section">
                  <h3>📷 Zdjęcia od klienta</h3>
                  <div className="photos-upload-area">
                    {newComplaint.zdjecia.map(photo => (
                      <div key={photo.id} className="photo-thumb">
                        <img src={photo.url} alt="Reklamacja" />
                        <button className="photo-remove" onClick={() => setNewComplaint({...newComplaint, zdjecia: newComplaint.zdjecia.filter(p => p.id !== photo.id)})}>×</button>
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
            <button className="btn-secondary" onClick={() => setView('list')}>← Wróć</button>
            <button className="btn-primary" onClick={handleAdd}>✅ Utwórz reklamację</button>
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
  const body = `Dzień dobry,\n\nPytanie o zamówienie nr ${order.nrWlasny || 'BRAK'} - termin: ${formatDate(order.dataOdbioru)}.\n\nOpis: ${order.towar}\n\nZ poważaniem`;

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
          <div className="contact-actions">
            {producer?.phone && <a href={`tel:${producer.phone}`} className="btn-secondary">📞 Zadzwoń</a>}
            {producer?.email && <a href={`mailto:${producer.email}?subject=Zamówienie ${order.nrWlasny}&body=${encodeURIComponent(body)}`} className="btn-primary">✉️ Email</a>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// KARTA ZAMÓWIENIA
// ============================================

const OrderCard = ({ order, onEdit, onStatusChange, onEmailClick, onClick, producers, drivers, onDelete, isAdmin }) => {
  const status = getStatus(order.status);
  const country = getCountry(order.kraj);
  const days = getDaysUntilPickup(order.dataOdbioru);
  // Nie pokazuj migającego powiadomienia dla zamówień w transporcie, dostarczonych lub odebranych
  const showUrgency = !['w_transporcie', 'dostarczone', 'odebrane'].includes(order.status);
  const urgency = showUrgency ? getUrgencyStyle(days) : null;
  const producer = Object.values(producers).find(p => p.id === order.zaladunek);
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);

  // Prawidłowe wyliczenie marży
  // Cena brutto od klienta → dzielę przez VAT → minus koszty netto
  const calcMarza = () => {
    const cenaBrutto = order.platnosci?.cenaCalkowita || 0;
    const vatRate = order.koszty?.vatRate || 23;
    const vatMultiplier = 1 + vatRate / 100;
    
    // Cena netto od klienta
    const cenaNetto = cenaBrutto / vatMultiplier;
    
    // Koszty
    const zakupNetto = order.koszty?.zakupNetto || 0;
    const transport = order.koszty?.transport || 0;
    
    // Marża = cena netto - koszty zakupu netto - transport
    return Math.round((cenaNetto - zakupNetto - transport) * 100) / 100;
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Czy na pewno chcesz usunąć zamówienie ${order.nrWlasny}?`)) {
      onDelete(order.id);
    }
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
          {producer && <span className="tag tag-producer">🏭 {producer.name}</span>}
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
          {/* Marża - tylko dla admina */}
          {isAdmin && order.koszty && (order.koszty.zakupNetto > 0 || order.koszty.zakupBrutto > 0) && (
            <span className={calcMarza() >= 0 ? 'margin-badge positive' : 'margin-badge negative'}>
              📊 Marża: <strong>{formatCurrency(calcMarza(), order.platnosci?.waluta)}</strong>
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
            {producer && <button onClick={e => { e.stopPropagation(); onEmailClick(order, producer); }} className="btn-icon btn-email">📧</button>}
            <button onClick={handleDelete} className="btn-icon btn-delete-small">🗑️</button>
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
  const [notes, setNotes] = useState('');
  const [estPickup, setEstPickup] = useState('');
  const [estDelivery, setEstDelivery] = useState('');
  const [photoTarget, setPhotoTarget] = useState(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

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
    const statusName = getStatus(newStatus).name;
    await onUpdateOrder(order.id, {
      ...order,
      status: newStatus,
      historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: `Status: ${statusName}` }]
    });
    onAddNotification({ icon: '🔄', title: `Status: ${order.nrWlasny}`, message: `Kierowca ${user.name} zmienił status na: ${statusName}`, orderId: order.id });
  };

  // POPRAWIONE - kompresja zdjęcia i lepsza obsługa iOS/Android
  const handlePhotoCapture = async (order, type, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Pokaż loading
    const orderId = order.id;
    const field = type === 'pickup' ? 'zdjeciaOdbioru' : 'zdjeciaDostawy';

    try {
      // Kompresja zdjęcia dla lepszej wydajności
      const compressImage = (file) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_SIZE = 1200; // Max wymiar
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
              resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% jakości
            };
            img.src = event.target.result;
          };
          reader.readAsDataURL(file);
        });
      };

      const compressedUrl = await compressImage(file);
      const photo = { url: compressedUrl, timestamp: new Date().toISOString(), by: user.name };

      // Pobierz aktualny stan zamówienia z bazy (ważne dla iOS!)
      const currentOrder = orders.find(o => o.id === orderId);
      if (!currentOrder) return;

      const updatedPhotos = [...(currentOrder[field] || []), photo];

      await onUpdateOrder(orderId, {
        [field]: updatedPhotos,
        historia: [...(currentOrder.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: `Dodano zdjęcie ${type === 'pickup' ? 'odbioru' : 'dostawy'}` }]
      });

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
    await onUpdateOrder(order.id, {
      ...order,
      podpisKlienta: { url: dataUrl, timestamp: new Date().toISOString(), by: user.name },
      historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: 'Podpis klienta' }]
    });
    onAddNotification({ icon: '✍️', title: `Podpis: ${order.nrWlasny}`, message: `Kierowca ${user.name} zebrał podpis klienta`, orderId: order.id });
    setShowSignature(null);
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
                      <div className="payment-label">💰 Do pobrania od klienta</div>
                      <div className="payment-amount">{formatCurrency(order.platnosci.doZaplaty, order.platnosci.waluta)}</div>
                      <div className="payment-method">Metoda: {order.platnosci.metodaZaplaty || 'Gotówka'}</div>
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

                  {/* PRZYCISKI ZDJĘĆ - osobne dla aparatu i galerii */}
                  <div className="driver-actions">
                    {activeTab === 'pickup' && (
                      <>
                        <div className="photo-buttons">
                          <label className="btn-driver photo camera">
                            📸 Aparat
                            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handlePhotoCapture(order, 'pickup', e)} />
                          </label>
                          <label className="btn-driver photo gallery">
                            🖼️ Galeria
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handlePhotoCapture(order, 'pickup', e)} />
                          </label>
                        </div>
                        <button className="btn-driver notes" onClick={() => openNotes(order)}>📝 Uwagi / Daty</button>
                        <button className="btn-driver status" onClick={() => changeStatus(order, 'odebrane')}>✅ Oznacz jako odebrane</button>
                      </>
                    )}
                    {activeTab === 'picked' && (
                      <>
                        <button className="btn-driver notes" onClick={() => openNotes(order)}>📝 Uwagi / Daty</button>
                        <button className="btn-driver status" onClick={() => changeStatus(order, 'w_transporcie')}>🚗 Rozpocznij transport</button>
                      </>
                    )}
                    {activeTab === 'transit' && (
                      <>
                        <div className="photo-buttons">
                          <label className="btn-driver photo camera">
                            📸 Aparat
                            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handlePhotoCapture(order, 'delivery', e)} />
                          </label>
                          <label className="btn-driver photo gallery">
                            🖼️ Galeria
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handlePhotoCapture(order, 'delivery', e)} />
                          </label>
                        </div>
                        <button className="btn-driver signature" onClick={() => setShowSignature(order.id)}>✍️ Podpis klienta</button>
                        <button className="btn-driver notes" onClick={() => openNotes(order)}>📝 Uwagi</button>
                        <button className="btn-driver confirm" onClick={() => confirmDelivery(order)}>✔️ Potwierdź dostawę</button>
                      </>
                    )}
                    {activeTab === 'delivered' && (
                      <div className="delivered-info">
                        ✔️ Dostarczono: {formatDateTime(order.potwierdzenieDostawy?.data)}
                      </div>
                    )}
                  </div>
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

      {/* Modal podpisu */}
      {showSignature && (
        <div className="modal-overlay" onClick={() => setShowSignature(null)}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>✍️ Podpis klienta</h2>
              <button className="btn-close" onClick={() => setShowSignature(null)}>×</button>
            </div>
            <div className="modal-body">
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
                <div className="signature-line">Podpis klienta powyżej</div>
              </div>
              <div className="signature-actions">
                <button className="btn-secondary" onClick={clearCanvas}>🗑️ Wyczyść</button>
                <button className="btn-primary" onClick={saveSignature}>✅ Zapisz podpis</button>
              </div>
            </div>
          </div>
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
  const [search, setSearch] = useState('');

  const [editingOrder, setEditingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showProducersModal, setShowProducersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showComplaintsPanel, setShowComplaintsPanel] = useState(false);
  const [emailModal, setEmailModal] = useState(null);

  const prevNotifCount = useRef(0);

  const drivers = users.filter(u => u.role === 'driver');
  const isContractor = user?.role === 'contractor';
  const isAdmin = user?.role === 'admin';

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
      unsubNotifs();
      clearInterval(ratesInterval);
    };
  }, []);

  useEffect(() => {
    const unresolved = notifications.filter(n => !n.resolved).length;
    if (unresolved > prevNotifCount.current) {
      playNotificationSound();
    }
    prevNotifCount.current = unresolved;
  }, [notifications]);

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
    if (editingOrder) {
      await updateOrder(editingOrder.id, {
        ...form,
        historia: [...(form.historia || []), { data: now, uzytkownik: currentUser.name, akcja: 'Edycja zamówienia' }]
      });
    } else {
      const newOrder = {
        ...form,
        utworzonePrzez: { id: currentUser.id, nazwa: currentUser.name, data: now },
        historia: [{ data: now, uzytkownik: currentUser.name, akcja: 'Utworzono zamówienie' }]
      };
      await addOrder(newOrder);
      if (isContractor) {
        await addNotif({ icon: '🆕', title: `Nowe zamówienie: ${form.nrWlasny}`, message: `Kontrahent ${currentUser.name} dodał nowe zamówienie`, orderId: null, forContractor: currentUser.id });
      }
    }
    setShowOrderModal(false);
    setEditingOrder(null);
  };

  const handleDeleteOrder = async (orderId) => {
    await deleteOrder(orderId);
  };

  const handleStatusChange = async (orderId, newStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const statusName = getStatus(newStatus).name;
    await updateOrder(orderId, {
      ...order,
      status: newStatus,
      historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: user?.name || 'system', akcja: `Status: ${statusName}` }]
    });
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

  const visibleNotifications = isContractor
    ? notifications.filter(n => n.forContractor === user?.id || (n.orderId && orders.find(o => o.id === n.orderId && o.kontrahentId === user?.id)))
    : notifications;

  const visibleComplaints = isContractor
    ? complaints.filter(c => c.utworzonePrzez?.id === user?.id)
    : complaints;

  const visibleOrders = isContractor
    ? orders.filter(o => o.kontrahentId === user?.id)
    : orders;

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
    if (urgencyFilter !== 'all') {
      const d = getDaysUntilPickup(o.dataOdbioru);
      if (d === null) return false;
      if (urgencyFilter === 'today' && d !== 0) return false;
      if (urgencyFilter === '3days' && !(d >= 0 && d <= 3)) return false;
      if (urgencyFilter === 'week' && !(d >= 0 && d <= 7)) return false;
    }
    return true;
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

            {isAdmin && (
              <>
                <button className="btn-secondary" onClick={() => setShowUsersModal(true)}>👥 Użytkownicy</button>
                <button className="btn-secondary" onClick={() => setShowProducersModal(true)}>🏭 Producenci</button>
                <button className="btn-secondary" onClick={() => setShowSettingsModal(true)}>⚙️ Ustawienia</button>
              </>
            )}

            {user?.role === 'worker' && (
              <button className="btn-secondary" onClick={() => setShowProducersModal(true)}>🏭 Producenci</button>
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

      {emailModal && (
        <EmailModal
          order={emailModal.order}
          producer={emailModal.producer}
          onClose={() => setEmailModal(null)}
        />
      )}

      {viewingOrder && (
        <OrderDetailModal
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
          producers={producers}
          drivers={drivers}
          onDelete={handleDeleteOrder}
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
    </div>
  );
};

export default App;
