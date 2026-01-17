import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  orderBy,
  addDoc
} from 'firebase/firestore';

// ============================================
// KONFIGURACJA FIREBASE
// ============================================

const firebaseConfig = {
   apiKey: "AIzaSyDPno2WcoauLnjkWq0NjGjuWr5wuG64xMI",
  authDomain: "herraton-332d0.firebaseapp.com",
  projectId: "herraton-332d0",
  storageBucket: "herraton-332d0.firebasestorage.app",
  messagingSenderId: "620331362290",
  appId: "1:620331362290:web:6ce157738f7ae7e2f02d6b",
  measurementId: "G-SES7Z9T5VZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================
// KOLEKCJE
// ============================================

const ordersCollection = collection(db, 'orders');
const usersCollection = collection(db, 'users');
const producersCollection = collection(db, 'producers');
const notificationsCollection = collection(db, 'notifications');
const complaintsCollection = collection(db, 'complaints');
const leadsCollection = collection(db, 'leads');
const priceListsCollection = collection(db, 'priceLists');
const messagesCollection = collection(db, 'messages');

// ============================================
// ZAMÓWIENIA
// ============================================

export const subscribeToOrders = (callback) => {
  const q = query(ordersCollection, orderBy('dataZlecenia', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(orders);
  }, (error) => {
    console.error('Error subscribing to orders:', error);
    callback([]);
  });
};

export const addOrder = async (order) => {
  try {
    const docRef = await addDoc(ordersCollection, order);
    return docRef.id;
  } catch (error) {
    console.error('Error adding order:', error);
    throw error;
  }
};

export const updateOrder = async (id, data) => {
  try {
    await setDoc(doc(db, 'orders', id), data, { merge: true });
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
};

export const deleteOrder = async (id) => {
  try {
    await deleteDoc(doc(db, 'orders', id));
  } catch (error) {
    console.error('Error deleting order:', error);
    throw error;
  }
};

// ============================================
// UŻYTKOWNICY
// ============================================

export const subscribeToUsers = (callback) => {
  return onSnapshot(usersCollection, (snapshot) => {
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(users);
  }, (error) => {
    console.error('Error subscribing to users:', error);
    callback([]);
  });
};

export const addUser = async (user) => {
  try {
    const id = user.id || user.username;
    await setDoc(doc(db, 'users', id), user);
    return id;
  } catch (error) {
    console.error('Error adding user:', error);
    throw error;
  }
};

export const updateUser = async (id, data) => {
  try {
    await setDoc(doc(db, 'users', id), data, { merge: true });
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

export const deleteUser = async (id) => {
  try {
    await deleteDoc(doc(db, 'users', id));
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

// ============================================
// PRODUCENCI
// ============================================

export const subscribeToProducers = (callback) => {
  return onSnapshot(producersCollection, (snapshot) => {
    const producers = {};
    snapshot.docs.forEach(doc => {
      producers[doc.id] = { id: doc.id, ...doc.data() };
    });
    callback(producers);
  }, (error) => {
    console.error('Error subscribing to producers:', error);
    callback({});
  });
};

export const addProducer = async (producer) => {
  try {
    const id = producer.id || producer.name.toLowerCase().replace(/\s+/g, '_');
    await setDoc(doc(db, 'producers', id), { ...producer, id });
    return id;
  } catch (error) {
    console.error('Error adding producer:', error);
    throw error;
  }
};

export const updateProducer = async (id, data) => {
  try {
    await setDoc(doc(db, 'producers', id), data, { merge: true });
  } catch (error) {
    console.error('Error updating producer:', error);
    throw error;
  }
};

export const deleteProducer = async (id) => {
  try {
    await deleteDoc(doc(db, 'producers', id));
  } catch (error) {
    console.error('Error deleting producer:', error);
    throw error;
  }
};

// ============================================
// POWIADOMIENIA
// ============================================

export const subscribeToNotifications = (callback) => {
  const q = query(notificationsCollection, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(notifications);
  }, (error) => {
    console.error('Error subscribing to notifications:', error);
    callback([]);
  });
};

export const addNotification = async (notification) => {
  try {
    const data = {
      ...notification,
      createdAt: notification.createdAt || new Date().toISOString(),
      resolved: notification.resolved || false
    };
    const docRef = await addDoc(notificationsCollection, data);
    return docRef.id;
  } catch (error) {
    console.error('Error adding notification:', error);
    throw error;
  }
};

export const updateNotification = async (id, data) => {
  try {
    await setDoc(doc(db, 'notifications', id), data, { merge: true });
  } catch (error) {
    console.error('Error updating notification:', error);
    throw error;
  }
};

export const deleteNotification = async (id) => {
  try {
    await deleteDoc(doc(db, 'notifications', id));
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};

// ============================================
// REKLAMACJE
// ============================================

export const subscribeToComplaints = (callback) => {
  const q = query(complaintsCollection, orderBy('dataUtworzenia', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const complaints = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(complaints);
  }, (error) => {
    console.error('Error subscribing to complaints:', error);
    callback([]);
  });
};

export const addComplaint = async (complaint) => {
  try {
    const data = {
      ...complaint,
      dataUtworzenia: complaint.dataUtworzenia || new Date().toISOString()
    };
    const docRef = await addDoc(complaintsCollection, data);
    return docRef.id;
  } catch (error) {
    console.error('Error adding complaint:', error);
    throw error;
  }
};

export const updateComplaint = async (id, data) => {
  try {
    await setDoc(doc(db, 'complaints', id), data, { merge: true });
  } catch (error) {
    console.error('Error updating complaint:', error);
    throw error;
  }
};

export const deleteComplaint = async (id) => {
  try {
    await deleteDoc(doc(db, 'complaints', id));
  } catch (error) {
    console.error('Error deleting complaint:', error);
    throw error;
  }
};

// ============================================
// LEADY (ZAINTERESOWANI KLIENCI)
// ============================================

export const subscribeToLeads = (callback) => {
  const q = query(leadsCollection, orderBy('dataUtworzenia', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(leads);
  }, (error) => {
    console.error('Error subscribing to leads:', error);
    callback([]);
  });
};

export const addLead = async (lead) => {
  try {
    const data = {
      ...lead,
      dataUtworzenia: lead.dataUtworzenia || new Date().toISOString()
    };
    const docRef = await addDoc(leadsCollection, data);
    return docRef.id;
  } catch (error) {
    console.error('Error adding lead:', error);
    throw error;
  }
};

export const updateLead = async (id, data) => {
  try {
    await setDoc(doc(db, 'leads', id), data, { merge: true });
  } catch (error) {
    console.error('Error updating lead:', error);
    throw error;
  }
};

export const deleteLead = async (id) => {
  try {
    await deleteDoc(doc(db, 'leads', id));
  } catch (error) {
    console.error('Error deleting lead:', error);
    throw error;
  }
};

// ============================================
// CENNIKI PRODUKTÓW
// ============================================

export const subscribeToPriceLists = (callback) => {
  return onSnapshot(priceListsCollection, (snapshot) => {
    const priceLists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(priceLists);
  }, (error) => {
    console.error('Error subscribing to priceLists:', error);
    callback([]);
  });
};

export const addPriceList = async (priceList) => {
  try {
    const data = {
      ...priceList,
      dataUtworzenia: priceList.dataUtworzenia || new Date().toISOString()
    };
    const docRef = await addDoc(priceListsCollection, data);
    return docRef.id;
  } catch (error) {
    console.error('Error adding priceList:', error);
    throw error;
  }
};

export const updatePriceList = async (id, data) => {
  try {
    await setDoc(doc(db, 'priceLists', id), data, { merge: true });
  } catch (error) {
    console.error('Error updating priceList:', error);
    throw error;
  }
};

export const deletePriceList = async (id) => {
  try {
    await deleteDoc(doc(db, 'priceLists', id));
  } catch (error) {
    console.error('Error deleting priceList:', error);
    throw error;
  }
};

// ============================================
// WIADOMOŚCI (CHAT)
// ============================================

export const subscribeToMessages = (callback) => {
  const q = query(messagesCollection, orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(messages);
  }, (error) => {
    console.error('Error subscribing to messages:', error);
    callback([]);
  });
};

export const addMessage = async (message) => {
  try {
    const data = {
      ...message,
      timestamp: message.timestamp || new Date().toISOString()
    };
    const docRef = await addDoc(messagesCollection, data);
    return docRef.id;
  } catch (error) {
    console.error('Error adding message:', error);
    throw error;
  }
};

export const updateMessage = async (id, data) => {
  try {
    await setDoc(doc(db, 'messages', id), data, { merge: true });
  } catch (error) {
    console.error('Error updating message:', error);
    throw error;
  }
};

// ============================================
// INICJALIZACJA DANYCH DOMYŚLNYCH
// ============================================

export const initializeDefaultData = async () => {
  try {
    const defaultUsers = [
      { id: 'admin', username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
      { id: 'jan', username: 'jan', password: 'jan123', name: 'Jan Kowalski', role: 'worker' },
      { id: 'kierowca1', username: 'kierowca1', password: 'kierowca123', name: 'Marek Transportowy', role: 'driver', phone: '+48 600 100 200' },
      { id: 'kontrahent1', username: 'kontrahent1', password: 'kontr123', name: 'Firma ABC', role: 'contractor', companyName: 'Meble ABC Sp. z o.o.' },
    ];

    const defaultProducers = [
      { id: 'tomek_meble', name: 'Tomek Meble', email: 'tomek@meble.pl', phone: '+48 123 456 789', address: 'ul. Fabryczna 1, 61-001 Poznań' },
      { id: 'brattex', name: 'Brattex', email: 'zamowienia@brattex.pl', phone: '+48 234 567 890', address: 'ul. Przemysłowa 15, 90-001 Łódź' },
      { id: 'furntex', name: 'FURNTEX', email: 'biuro@furntex.pl', phone: '+48 345 678 901', address: 'ul. Meblowa 8, 02-001 Warszawa' },
    ];

    for (const user of defaultUsers) {
      await setDoc(doc(db, 'users', user.id), user, { merge: true });
    }

    for (const producer of defaultProducers) {
      await setDoc(doc(db, 'producers', producer.id), producer, { merge: true });
    }

    console.log('Default data initialized');
  } catch (error) {
    console.error('Error initializing default data:', error);
  }
};

export { db };
