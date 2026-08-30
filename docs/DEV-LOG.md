# Dziennik developmentu — v0.3

Praca teraz na Pi, w klonie deweloperskim `~/projects/fotofoto` (osobnym od
`/srv/fotofoto/app`, którym zarządza wyłącznie `deploy.sh`).

Cel v0.3 (z ARCHITECTURE.md §7): upload end-to-end — resize w canvas,
streaming na dysk, worker miniatur. Test z prawdziwego iPhone'a i Androida.

## Fakty ustalone 2026-08-23

- Data wesela: **3 października 2026**.
- Dysk na dane: SSD już podpięty (`/mnt/ssd`, bind-mount na `/srv/fotofoto/data`
  w produkcji). Do dev używamy osobnego `DATA_DIR`, żeby nie mieszać z danymi prod.
- Zasięg LTE na sali: potwierdzony OK przez właściciela (bez pomiaru na miejscu).
- Domena: kupimy później, przed v1.0.
- v0.2 zamknięte: `PI-SETUP.md` sekcje 1–8 wykonane, reboot-test przeszedł.

## TODO v0.3

- [x] Dodać zależności: `@fastify/multipart`, `@fastify/cookie`, `sharp`
      (sharp zweryfikowany: prebuild arm64, zero kompilacji ze źródeł)
- [x] `src/routes/guest.js` — `POST /api/guest`, `GET /api/guest/me` (cookie `guest_id`)
- [x] `src/routes/submissions.js` — `POST /api/submissions`, `POST /api/submissions/:id/photos`
      (streaming multipart → dysk, walidacja magic bytes, limit 20MB)
- [x] `src/workers/thumbnails.js` — worker w tle (concurrency 2), sharp → webp
- [x] Podpięcie w `server.js`
- [x] Test backendu przez curl + syntetyczny JPEG (bez telefonu) — patrz niżej, wszystko zielone
- [x] Minimalny front: identyfikacja gościa (imię) → wybór zadania → aparat → resize w canvas → upload
      (`public/app.js`, `public/index.html`, `public/style.css` — vanilla, textContent, zero bundlera)
- [x] Dev-serwer na `0.0.0.0:3001` (`config.js` domyślnie tak binduje) — LAN-owy adres poniżej
- [x] **Test z prawdziwego iPhone'a** — 2026-08-23, przez WireGuard (`http://10.8.0.1:3001/`),
      nie LAN. Zdjęcie 1536×2048, 1.04MB, dotarło, miniatura się wygenerowała.
      **Ryzyko HEIC z §9 rozbrojone**: `orientation exif: undefined` na zapisanym oryginale —
      Safari/canvas wypieka poprawną orientację przy rysowaniu z aparatu, `toBlob` daje czysty JPEG.
      Zero błędów w logu.
- [x] **Test z prawdziwego Androida** — 2026-08-23, przez LAN (`192.168.1.24` → dev-serwer
      na `192.168.1.32:3001`). Zdjęcie 1536×2048, 350KB, HTTP 201, miniatura się wygenerowała
      poprawnie (480×640 webp). Zero błędów w logu.
- [x] Tag `v0.3.0`, wpis w `README.md` o stanie

## v0.3 zamknięte — 2026-08-23

Oba testy na prawdziwych telefonach (iPhone przez WireGuard, Android przez LAN) przeszły
bez błędów. Upload end-to-end działa: resize w przeglądarce, streaming multipart na dysk,
worker miniatur. Ryzyko HEIC z §9 ARCHITECTURE.md rozbrojone.

## Następny krok

v0.4 z planu (ARCHITECTURE.md §7): gra — model gościa/zadań w UI, wybór zadania,
przypisanie zdjęć, CRUD zadań w panelu admina (dziś zadania to placeholdery
z migracji `002_seed_tasks.sql`).

## Docelowa treść zadań (ustalone 2026-08-30)

Realna lista zadań gry, do wpisania przez panel admina (v0.4), zastąpi placeholdery
z `002_seed_tasks.sql`:

1. Twoje zdjęcie
2. Zdjęcie z kimś, kogo nie znasz
3. Zdjęcie stołu i jedzenia
4. Selfie z kimś starszym/młodszym o co najmniej 10 lat
5. Zdjęcie sali
6. Zdjęcie w co najmniej 5 osób
7. Zdjęcie pary młodej z tortem
8. Zdjęcie z parą młodą
9. Zdjęcie pary młodej w trakcie aktywności

Punktacja i dokładne opisy do doprecyzowania przy budowie CRUD-a.

## v0.4 w toku — 2026-08-30

- [x] Migracja `003_real_tasks.sql` — dezaktywuje 5 placeholderów, wstawia 9 realnych
      zadań (po 1 pkt, do zmiany z admina). Idempotentna, dopasowanie po `title`.
- [x] `@fastify/basic-auth` — panel `/admin` i `/api/admin/*` za basic auth
      (`ADMIN_USER`/`ADMIN_PASS` w env, domyślnie `admin`/`admin` tylko dev —
      start loguje ostrzeżenie, jeśli zostaną domyślne)
- [x] `src/routes/admin.js` — `GET/POST /api/admin/tasks`, `PATCH /api/admin/tasks/:id`
      (walidacja: title wymagany, points/sort_order całkowite, rozróżnienie
      "pole nieobecne" od "pole=false" — złapany i naprawiony bug przy testach curl)
- [x] `admin/index.html`, `admin/app.js`, `admin/style.css` — osobny katalog
      (NIE `public/`, żeby fastifyStatic nie serwował go bez auth), prosty CRUD
- [x] `GET /api/tasks` zwraca teraz `done` per gość (na podstawie cookie) —
      "zrobione" = ma choć jedno zdjęcie wysłane do zadania, nie sam submission
- [x] `public/app.js` — karta zadania pokazuje "Zrobione ✓" + link "jeszcze raz"
      zamiast przycisku, gdy `done: true`
- [x] Testy curl: zadania publiczne, gating admina (401/401/200), CRUD (POST/PATCH),
      walidacja pustego tytułu, pełny przepływ gość→zgłoszenie→upload→`done:true`
      — wszystko zielone na dev-serwerze (`/tmp/fotofoto-dev-data`)

### Test na telefonie — 2026-08-30

- Upload zdjęcia (VPN, iPhone): działa, 1536×2048 JPEG, task "Twoje zdjęcie",
  miniatura wygenerowana poprawnie.
- **Bug 1**: `GET /admin` (bez końcowego `/`) dawał 404 JSON zamiast strony —
  telefon próbował to zapisać jako plik `admin.json`. `redirect: true` w
  `@fastify/static` łapie tylko podkatalogi, nie sam prefiks. Naprawione
  jawnym `scoped.get('/admin', ...) => reply.redirect('/admin/')`.
- **Bug 2**: stare placeholdery z `002_seed_tasks.sql` (dezaktywowane w `003`)
  zostały w tabeli w tym samym zakresie `sort_order` co realne zadania —
  w panelu admina łatwo trafić w niewłaściwy wiersz. Faktycznie się zdarzyło:
  PATCH przypadkiem trafił w id 1 ("Selfie z Parą Młodą") zamiast id 13
  ("Zdjęcie z parą młodą"), reaktywując stary placeholder jako duplikat
  na liście gościa. Naprawione strukturalnie migracją `004_drop_placeholder_tasks.sql`
  (usuwa placeholdery na stałe — bezpieczne, zero submissions na produkcji
  wskazywało na te id).

### v0.4 zamknięte — 2026-08-30

Drugi test na telefonie (czysty stan) przeszedł bez zarzutu: front pokazuje
"Zrobione ✓" po uploadzie, panel admina pokazuje dokładnie 9 zadań, bez duchów.
Tag `v0.4.0`, deploy na Pi.

## v0.5 w toku — 2026-08-30

- [x] `src/routes/media.js` — `GET /media/thumb/:id.webp`, `GET /media/original/:id.jpg`,
      walidacja id po wzorcu UUID (ochrona przed path traversal), `nosniff`,
      cache-control długi (pliki są niemutowalne — nazwa to UUID)
- [x] `src/routes/feed.js` — `GET /api/feed?cursor=`, paginacja keyset po
      `(created_at, id)` zamiast OFFSET — stabilna mimo nowych zdjęć w trakcie
      przewijania. Przetestowane na 26 zdjęciach: dwie strony, zero duplikatów.
- [x] `src/routes/admin.js` — `GET /api/admin/photos`, `POST /api/admin/photos/:id/hide`
      (przełącza `submissions.status`, nie dotyka schematu), `GET /api/admin/export.zip`
- [x] Publiczna galeria: `public/feed.html` + `feed.js`, link z `index.html`
- [x] Panel admina: sekcja "Zdjęcia" z podglądem, przyciskiem ukryj/pokaż,
      linkiem do eksportu ZIP

### Napotkane i naprawione po drodze

- `archiver` w `package.json` to od razu **v8** — inne API niż klasyczne
  tutoriale (`new ZipArchive(opts)`, nie `archiver('zip', opts)`).
- **Prawdziwy bug**: `reply.send(archive)` + `archive.finalize()` bez
  `await` dawało poprawny `200 application/zip`, ale **0 bajtów** — Fastify
  kończył odpowiedź, zanim archiwum zdążyło coś wypchnąć. Naprawione przez
  `await archive.finalize()` na końcu handlera (kolejność ważna: `reply.send`
  musi podpiąć konsumenta PRZED finalize, inaczej przy dużym eksporcie
  groziłby deadlock na buforze strumienia).
- Syntetyczne "zdjęcia" testowe muszą być prawdziwym JPEG-iem (np. z PIL) —
  same magic bytes przechodzą upload, ale `sharp` nie zrobi z tego miniatury
  (worker zapętla się w błędzie, zgodnie z zamierzeniem — cichy brak
  miniatury byłby gorszy).

### v0.5 zamknięte — 2026-08-30

Test na telefonie przeszedł bez zarzutu: galeria, ukrywanie, eksport ZIP.
Hasło do `/admin` (dev i produkcja) ustawione na "ricky" na czas testów —
**do zmiany na coś mocniejszego przed v1.0**, kiedy panel wyjdzie do internetu
przez Cloudflare Tunnel. Tag `v0.5.0`, deploy na Pi.

## v0.6 w toku — 2026-08-30

- [x] Twardy limit **1000 zdjęć łącznie** (`MAX_TOTAL_PHOTOS` w `submissions.js`) —
      507 przy przekroczeniu. Decyzja użytkownika: prosty limit liczby zamiast
      liczenia wolnego miejsca na dysku (statvfs) — wystarczające na skalę wesela.
- [x] Rate limit per IP na `/api/submissions*` (`@fastify/rate-limit`, 30/min) —
      **bug po drodze**: `errorResponseBuilder` zwracający zwykły obiekt trafia
      w pluginie do `throw`, więc bez `statusCode` na obiekcie fastify dawał 500,
      nie 429. Naprawione zwracaniem `Error` z ustawionym `.statusCode`. Dodatkowo
      pole `error` w body domyślnie brzmiało "Too Many Requests" (angielski
      boilerplate fastify) zamiast polskiego komunikatu z `message` — ujednolicone
      lokalnym `setErrorHandler` w `submissions.js`.
- [x] Kolejka offline w IndexedDB (`public/app.js`): `fetch` rzucający `TypeError`
      (brak sieci) trafia do kolejki zamiast gubić zdjęcie; jawny błąd serwera
      (`HttpError`) pokazuje się od razu, bez sensu w kolejkowaniu. Retry: przy
      starcie, na event `online`, i co 20s jako siatka bezpieczeństwa (telefony
      nie zawsze rzetelnie odpalają `online`). Stan "w kolejce" przeżywa reload
      strony (`applyQueuedState()` czyta IndexedDB przy starcie).
- [ ] Backup na drugi nośnik (cron) — **do ustalenia z użytkownikiem, jaki
      nośnik jest dostępny** zanim to zakoduję (drugi dysk? chmura? nic jeszcze?).

### Bug zgłoszony przez użytkownika po teście — 2026-08-30

"Brak zasięgu" i "Zrobione" pokazywały się na **wszystkich** kartach zadań
naraz, cały czas, niezależnie od stanu. Przyczyna: `.done-row`, `.queued-row`
i `.shoot-btn` (ten ostatni od v0.4) mają jawny `display:` w CSS — przy
takiej samej specyficzności jak domyślna reguła przeglądarki `[hidden]
{display:none}`, wygrywa reguła autora (czyli nasza), więc atrybut `hidden`
ustawiany z JS-a był całkowicie ignorowany. To był bug od v0.4, niezauważony
bo test dotykał tylko jednej karty na raz.

Naprawione jedną regułą globalną `[hidden] { display: none !important; }`
w `public/style.css` i defensywnie w `admin/style.css` (ten sam wzorzec,
jeszcze nieujawniony, ale to ta sama pułapka) — rozwiązuje to też ukryty
wcześniej bug w `.load-more` na `/feed.html` (przycisk był zawsze widoczny
nawet przy pustym feedzie).

### v0.6 zamknięte — 2026-08-30

Retest po poprawce CSS przeszedł idealnie: tylko właściwa karta zmienia
stan, offline queue działa (offline → "w kolejce" → online → auto-wysyłka).

Backup na drugi nośnik świadomie odpuszczony — użytkownik nie ma zapasowego
dysku. Zaakceptowane ryzyko: awaria jedynego SSD = utrata wszystkich zdjęć.
Zapisane w README jako otwarte ryzyko do rewizji, gdyby pojawił się drugi
nośnik przed weselem. Tag `v0.6.0`, deploy na Pi.

## Produkcja wyłączona — 2026-08-30

Apka nie musi chodzić aż do ok. 25 września 2026 (przed weselem 3.10.2026).
Usługa `fotofoto` zatrzymana i wyłączona z autostartu:

```
sudo systemctl disable --now fotofoto
```

**Żeby wrócić do pracy** (bliżej 25 września albo przy dalszym developmencie):

```
sudo systemctl enable --now fotofoto
curl http://127.0.0.1:3000/healthz   # powinno zwrócić {"ok":true,...}
```

Dane (`/srv/fotofoto/data`) i kod (`/srv/fotofoto/app`, tag v0.6.0) zostają
nietknięte — wyłączenie usługi niczego nie kasuje.

## Następny krok

v1.0 z planu (ARCHITECTURE.md §7): Cloudflare Tunnel, domena, HTTPS, kod QR,
test obciążeniowy, próba generalna z 5 osobami na prawdziwych telefonach.
To ostatnia wersja przed weselem — wymaga decyzji użytkownika: nazwa domeny
(do kupienia) i czy ma/chce konto Cloudflare. Do podjęcia bliżej terminu,
apka nie musi być live wcześniej.

## Jak przetestować z telefonu (do zrobienia przez Ciebie)

Telefon musi być w tej samej sieci Wi-Fi co Pi (`192.168.1.32`).

1. Otwórz na telefonie: **http://192.168.1.32:3001/**
2. Wpisz imię → „Wchodzę"
3. Przy dowolnym zadaniu kliknij „Zrób zdjęcie" — powinien otworzyć się aparat
4. Zrób zdjęcie → powinno się wysłać i pokazać „Wysłano! Dzięki 🎉"

Rzeczy do sprawdzenia szczególnie na iPhonie: czy `capture="environment"` faktycznie
otwiera aparat (nie tylko galerię), i czy `createImageBitmap` + canvas radzi sobie
z formatem, w jakim Safari oddaje zdjęcie (to jest dokładnie ryzyko HEIC z §9 ARCHITECTURE.md).

Backend loguje się do `/tmp/claude-1000/-home-kuba/1ba293b2-ba64-4c4f-b6cd-2d8ec86f1083/scratchpad/fotofoto-dev.log`
— jeśli coś nie zadziała, tam będzie stacktrace.

Headless chromium (dump-dom) na Pi się zawiesił przy próbie automatycznego smoke-testu
frontu — zabity, nie warto w to inwestować więcej czasu; realny test i tak wymaga
prawdziwego telefonu, nie headless przeglądarki.

## Wyniki testów backendu (curl, dev-serwer na porcie 3001, DATA_DIR=/tmp/fotofoto-dev-data)

Wszystko zgodne z oczekiwaniami:
- `POST /api/guest` → cookie ustawiona, `GET /api/guest/me` ją odczytuje ✓
- `POST /api/submissions` → `submission_id`, limit 100/dzień i sprawdzenie aktywności zadania działają ✓
- Upload syntetycznego JPEG 3000×2000 → plik na dysku, worker w ~1s zrobił miniaturę webp,
  `thumb_ready=1`, `width`/`height` poprawne w bazie ✓
- Odrzucenie pliku bez poprawnych magic bytes → **HTTP 415**, bez śmieci `.tmp` na dysku ✓
- Odrzucenie 25MB pliku (limit 20MB) → **HTTP 413**, bez śmieci `.tmp` ✓
- Brak cookie gościa → **HTTP 401** ✓
- Nieaktywne/nieistniejące `task_id` → 404 z czytelnym błędem ✓

## Kolejny krok (na teraz)

Minimalny front (public/app.js): identyfikacja gościa + przycisk „zrób zdjęcie" per zadanie,
resize w canvas przed wysyłką. Potem odpalenie na `0.0.0.0` do testu z telefonu.
