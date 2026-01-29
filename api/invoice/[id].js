1. Push Notifications (Firebase Cloud Messaging) ✅
Pliki:

App.js - hook usePushNotifications, komponent NotificationSettings
public/service-worker.js - obsługa FCM w tle
api/send-push.js - endpoint wysyłający powiadomienia

Konfiguracja Firebase:
Project ID: herraton-332d0
VAPID_KEY: BNig4oMMnd59QexuD4EQKghZGqQ0FIPCBS2UeeBgZ5teDNkd3nSj3R71UAtoiSjGafcgOnbhU5A95CSKuezH3N8
Zmienne środowiskowe Vercel:

FIREBASE_PROJECT_ID = herraton-332d0
FIREBASE_CLIENT_EMAIL = push-notifications@herraton-332d0.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY = (klucz prywatny z Service Account)

Działanie:

Powiadomienia push wysyłane przy: nowym zamówieniu, zmianie statusu, nowej wiadomości w Messengerze
Tokeny FCM zapisywane w Firestore w users/{userId}/fcmTokens[]
Działa na Android, iOS (PWA), Windows, macOS


2. Panel Wysyłka (Próbki + Poczta) ✅
Menu:
📦 Wysyłka ▼
├── 🧪 Próbki (licznik)
└── ✉️ Poczta (licznik)
Funkcjonalności:

Dane klienta: imię, telefon, email, adres
Opis co wysłać
4 statusy: Nowe → Potwierdzone → W trakcie → Wysłane
Pole "Dodaj nr przesyłki" (wyświetlane na środku karty)
Filtrowanie, wyszukiwanie, edycja, usuwanie

Pliki Firebase (kolekcje):

samples - próbki
mailItems - poczta

Funkcje w firebase.js:

subscribeToSamples, addSample, updateSample, deleteSample
subscribeToMailItems, addMailItem, updateMailItem, deleteMailItem

Przeniesiono Kontakty z menu głównego do ⚙️ Ustawienia

3. Faktury wFirma - Faktura VAT / Proforma ✅
Przycisk: "📄 Faktura / Proforma" w formularzu zamówienia
Modal wyboru:

Typ dokumentu: Faktura VAT lub Proforma
Checkbox: "Wyślij dokument na email klienta"

Pliki:

api/wfirma.js - tworzenie faktur (obsługuje type: 'normal' lub type: 'proforma')
api/invoice/[id].js - strona wyświetlająca fakturę dla klienta

Email do klienta zawiera:

Numer faktury/proformy
Kwotę do zapłaty
Przycisk "Zobacz fakturę" → link do /api/invoice/{id}

Strona faktury (/api/invoice/{id}):

Pobiera dane z wFirma API
Wyświetla: dane nabywcy, pozycje, kwotę
Przycisk "Drukuj" (do PDF przez przeglądarkę)


STRUKTURA PLIKÓW DO WGRANIA
src/
  App.js              ← zaktualizowany
  App.css             ← zaktualizowany
  firebase.js         ← zaktualizowany (nowe funkcje samples/mailItems)

api/
  send-push.js        ← wysyłanie push notifications
  wfirma.js           ← zaktualizowany (obsługa proforma)
  invoice/
    [id].js           ← NOWY - strona faktury dla klienta

public/
  service-worker.js   ← zaktualizowany (FCM)

ZMIENNE ŚRODOWISKOWE VERCEL
# Firebase Cloud Messaging (Push)
FIREBASE_PROJECT_ID=herraton-332d0
FIREBASE_CLIENT_EMAIL=push-notifications@herraton-332d0.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# wFirma (już skonfigurowane wcześniej)
WFIRMA_ACCESS_KEY=...
WFIRMA_SECRET_KEY=...
WFIRMA_COMPANY_ID=...

# MailerSend (już skonfigurowane wcześniej)
MAILERSEND_API_KEY=...

KOLEKCJE FIRESTORE
orders          - zamówienia
users           - użytkownicy (+ fcmTokens[])
producers       - producenci
notifications   - powiadomienia
complaints      - reklamacje
leads           - zainteresowani
messages        - wiadomości (Messenger)
priceLists      - cenniki
settlements     - rozliczenia transportowe
samples         - NOWE: próbki do wysłania
mailItems       - NOWE: poczta do wysłania

OSTATNI STAN - CO DZIAŁA

✅ Push notifications na wszystkich urządzeniach
✅ Powiadomienia przy wiadomościach w Messengerze
✅ Panel Wysyłka z synchronizacją Firestore
✅ Numer przesyłki w panelach Próbki/Poczta
✅ Wystawianie Faktur VAT i Proform w wFirma
✅ Wysyłka emaila z linkiem do faktury
✅ Strona /api/invoice/{id} wyświetlająca fakturę


EWENTUALNE PROBLEMY DO SPRAWDZENIA

Jeśli strona faktury nie działa - sprawdź logi Vercel, wFirma zwraca obiekt {"0": {...}} zamiast tablicy
Duplikaty tokenów FCM - wyczyść w Firestore users/{userId}/fcmTokens jeśli są zduplikowane
Proforma zamiast faktury - upewnij się że api/wfirma.js przekazuje type: invoiceType a nie type: 'normal'
