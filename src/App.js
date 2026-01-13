import React, { useState, useEffect, useRef } from 'react';
import { 
  subscribeToOrders, addOrder, updateOrder, deleteOrder,
  subscribeToUsers, addUser, updateUser, deleteUser,
  subscribeToProducers, addProducer, updateProducer, deleteProducer,
  initializeDefaultData 
} from './firebase';
import { exportToExcel, autoSyncToGoogleSheets, setGoogleScriptUrl, getGoogleScriptUrl } from './export';
import './App.css';

// ============================================
// KONFIGURACJA
// ============================================

const CURRENCIES = ['PLN', 'EUR', 'GBP', 'USD'];
const PAYMENT_METHODS = ['Gotówka', 'Przelew', 'Karta', 'PayPal', 'Pobranie'];

const STATUSES = [
  { id: 'nie_zlecone', name: 'Nie zlecone', color: '#6B7280', bgColor: '#F3F4F6', icon: '📋' },
  { id: 'nowe', name: 'Nowe', color: '#059669', bgColor: '#D1FAE5', icon: '🆕' },
  { id: 'zlecone', name: 'Zlecone', color: '#2563EB', bgColor: '#DBEAFE', icon: '✅' },
  { id: 'w_trakcie_odbioru', name: 'W trakcie odbioru', color: '#D97706', bgColor: '#FEF3C7', icon: '🏭' },
  { id: 'u_kierowcy', name: 'U kierowcy', color: '#8B5CF6', bgColor: '#EDE9FE', icon: '🚚' },
  { id: 'w_transporcie', name: 'W transporcie', color: '#EC4899', bgColor: '#FCE7F3', icon: '🚗' },
  { id: 'dostarczone', name: 'Dostarczone', color: '#10B981', bgColor: '#ECFDF5', icon: '📦' },
];

// ============================================
// FUNKCJE POMOCNICZE
// ============================================

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
const formatCurrency = (amt, cur = 'PLN') => { const s = { PLN: 'zł', EUR: '€', GBP: '£', USD: '$' }; return amt || amt === 0 ? amt.toLocaleString('pl-PL') + ' ' + (s[cur] || cur) : '—'; };

// ============================================
// KOMPONENTY
// ============================================

// EKRAN LOGOWANIA
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
        <p className="login-subtitle">System Zarządzania Zamówieniami</p>
        
        <div className="form-group">
          <label>LOGIN</label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Wpisz login..."
          />
        </div>
        
        <div className="form-group">
          <label>HASŁO</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Wpisz hasło..."
          />
        </div>
        
        {error && <div className="error-message">⚠️ {error}</div>}
        
        <button className="btn-primary btn-full" onClick={handleLogin}>
          Zaloguj się
        </button>
        
        <div className="login-demo">
          <strong>Demo:</strong> admin/admin123 • jan/jan123 • kierowca1/kierowca123
        </div>
      </div>
    </div>
  );
};

// PANEL HISTORII
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
          {historia?.slice().reverse().slice(0, 5).map((h, i) => (
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

// MODAL SZCZEGÓŁÓW ZAMÓWIENIA
const OrderDetailModal = ({ order, onClose, producers, drivers }) => {
  const status = STATUSES.find(s => s.id === order.status);
  const days = getDaysUntilPickup(order.dataOdbioru);
  const urgency = getUrgencyStyle(days);
  const producer = producers[order.zaladunek?.toLowerCase()];
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-detail" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title-row">
              <h2>{order.nrWlasny || 'Bez numeru'}</h2>
              {urgency && <span className={`urgency-badge ${urgency.blink ? 'blink' : ''}`} style={{ background: urgency.bg, color: urgency.color }}>⏰ {urgency.label}</span>}
            </div>
            <span className="status-badge" style={{ background: status?.bgColor, color: status?.color }}>{status?.icon} {status?.name}</span>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-section">
            <label>TOWAR</label>
            <p>{order.towar}</p>
          </div>
          
          <div className="detail-card">
            <label>👤 KLIENT</label>
            <div className="client-name">{order.klient?.imie || '—'}</div>
            <div className="client-address">📍 {order.klient?.adres || '—'}</div>
            <div className="client-contact">
              {order.klient?.telefon && <span>📞 {order.klient.telefon}</span>}
              {order.klient?.email && <span>✉️ {order.klient.email}</span>}
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
          </div>
          
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Producent</span>
              <span className="detail-value">{producer?.name || order.zaladunek || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Odbiór</span>
              <span className="detail-value">{formatDate(order.dataOdbioru)}</span>
            </div>
          </div>
          
          {driver && (
            <div className="detail-item driver">
              <span className="detail-label">Kierowca</span>
              <span className="detail-value">🚚 {driver.name}</span>
            </div>
          )}
          
          {order.uwagi && (
            <div className="detail-notes">
              📝 {order.uwagi}
            </div>
          )}
          
          <HistoryPanel historia={order.historia} utworzonePrzez={order.utworzonePrzez} />
        </div>
      </div>
    </div>
  );
};

// MODAL EDYCJI ZAMÓWIENIA
const OrderModal = ({ order, onSave, onClose, producers, drivers, currentUser }) => {
  const [form, setForm] = useState(order || {
    nrWlasny: '',
    status: 'nowe',
    dataZlecenia: new Date().toISOString().split('T')[0],
    towar: '',
    zaladunek: '',
    klient: { imie: '', adres: '', telefon: '', email: '' },
    platnosci: { waluta: 'PLN', zaplacono: 0, metodaZaplaty: '', dataZaplaty: '', doZaplaty: 0, cenaCalkowita: 0 },
    uwagi: '',
    dataOdbioru: '',
    przypisanyKierowca: null
  });
  const [saving, setSaving] = useState(false);

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
              <label>NR WŁASNY</label>
              <input value={form.nrWlasny} onChange={e => setForm({ ...form, nrWlasny: e.target.value })} placeholder="np. 40/10/pl" />
            </div>
            <div className="form-group">
              <label>STATUS</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>DATA ZLECENIA</label>
              <input type="date" value={form.dataZlecenia} onChange={e => setForm({ ...form, dataZlecenia: e.target.value })} />
            </div>
            <div className="form-group">
              <label>PRODUCENT</label>
              <select value={form.zaladunek} onChange={e => setForm({ ...form, zaladunek: e.target.value })}>
                <option value="">Wybierz...</option>
                {Object.entries(producers).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
              </select>
            </div>
          </div>
          
          <div className="form-group full">
            <label>TOWAR</label>
            <textarea value={form.towar} onChange={e => setForm({ ...form, towar: e.target.value })} rows={2} placeholder="Opis zamówienia..." />
          </div>
          
          <div className="form-section">
            <h3>👤 Dane klienta</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>IMIĘ I NAZWISKO</label>
                <input value={form.klient?.imie || ''} onChange={e => updateKlient('imie', e.target.value)} />
              </div>
              <div className="form-group">
                <label>TELEFON</label>
                <input value={form.klient?.telefon || ''} onChange={e => updateKlient('telefon', e.target.value)} />
              </div>
              <div className="form-group span-2">
                <label>ADRES</label>
                <input value={form.klient?.adres || ''} onChange={e => updateKlient('adres', e.target.value)} />
              </div>
              <div className="form-group span-2">
                <label>EMAIL</label>
                <input value={form.klient?.email || ''} onChange={e => updateKlient('email', e.target.value)} />
              </div>
            </div>
          </div>
          
          <div className="form-section payment">
            <h3>💰 Płatności</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>WALUTA</label>
                <select value={form.platnosci?.waluta || 'PLN'} onChange={e => updatePlatnosci('waluta', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
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
                <label>METODA</label>
                <select value={form.platnosci?.metodaZaplaty || ''} onChange={e => updatePlatnosci('metodaZaplaty', e.target.value)}>
                  <option value="">—</option>
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>DATA PŁATNOŚCI</label>
                <input type="date" value={form.platnosci?.dataZaplaty || ''} onChange={e => updatePlatnosci('dataZaplaty', e.target.value)} />
              </div>
              <div className="form-group">
                <label>POZOSTAŁO</label>
                <input type="number" value={form.platnosci?.doZaplaty || 0} readOnly className={form.platnosci?.doZaplaty > 0 ? 'unpaid' : 'paid'} />
              </div>
            </div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>DATA ODBIORU</label>
              <input type="date" value={form.dataOdbioru} onChange={e => setForm({ ...form, dataOdbioru: e.target.value })} />
            </div>
            <div className="form-group">
              <label>KIEROWCA</label>
              <select value={form.przypisanyKierowca || ''} onChange={e => setForm({ ...form, przypisanyKierowca: e.target.value || null })}>
                <option value="">—</option>
                {drivers.map(d => <option key={d.id} value={d.id}>🚚 {d.name}</option>)}
              </select>
            </div>
          </div>
          
          <div className="form-group full">
            <label>UWAGI</label>
            <textarea value={form.uwagi} onChange={e => setForm({ ...form, uwagi: e.target.value })} rows={2} />
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Zapisuję...' : '💾 Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
};

// MODAL PRODUCENTÓW
const ProducersModal = ({ producers, onSave, onClose }) => {
  const [list, setList] = useState(Object.values(producers));
  const [newP, setNewP] = useState({ name: '', email: '', phone: '', deliveryWeeks: { min: 2, max: 4 } });
  const [saving, setSaving] = useState(false);

  const add = () => {
    if (newP.name) {
      setList([...list, { ...newP, id: newP.name.toLowerCase().replace(/\s+/g, '_') }]);
      setNewP({ name: '', email: '', phone: '', deliveryWeeks: { min: 2, max: 4 } });
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
          <h2>🏭 Producenci</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {list.map(p => (
            <div key={p.id} className="list-item">
              <div>
                <div className="list-item-title">{p.name}</div>
                <div className="list-item-subtitle">{p.email}</div>
              </div>
              <button className="btn-delete" onClick={() => setList(list.filter(x => x.id !== p.id))}>🗑️</button>
            </div>
          ))}
          <div className="add-form">
            <h4>➕ Dodaj producenta</h4>
            <input placeholder="Nazwa" value={newP.name} onChange={e => setNewP({ ...newP, name: e.target.value })} />
            <input placeholder="Email" value={newP.email} onChange={e => setNewP({ ...newP, email: e.target.value })} />
            <input placeholder="Telefon" value={newP.phone} onChange={e => setNewP({ ...newP, phone: e.target.value })} />
            <button className="btn-add" onClick={add}>➕ Dodaj</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-primary btn-full" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Zapisuję...' : '💾 Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
};

// MODAL UŻYTKOWNIKÓW
const UsersModal = ({ users, onSave, onClose }) => {
  const [list, setList] = useState(users);
  const [newU, setNewU] = useState({ username: '', password: '', name: '', role: 'worker' });
  const [saving, setSaving] = useState(false);

  const add = () => {
    if (newU.username && newU.password && newU.name) {
      setList([...list, { ...newU, id: 'new_' + Date.now() }]);
      setNewU({ username: '', password: '', name: '', role: 'worker' });
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
          <h2>👥 Użytkownicy</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {list.map(u => (
            <div key={u.id} className="list-item">
              <div>
                <div className="list-item-title">{u.name}</div>
                <div className="list-item-subtitle">@{u.username} • {u.role === 'admin' ? '👑' : u.role === 'driver' ? '🚚' : '👤'}</div>
              </div>
              {u.username !== 'admin' && <button className="btn-delete" onClick={() => setList(list.filter(x => x.id !== u.id))}>🗑️</button>}
            </div>
          ))}
          <div className="add-form">
            <h4>➕ Dodaj użytkownika</h4>
            <input placeholder="Imię i nazwisko" value={newU.name} onChange={e => setNewU({ ...newU, name: e.target.value })} />
            <div className="form-row">
              <input placeholder="Login" value={newU.username} onChange={e => setNewU({ ...newU, username: e.target.value })} />
              <input placeholder="Hasło" type="password" value={newU.password} onChange={e => setNewU({ ...newU, password: e.target.value })} />
            </div>
            <select value={newU.role} onChange={e => setNewU({ ...newU, role: e.target.value })}>
              <option value="worker">👤 Pracownik</option>
              <option value="driver">🚚 Kierowca</option>
              <option value="admin">👑 Administrator</option>
            </select>
            <button className="btn-add" onClick={add}>➕ Dodaj</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-primary btn-full" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Zapisuję...' : '💾 Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
};

// MODAL USTAWIEŃ GOOGLE SHEETS
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

// MODAL EMAIL
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
            <span>{producer?.email}</span>
            <span>{producer?.phone}</span>
          </div>
          <div className="contact-actions">
            <a href={`tel:${producer?.phone}`} className="btn-secondary">📞 Zadzwoń</a>
            <a href={`mailto:${producer?.email}?subject=Zamówienie ${order.nrWlasny}&body=${encodeURIComponent(body)}`} className="btn-primary">✉️ Email</a>
          </div>
        </div>
      </div>
    </div>
  );
};

// KARTA ZAMÓWIENIA
const OrderCard = ({ order, onEdit, onStatusChange, onEmailClick, onClick, producers, drivers }) => {
  const status = STATUSES.find(s => s.id === order.status);
  const days = getDaysUntilPickup(order.dataOdbioru);
  const urgency = getUrgencyStyle(days);
  const producer = producers[order.zaladunek?.toLowerCase()];
  const driver = drivers.find(d => d.id === order.przypisanyKierowca);

  return (
    <div className="order-card" onClick={() => onClick(order)}>
      <div className="order-card-header">
        <div className="order-card-title">
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
          {order.zaladunek && <span className="tag tag-producer">📦 {order.zaladunek}</span>}
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
// GŁÓWNA APLIKACJA
// ============================================

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [producers, setProducers] = useState({});
  const [filter, setFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [creatorFilter, setCreatorFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingOrder, setEditingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showProducersModal, setShowProducersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [emailModal, setEmailModal] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [deliveryNotifications, setDeliveryNotifications] = useState([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const drivers = users.filter(u => u.role === 'driver');
  const creators = [...new Set(orders.map(o => o.utworzonePrzez?.nazwa).filter(Boolean))];

  // Inicjalizacja i subskrypcje Firebase
  useEffect(() => {
    const init = async () => {
      await initializeDefaultData();
      setLoading(false);
    };
    init();

    // Subskrypcje real-time
    const unsubOrders = subscribeToOrders((data) => {
      setOrders(data);
      // Auto-sync do Google Sheets
      autoSyncToGoogleSheets(data);
      setLastSync(new Date());
    });
    
    const unsubUsers = subscribeToUsers(setUsers);
    const unsubProducers = subscribeToProducers(setProducers);

    // Sprawdź zapisanego użytkownika
    const savedUser = localStorage.getItem('herratonUser');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    return () => {
      unsubOrders();
      unsubUsers();
      unsubProducers();
    };
  }, []);

  // Powiadomienia
  useEffect(() => {
    const n = [];
    orders.forEach(o => {
      const d = getDaysUntilPickup(o.dataOdbioru);
      if (d !== null && d <= 3 && o.status !== 'dostarczone') {
        n.push({
          id: o.id,
          orderId: o.id,
          message: d === 0 ? 'DZIŚ: ' + (o.nrWlasny || '?') : d < 0 ? Math.abs(d) + 'd temu: ' + (o.nrWlasny || '?') : d + 'd: ' + (o.nrWlasny || '?'),
          urgent: d <= 0
        });
      }
    });
    setNotifications(n);
  }, [orders]);

  // Zapisz zamówienie
  const handleSaveOrder = async (data, currentUser) => {
    const now = new Date().toISOString();
    
    if (data.id && !data.id.startsWith('new_')) {
      // Edycja istniejącego
      const old = orders.find(o => o.id === data.id);
      const changes = [];
      if (old?.status !== data.status) changes.push('Status zmieniony');
      if (old?.towar !== data.towar) changes.push('Opis zmieniony');
      
      const hist = [...(data.historia || [])];
      if (changes.length) {
        hist.push({ data: now, uzytkownik: currentUser.name, akcja: changes.join(', ') });
      }
      
      await updateOrder(data.id, { ...data, historia: hist });
    } else {
      // Nowe zamówienie
      const newOrderData = {
        ...data,
        zdjeciaOdbioru: [],
        zdjeciaDostawy: [],
        utworzonePrzez: { odId: currentUser.id, nazwa: currentUser.name, data: now },
        historia: [{ data: now, uzytkownik: currentUser.name, akcja: 'Utworzono' }]
      };
      delete newOrderData.id;
      await addOrder(newOrderData);
    }
    
    setShowOrderModal(false);
    setEditingOrder(null);
  };

  // Zmiana statusu
  const handleStatusChange = async (orderId, newStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const oldStatusName = STATUSES.find(s => s.id === order.status)?.name;
    const newStatusName = STATUSES.find(s => s.id === newStatus)?.name;
    
    await updateOrder(orderId, {
      ...order,
      status: newStatus,
      historia: [...(order.historia || []), {
        data: new Date().toISOString(),
        uzytkownik: user?.name || 'System',
        akcja: `${oldStatusName} → ${newStatusName}`
      }]
    });
  };

  // Zapisz producentów
  const handleSaveProducers = async (list) => {
    // Usuń starych i dodaj nowych
    for (const p of Object.values(producers)) {
      if (!list.find(x => x.id === p.id)) {
        await deleteProducer(p.id);
      }
    }
    for (const p of list) {
      if (producers[p.id]) {
        await updateProducer(p.id, p);
      } else {
        await addProducer(p);
      }
    }
  };

  // Zapisz użytkowników
  const handleSaveUsers = async (list) => {
    for (const u of users) {
      if (!list.find(x => x.id === u.id)) {
        await deleteUser(u.id);
      }
    }
    for (const u of list) {
      if (u.id.startsWith('new_')) {
        const { id, ...userData } = u;
        await addUser(userData);
      } else if (users.find(x => x.id === u.id)) {
        await updateUser(u.id, u);
      }
    }
  };

  // Filtrowanie
  const filteredOrders = orders.filter(o => {
    const matchStatus = filter === 'all' || o.status === filter;
    const s = searchTerm.toLowerCase();
    const matchSearch = !searchTerm || [o.nrWlasny, o.towar, o.zaladunek, o.klient?.imie, o.klient?.adres, o.klient?.telefon, o.klient?.email, o.uwagi].some(f => (f || '').toLowerCase().includes(s));
    
    let matchUrgency = true;
    if (urgencyFilter !== 'all') {
      const d = getDaysUntilPickup(o.dataOdbioru);
      if (urgencyFilter === 'today') matchUrgency = d !== null && d <= 0;
      else if (urgencyFilter === '3days') matchUrgency = d !== null && d <= 3;
      else if (urgencyFilter === 'week') matchUrgency = d !== null && d <= 7;
    }
    
    const matchCreator = creatorFilter === 'all' || o.utworzonePrzez?.nazwa === creatorFilter;
    return matchStatus && matchSearch && matchUrgency && matchCreator;
  });

  const handleNotificationClick = (orderId) => {
    const o = orders.find(x => x.id === orderId);
    if (o) setViewingOrder(o);
  };

  const handleLogout = () => {
    localStorage.removeItem('herratonUser');
    setUser(null);
  };

  // Ekran logowania
  if (!user) {
    return <LoginScreen onLogin={setUser} users={users} loading={loading} />;
  }

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-logo">📦</div>
            <div>
              <div className="header-title">Herraton</div>
              <div className="header-subtitle">System Zamówień</div>
            </div>
          </div>

          {/* Desktop nav */}
          <div className="header-nav desktop">
            {lastSync && <span className="sync-status">🔄 {formatDateTime(lastSync)}</span>}
            {notifications.length > 0 && <div className="notification-badge">🔔 {notifications.length}</div>}
            <div className="user-info">{user.role === 'admin' ? '👑' : '👤'} {user.name}</div>
            <button onClick={() => exportToExcel(orders)} className="btn-header">📥 Excel</button>
            {user.role === 'admin' && (
              <>
                <button onClick={() => setShowSettingsModal(true)} className="btn-header">⚙️</button>
                <button onClick={() => setShowProducersModal(true)} className="btn-header">🏭</button>
                <button onClick={() => setShowUsersModal(true)} className="btn-header">👥</button>
              </>
            )}
            <button onClick={handleLogout} className="btn-logout">Wyloguj</button>
          </div>

          {/* Mobile menu button */}
          <button className="btn-menu mobile" onClick={() => setShowMobileMenu(!showMobileMenu)}>☰</button>
        </div>

        {/* Mobile menu */}
        {showMobileMenu && (
          <div className="mobile-menu mobile">
            <div className="user-info">{user.role === 'admin' ? '👑' : '👤'} {user.name}</div>
            <button onClick={() => { exportToExcel(orders); setShowMobileMenu(false); }}>📥 Eksport Excel</button>
            {user.role === 'admin' && (
              <>
                <button onClick={() => { setShowSettingsModal(true); setShowMobileMenu(false); }}>⚙️ Ustawienia</button>
                <button onClick={() => { setShowProducersModal(true); setShowMobileMenu(false); }}>🏭 Producenci</button>
                <button onClick={() => { setShowUsersModal(true); setShowMobileMenu(false); }}>👥 Użytkownicy</button>
              </>
            )}
            <button onClick={handleLogout} className="btn-logout">Wyloguj</button>
          </div>
        )}
      </header>

      {/* NOTIFICATIONS */}
      {deliveryNotifications.length > 0 && (
        <div className="delivery-notifications">
          {deliveryNotifications.map(n => (
            <div key={n.id} onClick={() => handleNotificationClick(n.orderId)} className="delivery-notification">
              ✅ <strong>{n.orderNumber}</strong> → {n.clientName}
              <button onClick={e => { e.stopPropagation(); setDeliveryNotifications(p => p.filter(x => x.id !== n.id)); }}>×</button>
            </div>
          ))}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="urgency-notifications">
          {notifications.map((n, i) => (
            <div key={i} onClick={() => handleNotificationClick(n.orderId)} className={`urgency-notification ${n.urgent ? 'urgent' : ''}`}>
              {n.urgent ? '🚨' : '⏰'} {n.message}
            </div>
          ))}
        </div>
      )}

      {/* MAIN */}
      <main className="main">
        {/* FILTERS */}
        <div className="filters-panel">
          <div className="filters-row">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Szukaj: nr, towar, klient, adres..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={() => { setEditingOrder(null); setShowOrderModal(true); }} className="btn-new">
              ➕ Nowe zamówienie
            </button>
          </div>

          <div className="status-filters">
            <button onClick={() => setFilter('all')} className={`filter-btn ${filter === 'all' ? 'active' : ''}`}>
              Wszystkie ({orders.length})
            </button>
            {STATUSES.map(s => (
              <button
                key={s.id}
                onClick={() => setFilter(s.id)}
                className={`filter-btn ${filter === s.id ? 'active' : ''}`}
                style={{ background: filter === s.id ? s.color : s.bgColor, color: filter === s.id ? 'white' : s.color }}
              >
                {s.icon} {orders.filter(o => o.status === s.id).length}
              </button>
            ))}
          </div>

          <div className="extra-filters">
            <div className="urgency-filters">
              <span>⏰</span>
              {[{ id: 'all', l: 'Wszystkie' }, { id: 'today', l: '🔴 Dziś' }, { id: '3days', l: '🟠 3d' }, { id: 'week', l: '🟢 7d' }].map(u => (
                <button key={u.id} onClick={() => setUrgencyFilter(u.id)} className={`filter-btn small ${urgencyFilter === u.id ? 'active' : ''}`}>
                  {u.l}
                </button>
              ))}
            </div>

            {creators.length > 1 && (
              <div className="creator-filter">
                <span>👤</span>
                <select value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
                  <option value="all">Wszyscy</option>
                  {creators.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{orders.length}</div>
            <div className="stat-label">Wszystkich</div>
          </div>
          <div className="stat-card">
            <div className="stat-value warning">{orders.filter(o => { const d = getDaysUntilPickup(o.dataOdbioru); return d !== null && d <= 3 && o.status !== 'dostarczone'; }).length}</div>
            <div className="stat-label">Pilnych</div>
          </div>
          <div className="stat-card">
            <div className="stat-value success">{orders.filter(o => o.status === 'dostarczone').length}</div>
            <div className="stat-label">Dostarczonych</div>
          </div>
          <div className="stat-card">
            <div className="stat-value danger">{orders.filter(o => o.platnosci?.doZaplaty > 0).length}</div>
            <div className="stat-label">Nieopłaconych</div>
          </div>
        </div>

        {/* ORDERS GRID */}
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

      {/* MODALS */}
      {showOrderModal && (
        <OrderModal
          order={editingOrder}
          onSave={handleSaveOrder}
          onClose={() => { setShowOrderModal(false); setEditingOrder(null); }}
          producers={producers}
          drivers={drivers}
          currentUser={user}
        />
      )}
      {showUsersModal && <UsersModal users={users} onSave={handleSaveUsers} onClose={() => setShowUsersModal(false)} />}
      {showProducersModal && <ProducersModal producers={producers} onSave={handleSaveProducers} onClose={() => setShowProducersModal(false)} />}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
      {emailModal && <EmailModal order={emailModal.order} producer={emailModal.producer} onClose={() => setEmailModal(null)} />}
      {viewingOrder && <OrderDetailModal order={viewingOrder} onClose={() => setViewingOrder(null)} producers={producers} drivers={drivers} />}
    </div>
  );
};

export default App;
