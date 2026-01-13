# 🚀 HERRATON - Kompletna Instrukcja Wdrożenia

## 📋 Co otrzymujesz:
- ✅ Profesjonalny system zarządzania zamówieniami
- ✅ Baza danych Firebase (dane nigdy nie giną)
- ✅ Automatyczna synchronizacja z Google Sheets
- ✅ Eksport do Excel
- ✅ Hosting na Vercel (darmowy)

---

## 🔧 KROK 1: Załóż konto GitHub (2 minuty)

1. Wejdź na **https://github.com**
2. Kliknij **"Sign up"**
3. Podaj email, hasło, nazwę użytkownika
4. Potwierdź email

---

## 🔧 KROK 2: Utwórz nowe repozytorium (1 minuta)

1. Po zalogowaniu kliknij zielony przycisk **"New"** (lub **"+"** w prawym górnym rogu → "New repository")
2. Wypełnij:
   - **Repository name:** `herraton`
   - **Description:** `System zarządzania zamówieniami`
   - Zaznacz: **Public**
   - Zaznacz: **Add a README file**
3. Kliknij **"Create repository"**

---

## 🔧 KROK 3: Wgraj pliki projektu (5 minut)

### Opcja A: Przez przeglądarkę (łatwiejsza)

1. W swoim repozytorium kliknij **"Add file"** → **"Upload files"**
2. Przeciągnij WSZYSTKIE pliki z folderu `herraton-full`:
   - `package.json`
   - folder `public` (z plikiem `index.html`)
   - folder `src` (z plikami `App.js`, `App.css`, `firebase.js`, `export.js`, `index.js`)
3. Na dole wpisz opis: "Initial commit"
4. Kliknij **"Commit changes"**

### Opcja B: Przez GitHub Desktop (dla zaawansowanych)
- Pobierz GitHub Desktop z https://desktop.github.com
- Sklonuj repozytorium
- Skopiuj pliki do folderu
- Commit i Push

---

## 🔧 KROK 4: Załóż projekt Firebase (5 minut)

1. Wejdź na **https://console.firebase.google.com**
2. Zaloguj się kontem Google
3. Kliknij **"Utwórz projekt"** (lub "Add project")
4. Nazwa projektu: `herraton` (lub inna)
5. Google Analytics: możesz wyłączyć (niepotrzebne)
6. Kliknij **"Utwórz projekt"**
7. Poczekaj aż się utworzy, kliknij **"Kontynuuj"**

---

## 🔧 KROK 5: Skonfiguruj bazę Firestore (3 minuty)

1. W panelu Firebase, w menu po lewej kliknij **"Firestore Database"**
2. Kliknij **"Utwórz bazę danych"**
3. Wybierz **"Rozpocznij w trybie testowym"** (później zabezpieczymy)
4. Lokalizacja: wybierz **"eur3 (europe-west)"**
5. Kliknij **"Włącz"**

---

## 🔧 KROK 6: Pobierz dane konfiguracyjne Firebase (2 minuty)

1. W Firebase kliknij **ikonę koła zębatego** ⚙️ → **"Ustawienia projektu"**
2. Przewiń w dół do sekcji **"Twoje aplikacje"**
3. Kliknij ikonę **"</>"** (Web)
4. Nazwa aplikacji: `herraton-web`
5. NIE zaznaczaj "Firebase Hosting"
6. Kliknij **"Zarejestruj aplikację"**
7. Zobaczysz kod z `firebaseConfig` - **SKOPIUJ TE DANE:**

```javascript
const firebaseConfig = {
  apiKey: "AIza.....................",
  authDomain: "herraton-xxxxx.firebaseapp.com",
  projectId: "herraton-xxxxx",
  storageBucket: "herraton-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

---

## 🔧 KROK 7: Wklej dane Firebase do projektu (2 minuty)

1. W GitHub wejdź do swojego repozytorium `herraton`
2. Kliknij folder `src`
3. Kliknij plik `firebase.js`
4. Kliknij **ikonę ołówka** ✏️ (Edit this file)
5. Znajdź sekcję:
```javascript
const firebaseConfig = {
  apiKey: "TUTAJ_WKLEJ_SWOJ_API_KEY",
  ...
};
```
6. **Zamień całą sekcję** na swoje dane z Firebase
7. Kliknij **"Commit changes"**

---

## 🔧 KROK 8: Wdróż na Vercel (3 minuty)

1. Wejdź na **https://vercel.com**
2. Kliknij **"Sign Up"** → **"Continue with GitHub"**
3. Zaloguj się kontem GitHub
4. Kliknij **"Add New..."** → **"Project"**
5. Znajdź repozytorium `herraton` i kliknij **"Import"**
6. Zostaw domyślne ustawienia
7. Kliknij **"Deploy"**
8. Poczekaj 1-2 minuty...
9. 🎉 **GOTOWE!** Dostaniesz link typu: `https://herraton-xyz.vercel.app`

---

## 🔧 KROK 9: Stwórz Google Sheets do backupu (3 minuty)

1. Wejdź na **https://sheets.google.com**
2. Utwórz nowy arkusz
3. Nazwij go: **"Herraton Backup"**
4. W pierwszym wierszu wpisz nagłówki (kolumny A-S):
```
Nr zamówienia | Status | Data zlecenia | Towar | Producent | Klient | Adres | Telefon | Email | Waluta | Cena | Zapłacono | Do zapłaty | Metoda | Data płatności | Data odbioru | Uwagi | Utworzone przez | Data utworzenia
```

---

## 🔧 KROK 10: Skonfiguruj automatyczną synchronizację (5 minut)

1. W Google Sheets kliknij **"Rozszerzenia"** → **"Apps Script"**
2. Usuń cały kod i wklej:

```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    if (data.action === 'sync') {
      // Wyczyść arkusz (oprócz nagłówków)
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 19).clearContent();
      }
      
      // Dodaj nowe dane
      var orders = data.data;
      for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        sheet.appendRow([
          o.nrWlasny,
          o.status,
          o.dataZlecenia,
          o.towar,
          o.producent,
          o.klientImie,
          o.klientAdres,
          o.klientTelefon,
          o.klientEmail,
          o.waluta,
          o.cenaCalkowita,
          o.zaplacono,
          o.doZaplaty,
          o.metodaPlatnosci,
          o.dataPlatnosci,
          o.dataOdbioru,
          o.uwagi,
          o.utworzonePrzez,
          o.dataUtworzenia
        ]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({success: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({success: false, error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Kliknij **"Zapisz"** (ikona dyskietki 💾)
4. Nazwij projekt: `Herraton Sync`
5. Kliknij **"Wdróż"** → **"Nowe wdrożenie"**
6. Typ: **"Aplikacja internetowa"**
7. Wykonaj jako: **"Ja"**
8. Kto ma dostęp: **"Wszyscy"**
9. Kliknij **"Wdróż"**
10. Kliknij **"Autoryzuj dostęp"** → wybierz swoje konto → "Zezwól"
11. **SKOPIUJ URL** który się pojawi (zaczyna się od `https://script.google.com/macros/s/...`)

---

## 🔧 KROK 11: Podłącz Google Sheets do aplikacji (1 minuta)

1. Wejdź na swoją stronę Herraton (link z Vercel)
2. Zaloguj się jako **admin / admin123**
3. Kliknij **⚙️** (Ustawienia) w prawym górnym rogu
4. Wklej skopiowany URL z Google Apps Script
5. Kliknij **"Zapisz"**

---

## ✅ GOTOWE!

Twój system jest teraz w pełni skonfigurowany:

| Funkcja | Status |
|---------|--------|
| Aplikacja online | ✅ działa na Vercel |
| Baza danych | ✅ Firebase (automatyczne backupy Google) |
| Google Sheets | ✅ synchronizacja przy każdej zmianie |
| Eksport Excel | ✅ przycisk w aplikacji |

---

## 🔐 KROK 12 (WAŻNE): Zabezpiecz bazę danych

Po przetestowaniu aplikacji, wróć do Firebase i zabezpiecz bazę:

1. Firebase → Firestore Database → **Reguły**
2. Zamień na:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2025, 12, 31);
    }
  }
}
```

3. Kliknij **"Opublikuj"**

(To daje dostęp do końca 2025 - później możesz przedłużyć)

---

## 🌐 OPCJONALNIE: Własna domena

Jeśli masz domenę (np. z CyberFolks):

1. W Vercel → Twój projekt → **Settings** → **Domains**
2. Dodaj swoją domenę
3. Vercel pokaże Ci rekordy DNS do ustawienia
4. W panelu CyberFolks → DNS → dodaj te rekordy
5. Poczekaj 15-60 minut na propagację

---

## 📞 Pomoc

Jeśli masz problem:
1. Sprawdź czy wszystkie pliki są wgrane
2. Sprawdź czy dane Firebase są poprawne
3. Sprawdź konsolę przeglądarki (F12 → Console)

---

## 🔑 Dane logowania

| Login | Hasło | Rola |
|-------|-------|------|
| admin | admin123 | Administrator |
| jan | jan123 | Pracownik |
| kierowca1 | kierowca123 | Kierowca |

**WAŻNE:** Po wdrożeniu zmień hasła w panelu użytkowników!
