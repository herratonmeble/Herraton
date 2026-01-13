// ============================================
// KONFIGURACJA FIREBASE
// ============================================
// INSTRUKCJA: Zamień poniższe dane na swoje z Firebase Console
// (Krok 6 w instrukcji)

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';

const firebaseConfig = {
  // Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDPno2WcoauLnjkWq0NjGjuWr5wuG64xMI",
  authDomain: "herraton-332d0.firebaseapp.com",
  projectId: "herraton-332d0",
  storageBucket: "herraton-332d0.firebasestorage.app",
  messagingSenderId: "620331362290",
  appId: "1:620331362290:web:6ce157738f7ae7e2f02d6b",
  measurementId: "G-SES7Z9T5VZ"
};


// Inicjalizacja Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Referencje do kolekcji
const ordersRef = collection(db, 'orders');
const usersRef = collection(db, 'users');
const producersRef = collection(db, 'producers');
const settingsRef = collection(db, 'settings');

// ============================================
// FUNKCJE DO OBSŁUGI ZAMÓWIEŃ
// ============================================

// Nasłuchuj zmian w zamówieniach (real-time)
export const subscribeToOrders = (callback) => {
  const q = query(ordersRef, orderBy('dataZlecenia', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(orders);
  });
};

// Dodaj zamówienie
export const addOrder = async (orderData) => {
  const docRef = await addDoc(ordersRef, {
    ...orderData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return docRef.id;
};

// Aktualizuj zamówienie
export const updateOrder = async (orderId, orderData) => {
  const orderDoc = doc(db, 'orders', orderId);
  await updateDoc(orderDoc, {
    ...orderData,
    updatedAt: new Date().toISOString()
  });
};

// Usuń zamówienie
export const deleteOrder = async (orderId) => {
  const orderDoc = doc(db, 'orders', orderId);
  await deleteDoc(orderDoc);
};

// ============================================
// FUNKCJE DO OBSŁUGI UŻYTKOWNIKÓW
// ============================================

export const subscribeToUsers = (callback) => {
  return onSnapshot(usersRef, (snapshot) => {
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(users);
  });
};

export const addUser = async (userData) => {
  const docRef = await addDoc(usersRef, userData);
  return docRef.id;
};

export const updateUser = async (userId, userData) => {
  const userDoc = doc(db, 'users', userId);
  await updateDoc(userDoc, userData);
};

export const deleteUser = async (userId) => {
  const userDoc = doc(db, 'users', userId);
  await deleteDoc(userDoc);
};

// ============================================
// FUNKCJE DO OBSŁUGI PRODUCENTÓW
// ============================================

export const subscribeToProducers = (callback) => {
  return onSnapshot(producersRef, (snapshot) => {
    const producers = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      producers[data.id || doc.id] = { id: doc.id, ...data };
    });
    callback(producers);
  });
};

export const addProducer = async (producerData) => {
  const docRef = await addDoc(producersRef, producerData);
  return docRef.id;
};

export const updateProducer = async (producerId, producerData) => {
  const producerDoc = doc(db, 'producers', producerId);
  await updateDoc(producerDoc, producerData);
};

export const deleteProducer = async (producerId) => {
  const producerDoc = doc(db, 'producers', producerId);
  await deleteDoc(producerDoc);
};

// ============================================
// INICJALIZACJA DOMYŚLNYCH DANYCH
// ============================================

export const initializeDefaultData = async () => {
  // Sprawdź czy są już użytkownicy
  const usersSnapshot = await getDocs(usersRef);
  
  if (usersSnapshot.empty) {
    // Dodaj domyślnych użytkowników
    const defaultUsers = [
      { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
      { username: 'jan', password: 'jan123', name: 'Jan Kowalski', role: 'worker' },
      { username: 'kierowca1', password: 'kierowca123', name: 'Marek Transportowy', role: 'driver', phone: '+48 600 100 200' },
    ];
    
    for (const user of defaultUsers) {
      await addDoc(usersRef, user);
    }
    console.log('✅ Dodano domyślnych użytkowników');
  }

  // Sprawdź czy są producenci
  const producersSnapshot = await getDocs(producersRef);
  
  if (producersSnapshot.empty) {
    const defaultProducers = [
      { id: 'tomek', name: 'Tomek', email: 'tomek@example.com', phone: '+48 123 456 789', deliveryWeeks: { min: 2, max: 4 } },
      { id: 'brattex', name: 'Brattex', email: 'zamowienia@brattex.pl', phone: '+48 234 567 890', deliveryWeeks: { min: 3, max: 4 } },
      { id: 'furntex', name: 'FURNTEX', email: 'biuro@furntex.pl', phone: '+48 345 678 901', deliveryWeeks: { min: 2, max: 3 } },
    ];
    
    for (const producer of defaultProducers) {
      await addDoc(producersRef, producer);
    }
    console.log('✅ Dodano domyślnych producentów');
  }
};

export { db };
