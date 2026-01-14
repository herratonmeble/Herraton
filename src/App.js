import React, { useState, useEffect, useRef } from 'react';
import {
  subscribeToOrders, addOrder, updateOrder, deleteOrder,
  subscribeToUsers, addUser, updateUser, deleteUser,
  subscribeToProducers, addProducer, updateProducer, deleteProducer,
  subscribeToNotifications, addNotification, updateNotification, deleteNotification,
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

// Generowanie numeru zamówienia: [licznik]/[miesiąc]/[rok]/[kraj]
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

// Oblicz sumy do pobrania per waluta
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

// Dźwięk powiadomienia
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
  } catch (e) { /* ignore */ }
};

// ============================================
// KOMPONENTY - EKRAN LOGOWANIA
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
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Wpisz login..."
          />
        </div>

        <div className="form-group">
          <label>HASŁO</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Wpisz hasło..."
          />
        </div>

        {error && <div className="error-message">⚠️ {error}</div>}

        <button className="btn-primary btn-full" onClick={handleLogin}>
          Zaloguj się
        </button>

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
// PANEL POWIADOMIEŃ
// ============================================

const NotificationsPanel = ({ notifications, onClose, onResolve, onDelete, onOrderClick }) => {
  const [expanded, setExpanded] = useState(null);
  const unresolved = notifications.filter(n => !n.resolved).length;

  return (
    <div className="notifications-panel">
      <div className="notifications-header">
        <h3>🔔 Powiadomienia ({unresolved})</h3>
        <button className="btn-close" onClick={onClose}>×</button>
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
                      <button className="btn-small" onClick={() => onOrderClick(n.orderId)}>
                        📋 Zobacz zamówienie
                      </button>
                    )}
                    {!n.resolved && (
                      <button className="btn-small btn-success" onClick={() => onResolve(n.id)}>
                        ✓ Załatwione
                      </button>
                    )}
                    <button className="btn-small btn-danger" onClick={() => onDelete(n.id)}>
                      🗑️ Usuń
                    </button>
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
// MODAL SZCZEGÓŁÓW ZAMÓWIENIA
// ============================================

const OrderDetailModal = ({ order, onClose, producers, drivers }) => {
  const status = getStatus(order.status);
  const country = getCountry(order.kraj);
  const days = getDaysUntilPickup(order.dataOdbioru);
  const urgency = getUrgencyStyle(days);
  const producer = Object.values(producers).find(p => p.id === order.zaladunek);
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);

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

          {order.uwagi && (
            <div className="detail-notes">
              📝 {order.uwagi}
            </div>
          )}

          {order.uwagiKierowcy && (
            <div className="detail-notes driver-notes">
              🚚 Uwagi kierowcy: {order.uwagiKierowcy}
            </div>
          )}

          {(order.zdjeciaOdbioru?.length > 0 || order.zdjeciaDostawy?.length > 0 || order.podpisKlienta) && (
            <div className="detail-section">
              <label>📷 DOKUMENTACJA</label>
              <div className="photos-grid">
                {order.zdjeciaOdbioru?.map((p, i) => (
                  <div key={`o${i}`} className="photo-item">
                    <img src={p.url} alt={`Odbiór ${i + 1}`} />
                    <span>Odbiór - {formatDateTime(p.timestamp)}</span>
                  </div>
                ))}
                {order.zdjeciaDostawy?.map((p, i) => (
                  <div key={`d${i}`} className="photo-item">
                    <img src={p.url} alt={`Dostawa ${i + 1}`} />
                    <span>Dostawa - {formatDateTime(p.timestamp)}</span>
                  </div>
                ))}
                {order.podpisKlienta && (
                  <div className="photo-item signature">
                    <img src={order.podpisKlienta.url} alt="Podpis klienta" />
                    <span>✍️ Podpis - {formatDateTime(order.podpisKlienta.timestamp)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <HistoryPanel historia={order.historia} utworzonePrzez={order.utworzonePrzez} />
        </div>
      </div>
    </div>
  );
};

// ============================================
// MODAL EDYCJI ZAMÓWIENIA
// ============================================

const OrderModal = ({ order, onSave, onClose, producers, drivers, currentUser, orders, isContractor }) => {
  const [form, setForm] = useState(order || {
    nrWlasny: '',
    kraj: 'PL',
    status: 'nowe',
    dataZlecenia: new Date().toISOString().split('T')[0],
    towar: '',
    zaladunek: '',
    klient: { imie: '', adres: '', telefon: '', email: '', facebookUrl: '' },
    platnosci: { waluta: 'PLN', zaplacono: 0, metodaZaplaty: '', dataZaplaty: '', doZaplaty: 0, cenaCalkowita: 0 },
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

  const handleSave = async () => {
    setSaving(true);
    await onSave(form, currentUser);
    setSaving(false);
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
  const [list, setList] = useState(Object.values(producers || {}));
  const [newP, setNewP] = useState({ name: '', email: '', phone: '', address: '' });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setList(Object.values(producers || {}));
  }, [producers]);

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
                    <button className="btn-small" onClick={() => setEditingId(p.id)}>✏️ Edytuj</button>
                    <button className="btn-delete" onClick={() => setList(list.filter(x => x.id !== p.id))}>🗑️</button>
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
            <button className="btn-add" onClick={handleAdd}>➕ Dodaj producenta</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Zapisuję...' : '💾 Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MODAL UŻYTKOWNIKÓW
// ============================================

const UsersModal = ({ users, onSave, onClose }) => {
  const [list, setList] = useState(users || []);
  const [newU, setNewU] = useState({ username: '', password: '', name: '', role: 'worker', companyName: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setList(users || []);
  }, [users]);

  const handleAdd = () => {
    if (newU.username && newU.password && newU.name) {
      setList([...list, { ...newU, id: 'new_' + Date.now() }]);
      setNewU({ username: '', password: '', name: '', role: 'worker', companyName: '' });
    }
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
                <div>
                  <div className="list-item-title">{role.icon} {u.name}</div>
                  <div className="list-item-subtitle">@{u.username} • {role.name}</div>
                  {u.companyName && <div className="list-item-subtitle">🏢 {u.companyName}</div>}
                </div>
                {u.username !== 'admin' && (
                  <button className="btn-delete" onClick={() => setList(list.filter(x => x.id !== u.id))}>🗑️</button>
                )}
              </div>
            );
          })}
          <div className="add-form">
            <h4>➕ Dodaj użytkownika</h4>
            <input placeholder="Imię i nazwisko *" value={newU.name} onChange={e => setNewU({ ...newU, name: e.target.value })} />
            <div className="form-row">
              <input placeholder="Login *" value={newU.username} onChange={e => setNewU({ ...newU, username: e.target.value })} />
              <input placeholder="Hasło *" type="password" value={newU.password} onChange={e => setNewU({ ...newU, password: e.target.value })} />
            </div>
            <select value={newU.role} onChange={e => setNewU({ ...newU, role: e.target.value })}>
              {USER_ROLES.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
            </select>
            {newU.role === 'contractor' && (
              <input placeholder="Nazwa firmy" value={newU.companyName} onChange={e => setNewU({ ...newU, companyName: e.target.value })} />
            )}
            <button className="btn-add" onClick={handleAdd}>➕ Dodaj użytkownika</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Zapisuję...' : '💾 Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MODAL USTAWIEŃ
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
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
            />
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

const OrderCard = ({ order, onEdit, onStatusChange, onEmailClick, onClick, producers, drivers }) => {
  const status = getStatus(order.status);
  const country = getCountry(order.kraj);
  const days = getDaysUntilPickup(order.dataOdbioru);
  const urgency = getUrgencyStyle(days);
  const producer = Object.values(producers).find(p => p.id === order.zaladunek);
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);

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
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PANEL KIEROWCY
// ============================================

const DriverPanel = ({ user, orders, producers, onUpdateOrder, onAddNotification, onLogout }) => {
  const [activeTab, setActiveTab] = useState('pickup');
  const [showNotes, setShowNotes] = useState(null);
  const [showSignature, setShowSignature] = useState(null);
  const [notes, setNotes] = useState('');
  const [estPickup, setEstPickup] = useState('');
  const [estDelivery, setEstDelivery] = useState('');
  const fileRef = useRef(null);
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

  const handlePhoto = (order, type) => {
    setPhotoTarget({ orderId: order.id, type });
    fileRef.current?.click();
  };

  const onPhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file || !photoTarget) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const order = orders.find(o => o.id === photoTarget.orderId);
      if (!order) return;
      const photo = { url: reader.result, timestamp: new Date().toISOString(), by: user.name };
      const field = photoTarget.type === 'pickup' ? 'zdjeciaOdbioru' : 'zdjeciaDostawy';
      await onUpdateOrder(order.id, {
        ...order,
        [field]: [...(order[field] || []), photo],
        historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: user.name, akcja: `Dodano zdjęcie ${photoTarget.type === 'pickup' ? 'odbioru' : 'dostawy'}` }]
      });
      onAddNotification({ icon: '📷', title: `Zdjęcie: ${order.nrWlasny}`, message: `Kierowca ${user.name} dodał zdjęcie ${photoTarget.type === 'pickup' ? 'odbioru' : 'dostawy'}`, orderId: order.id });
      setPhotoTarget(null);
    };
    reader.readAsDataURL(file);
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
      <input type="file" accept="image/*" capture="environment" ref={fileRef} style={{ display: 'none' }} onChange={onPhotoSelect} />

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

                  <div className="driver-actions">
                    {activeTab === 'pickup' && (
                      <>
                        <button className="btn-driver photo" onClick={() => handlePhoto(order, 'pickup')}>📷 Zdjęcie odbioru</button>
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
                        <button className="btn-driver photo" onClick={() => handlePhoto(order, 'delivery')}>📷 Zdjęcie dostawy</button>
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
// APP (GŁÓWNY)
// ============================================

const App = () => {
  const [loading, setLoading] = useState(true);

  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [producers, setProducers] = useState({});
  const [notifications, setNotifications] = useState([]);

  const [user, setUser] = useState(null);

  // UI state
  const [showNotifications, setShowNotifications] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showProducersModal, setShowProducersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [editingOrder, setEditingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [emailModal, setEmailModal] = useState(null);

  // filters
  const [filter, setFilter] = useState('all'); // status
  const [countryFilter, setCountryFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [creatorFilter, setCreatorFilter] = useState('all');
  const [search, setSearch] = useState('');

  // bootstrap login
  useEffect(() => {
    const saved = localStorage.getItem('herratonUser');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // subscriptions
  useEffect(() => {
    let unsubOrders = null;
    let unsubUsers = null;
    let unsubProducers = null;
    let unsubNotifs = null;

    (async () => {
      try {
        await initializeDefaultData();
      } catch (e) {
        // ignore
      }

      try {
        unsubOrders = subscribeToOrders((arr) => setOrders(arr || []));
        unsubUsers = subscribeToUsers((arr) => setUsers(arr || []));
        unsubProducers = subscribeToProducers((obj) => setProducers(obj || {}));
        unsubNotifs = subscribeToNotifications((arr) => setNotifications(arr || []));
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (typeof unsubOrders === 'function') unsubOrders();
      if (typeof unsubUsers === 'function') unsubUsers();
      if (typeof unsubProducers === 'function') unsubProducers();
      if (typeof unsubNotifs === 'function') unsubNotifs();
    };
  }, []);

  // autosync (jeśli masz to gotowe w export.js)
  useEffect(() => {
    const url = getGoogleScriptUrl();
    if (!url) return;
    try {
      autoSyncToGoogleSheets(orders);
    } catch (e) {
      // ignore
    }
  }, [orders]);

  const isContractor = user?.role === 'contractor';

  const drivers = users.filter(u => u.role === 'driver');

  const onLogout = () => {
    localStorage.removeItem('herratonUser');
    setUser(null);
  };

  const addNotif = async ({ icon, title, message, orderId }) => {
    try {
      playNotificationSound();
      await addNotification({
        icon: icon || '🔔',
        title,
        message,
        orderId: orderId || null,
        createdAt: new Date().toISOString(),
        resolved: false,
      });
    } catch (e) {
      // ignore
    }
  };

  const handleSaveOrder = async (form, currentUser) => {
    const isEdit = !!form.id;

    const base = {
      ...form,
      klient: form.klient || {},
      platnosci: form.platnosci || {},
      historia: Array.isArray(form.historia) ? form.historia : [],
      utworzonePrzez: form.utworzonePrzez || {
        nazwa: currentUser?.name || currentUser?.username || 'system',
        data: new Date().toISOString()
      }
    };

    // contractor – blokada statusu edycji w UI jest, ale tu też zabezpieczamy
    if (isContractor && isEdit) {
      // kontrahent nie zmienia statusu
      const old = orders.find(o => o.id === form.id);
      if (old) base.status = old.status;
    }

    // historia
    const who = currentUser?.name || currentUser?.username || 'system';
    const action = isEdit ? 'Edytowano zamówienie' : 'Utworzono zamówienie';
    base.historia = [...(base.historia || []), { data: new Date().toISOString(), uzytkownik: who, akcja: action }];

    if (isEdit) {
      await updateOrder(form.id, base);
      await addNotif({ icon: '✏️', title: `Edytowano: ${base.nrWlasny}`, message: `${who} edytował zamówienie`, orderId: form.id });
    } else {
      const id = await addOrder(base);
      await addNotif({ icon: '🆕', title: `Nowe: ${base.nrWlasny}`, message: `${who} dodał nowe zamówienie`, orderId: id || null });
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const statusName = getStatus(newStatus).name;
    const who = user?.name || user?.username || 'system';

    await updateOrder(orderId, {
      ...order,
      status: newStatus,
      historia: [...(order.historia || []), { data: new Date().toISOString(), uzytkownik: who, akcja: `Status: ${statusName}` }]
    });

    await addNotif({ icon: '🔄', title: `Status: ${order.nrWlasny}`, message: `${who} zmienił status na: ${statusName}`, orderId });
  };

  const handleSaveUsers = async (newList) => {
    // prosto: zapisujemy/aktualizujemy wszystko z listy, usuwamy brakujące
    const currentById = new Map((users || []).map(u => [u.id, u]));
    const nextById = new Map((newList || []).map(u => [u.id, u]));

    // usuń
    for (const old of users) {
      if (!nextById.has(old.id) && old.username !== 'admin') {
        try { await deleteUser(old.id); } catch { /* ignore */ }
      }
    }

    // add/update
    for (const u of (newList || [])) {
      const payload = { ...u };
      if (!payload.id || String(payload.id).startsWith('new_')) {
        delete payload.id;
        try { await addUser(payload); } catch { /* ignore */ }
      } else if (currentById.has(u.id)) {
        try { await updateUser(u.id, payload); } catch { /* ignore */ }
      } else {
        try { await addUser(payload); } catch { /* ignore */ }
      }
    }
  };

  const handleSaveProducers = async (list) => {
    const current = producers || {};
    const currentIds = new Set(Object.keys(current));
    const nextIds = new Set((list || []).map(p => p.id));

    // usuń
    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        try { await deleteProducer(id); } catch { /* ignore */ }
      }
    }

    // add/update
    for (const p of (list || [])) {
      const payload = { ...p };
      if (current[p.id]) {
        try { await updateProducer(p.id, payload); } catch { /* ignore */ }
      } else {
        try { await addProducer(payload); } catch { /* ignore */ }
      }
    }
  };

  const handleResolveNotification = async (id) => {
    const n = notifications.find(x => x.id === id);
    if (!n) return;
    await updateNotification(id, { ...n, resolved: true, resolvedAt: new Date().toISOString() });
  };

  const handleDeleteNotification = async (id) => {
    await deleteNotification(id);
  };

  const visibleOrders = orders.filter(o => {
    if (!user) return true;
    if (isContractor) return o.kontrahentId === user.id;
    return true;
  });

  const orderCountries = Array.from(new Set(visibleOrders.map(o => o.kraj).filter(Boolean)));
  const creators = Array.from(new Set(visibleOrders.map(o => o.utworzonePrzez?.nazwa).filter(Boolean)));

  const filteredOrders = visibleOrders.filter(o => {
    // status
    if (filter !== 'all' && o.status !== filter) return false;

    // search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [
        o.nrWlasny,
        o.towar,
        o.klient?.imie,
        o.klient?.adres,
        o.klient?.telefon,
        o.klient?.email,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }

    // country
    if (countryFilter !== 'all' && o.kraj !== countryFilter) return false;

    // creator
    if (creatorFilter !== 'all' && (o.utworzonePrzez?.nazwa || '') !== creatorFilter) return false;

    // urgency
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

  // driver routing
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

  // login
  if (!user) {
    return <LoginScreen onLogin={setUser} users={users} loading={loading} />;
  }

  return (
    <div className="app">
      {/* header */}
      <header className="header">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-logo">📦</div>
            <div>
              <div className="header-title">Herraton</div>
              <div className="header-subtitle">
                Panel • {user.name} ({getRole(user.role)?.name})
              </div>
            </div>
          </div>

          <div className="header-actions">
            <button className="btn-secondary" onClick={() => setShowNotifications(true)}>
              🔔 {notifications.filter(n => !n.resolved).length}
            </button>

            {!isContractor && (
              <>
                <button className="btn-secondary" onClick={() => setShowUsersModal(true)}>👥 Użytkownicy</button>
                <button className="btn-secondary" onClick={() => setShowProducersModal(true)}>🏭 Producenci</button>
              </>
            )}

            <button className="btn-secondary" onClick={() => setShowSettingsModal(true)}>⚙️</button>
            <button className="btn-logout" onClick={onLogout}>Wyloguj</button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* top actions */}
        <div className="top-bar">
          <div className="top-left">
            <button className="btn-primary" onClick={() => { setEditingOrder(null); setShowOrderModal(true); }}>
              ➕ Nowe zamówienie
            </button>

            <button className="btn-secondary" onClick={() => exportToExcel(filteredOrders)}>
              📥 Export Excel
            </button>

            <button className="btn-secondary" onClick={() => autoSyncToGoogleSheets(filteredOrders)}>
              🔄 Sync Sheets
            </button>
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

        {/* filtry statusów */}
        <div className="filters">
          <div className="filter-buttons">
            <button
              onClick={() => setFilter('all')}
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            >
              Wszystkie ({visibleOrders.length})
            </button>

            {STATUSES.map(s => (
              <button
                key={s.id}
                onClick={() => setFilter(s.id)}
                className={`filter-btn ${filter === s.id ? 'active' : ''}`}
                style={{ background: filter === s.id ? s.color : s.bgColor, color: filter === s.id ? 'white' : s.color }}
              >
                {s.icon} {visibleOrders.filter(o => o.status === s.id).length}
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

        {/* Statystyki */}
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

        {/* Siatka zamówień */}
        <div className="orders-grid">
          {filteredOrders.map(o => (
            <OrderCard
              key={o.id}
              order={o}
              onEdit={x => { setEditingOrder(x); setShowOrderModal(true); }}
              onStatusChange={handleStatusChange}
              onEmailClick={(x, p) => setEmailModal({ order: x, producer: p })}
              onClick={x => setViewingOrder(x)}
              producers={producers}
              drivers={drivers}
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

      {/* Modale */}
      {showNotifications && (
        <NotificationsPanel
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onResolve={handleResolveNotification}
          onDelete={handleDeleteNotification}
          onOrderClick={(orderId) => {
            const ord = orders.find(o => o.id === orderId);
            if (ord) setViewingOrder(ord);
            setShowNotifications(false);
          }}
        />
      )}

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
        />
      )}

      {showUsersModal && (
        <UsersModal
          users={users}
          onSave={handleSaveUsers}
          onClose={() => setShowUsersModal(false)}
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
        />
      )}
    </div>
  );
};

export default App;
