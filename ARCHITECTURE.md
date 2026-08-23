# fotofoto — architektura i plan

Gra weselna: gość wybiera zadanie, robi zdjęcie parze młodej, zdjęcie ląduje na dysku
Raspberry Pi. Strona wystawiona przez Cloudflare Tunnel na własnej domenie.

Praca deweloperska: **Windows, bez dostępu do Pi na co dzień.** Pi jest środowiskiem
docelowym, nie środowiskiem pracy.

---

## 1. Decyzje architektoniczne

Cztery decyzje, z których wynika cała reszta:

**1.1 Brak kroku budowania frontendu.** Vanilla HTML/CSS/JS + natywne moduły ES.
Żadnego Vite, bundlera, transpilacji. Deploy to dosłownie skopiowanie plików —
nie ma stanu „dist nie zgadza się ze źródłem", nie ma toolchainu do zepsucia
na arm64. Przy tej skali framework nic nie wnosi.

**1.2 Kompresja zdjęcia w przeglądarce, przed wysłaniem.** Canvas → JPEG 2048 px / q0.82
(~500–900 KB zamiast 4 MB). To załatwia trzy problemy naraz: 5× mniej transferu,
brak obciążenia CPU Pi przy uploadzie, oraz **konwersję HEIC z iPhone'a** (Safari
dekoduje HEIC natywnie w canvas, a `toBlob` zwraca już JPEG).

**1.3 Zadania to dane, nie kod.** Zadania siedzą w bazie i są edytowalne z panelu
admina. Dodanie, zmiana treści czy wyłączenie zadania **nie jest deploymentem** —
można to zrobić z telefonu w dniu wesela.

**1.4 Kod i dane są rozdzielone na dysku.** Redeploy nigdy nie dotyka zdjęć.

---

## 2. Stack

| Warstwa | Wybór | Dlaczego |
|---|---|---|
| Runtime | Node 24 LTS | prebuildy arm64 dla natywnych modułów |
| HTTP | Fastify + `@fastify/multipart` | upload streamowany na dysk, nie do RAM |
| Baza | SQLite (`better-sqlite3`) | jeden plik, zero administracji, trywialny backup |
| Obrazy | `sharp` (libvips) | ~150 ms/miniatura na Pi 4 |
| Frontend | vanilla JS, ES modules | brak build stepu (p. 1.1) |
| Proces | systemd, `Restart=always` | autostart po zaniku prądu |
| Ekspozycja | `cloudflared` (named tunnel) | zero otwartych portów na routerze |

**Wymóg twardy: Raspberry Pi OS 64-bit.** Na 32-bit armv7 `sharp` i `better-sqlite3`
nie mają kompletu prebuildów i `npm ci` będzie próbował kompilować ze źródeł.

---

## 3. Układ na dysku Pi

```
/srv/fotofoto/
  app/                    <- checkout gita, wymienny przy każdym deployu
  data/                   <- na SSD/pendrive, NIGDY w gicie, nietykalne przy deployu
    fotofoto.db
    uploads/
      original/<uuid>.jpg
      thumb/<uuid>.webp
  backup/                 <- cel cronowego rsynca
/etc/fotofoto.env         <- konfiguracja, EnvironmentFile dla systemd
```

Nazwy plików to UUID-y generowane po stronie serwera. Oryginalna nazwa pliku od
klienta nie trafia nigdzie poza kolumnę w bazie — nie do ścieżki, nie do nagłówka.

---

## 4. Model danych

```sql
guests      (id TEXT PK, name TEXT, created_at INTEGER)
tasks       (id INTEGER PK, title TEXT, description TEXT,
             points INTEGER, active INTEGER, sort_order INTEGER)
submissions (id TEXT PK, guest_id TEXT, task_id INTEGER,
             created_at INTEGER, status TEXT)      -- ok | hidden
photos      (id TEXT PK, submission_id TEXT, thumb_ready INTEGER,
             width INTEGER, height INTEGER, bytes INTEGER, created_at INTEGER)
```

Tożsamość gościa: przy pierwszym wejściu podaje imię (albo numer stołu) → serwer
tworzy `guests` i ustawia cookie z `guest_id`. **Bez kont, bez haseł, bez rejestracji.**

---

## 5. API

```
GET   /                             strona (statyczna)
GET   /api/tasks                    lista aktywnych zadań
POST  /api/guest                    {name} -> ustawia cookie
GET   /api/guest/me
POST  /api/submissions              {task_id} -> submission_id
POST  /api/submissions/:id/photos   multipart, streamowany na dysk
GET   /api/feed?cursor=             strumień miniaturek
GET   /media/thumb/:id.webp
GET   /media/original/:id.jpg       rate-limited

--- admin, basic auth ---
GET   /admin
GET   /api/admin/tasks              CRUD zadań (p. 1.3)
POST  /api/admin/photos/:id/hide
GET   /api/admin/export.zip
```

### Ścieżka uploadu

1. Gość wybiera zadanie → `POST /api/submissions`
2. `<input type="file" accept="image/*" capture="environment">` otwiera aparat
3. Canvas resize → JPEG (p. 1.2)
4. `POST .../photos` — multipart streamowany prosto na dysk, wiersz z `thumb_ready = 0`
5. Worker w tle (concurrency 2, żeby zostawić CPU na requesty) robi miniaturę webp
6. Feed pokazuje miniaturę gdy `thumb_ready = 1`

Galeria serwuje **wyłącznie miniatury**. Oryginały jadą tylko na wyraźne żądanie —
inaczej domowy uplink pada przy kilkunastu osobach przewijających feed.

---

## 6. Bezpieczeństwo

- **Kod wstępu** — jednorazowo wpisywany, potem cookie. Odsiewa boty i przypadkowych.
- **Walidacja po magic bytes**, nie po rozszerzeniu. Odrzucamy co nie jest JPEG/PNG.
- **Limity**: 20 MB/plik, 100 zdjęć/gość/dobę, rate limit per IP na endpoincie uploadu.
- **Cloudflare**: bot fight mode + reguła rate limit przed aplikacją.
- Nagłówki: `nosniff`, jawny `content-type` przy serwowaniu mediów.
- Panel admina za basic auth, na osobnej ścieżce.

---

## 7. Wersje

Deploy na Pi jest **wcześnie i często** — nie na końcu. Ścieżka wdrożenia musi być
udowodniona na długo przed weselem, kiedy jest jeszcze czas ją naprawić.

| Wersja | Zakres | Efekt |
|---|---|---|
| **v0.1** | Szkielet: Fastify, SQLite + migracje, statyczny front, healthcheck. Tylko Windows. | `npm run dev` działa lokalnie |
| **v0.2** | **Pierwszy deploy na Pi.** systemd unit, `deploy.ps1`, układ katalogów, rollback. Apka nadal pusta. | ścieżka wdrożenia udowodniona |
| **v0.3** | Upload end-to-end: resize w canvas, streaming na dysk, worker miniatur. Test z prawdziwego iPhone'a i Androida. | zdjęcie z telefonu ląduje na dysku Pi |
| **v0.4** | Gra: goście, zadania, wybór zadania, przypisanie zdjęć. CRUD zadań w adminie. | działa pętla rozgrywki |
| **v0.5** | Feed z miniaturkami, panel admina, ukrywanie zdjęć, eksport ZIP. | para młoda ma dostęp do zdjęć |
| **v0.6** | Odporność: kolejka offline w IndexedDB + retry, rate limity, cron backup na drugi nośnik. | przeżywa słaby zasięg i zanik prądu |
| **v1.0** | Cloudflare Tunnel, domena, HTTPS, kod QR, test obciążeniowy, **próba generalna z 5 osobami na prawdziwych telefonach**. | gotowe na wesele |

### Kiedy można dodawać feature'y

- **Do v0.6 włącznie** — swobodnie, wszystko jest w grze.
- **Między v0.6 a v1.0** — tylko rzeczy nietykające schematu bazy.
- **Ostatnie 5 dni przed weselem — hard freeze.** Zero deployów. Jedyne dozwolone
  zmiany to treść zadań, bo to dane, nie kod (p. 1.3).

Rzeczy naturalnie doklejalne później, bez ruszania fundamentów: ranking gości,
reakcje/serduszka, slideshow na rzutnik, filtrowanie feedu po zadaniu, licznik postępu.

---

## 8. Jak pracujemy i jak to trafia na Pi

### Pętla deweloperska (Windows)

```
npm run dev          # nodemon, bind 0.0.0.0, port 3000
```

Testy na telefonie w trakcie pracy: telefon w tej samej sieci → `http://192.168.x.x:3000`.
Trzeba przepuścić port przez Windows Firewall. `<input capture>` działa po HTTP
(to zwykły file picker, nie `getUserMedia`), więc do testów aparatu nie potrzeba HTTPS.

### Przygotowanie Pi — jednorazowo

Pełny runbook: [docs/PI-SETUP.md](docs/PI-SETUP.md). W skrócie: Raspberry Pi OS Lite
64-bit, Node 24 z NodeSource, użytkownik `fotofoto`, SSD zamontowany na
`/srv/fotofoto/data`, deploy key do prywatnego repo, unit systemd.
`cloudflared` dochodzi dopiero w v1.0.

### Deploy

Repo prywatne: `github.com/kszajner/fotofoto`. Pi **ciągnie z gita** przez deploy key
(tylko odczyt) — nie wypychamy niczego z Windowsa.

Cała automatyka deployu jest w bashu i **wykonuje się na Pi**, nie na laptopie.
Na Windowsie tylko piszemy kod i pushujemy.

```
./scripts/deploy.sh            # najnowszy tag
./scripts/deploy.sh v0.3.0     # konkretny tag
```

Skrypt robi: `git fetch` → checkout taga → `npm ci --omit=dev` → migracje →
`systemctl restart` → healthcheck. Gdy healthcheck nie przejdzie w 30 s,
**sam cofa się na poprzedni commit**, przeinstalowuje zależności i restartuje.

Każda wersja z tabeli powyżej dostaje **tag gita**. To jest plan awaryjny na wesele:
rollback trwa kilkanaście sekund i nie wymaga myślenia.

`data/` nie jest w gicie i deploy jej nie dotyka, więc rollback kodu nigdy nie
zabierze zdjęć.

**Rollback cofa kod, nie schemat bazy.** Dlatego migracje piszemy wyłącznie
addytywnie: nowe tabele, nowe kolumny z wartością domyślną. Nigdy `DROP COLUMN`
ani zmiany typu — inaczej cofnięcie kodu zostawi starą aplikację przy nowym
schemacie.

---

## 9. Ryzyka do rozbrojenia wcześnie

| Ryzyko | Kiedy weryfikujemy | Rozbrojenie |
|---|---|---|
| HEIC z iPhone'a nie dekoduje się w canvas | **v0.3, na prawdziwym iPhonie** | fallback: upload oryginału + `sharp`; jeśli i to padnie, czytelny komunikat |
| Zasięg LTE na sali | pomiar na miejscu, przed v1.0 | kolejka offline (v0.6) + WiFi od sali |
| Utrata zdjęć | v0.6 | dane na SSD + cron rsync na drugi nośnik |
| Zanik prądu/netu w domu w trakcie wesela | v1.0 | `Restart=always`, autostart, healthcheck z powiadomieniem |
| Domowy uplink pada przy oglądaniu galerii | test obciążeniowy v1.0 | feed wyłącznie na miniaturach |
