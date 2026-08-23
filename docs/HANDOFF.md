# Kontekst projektu — przekazanie sesji

Dokument spisany 2026-08-23, na koniec pierwszej sesji pracy (prowadzonej na Windowsie).
Dalsza praca przenosi się na Raspberry Pi. Zawiera **całość ustaleń i uzasadnień**,
żeby nowa sesja nie musiała ich odtwarzać ani przelicytowywać od nowa.

---

## 1. Czym to jest

Gra weselna. Gość wchodzi na stronę z kodu QR ze stołu, wybiera zadanie fotograficzne,
robi zdjęcie parze młodej, zdjęcie ląduje na dysku Raspberry Pi 5 stojącego w domu
właściciela projektu i wystawionego do internetu.

Skala: **~50 gości, ~400 zdjęć, jeden dzień.** Konkretne treści zadań nie są jeszcze
ustalone i celowo są danymi w bazie, nie kodem.

---

## 2. Ustalenia infrastrukturalne i odrzucone alternatywy

Te decyzje są **zamknięte**. Zapisane razem z powodami, żeby nie otwierać ich ponownie
bez nowej informacji.

### Ekspozycja do internetu: Cloudflare Tunnel

Rozważone i odrzucone:

- **Przekierowanie portów + DDNS** — wymaga publicznego IPv4, wystawia domowe IP,
  izolację „widoczna tylko ta jedna strona" trzeba zbudować samemu i samemu się nie pomylić.
- **Tailscale Funnel** — dławienie pasma, nie do tego zaprojektowane.

Tunel wygrywa, bo mapuje **jeden hostname na jeden lokalny port**, a router nie ma
otwartego ani jednego portu. To dokładnie spełnia wymaganie „chcę, żeby tylko ta strona
była widoczna". Limit 100 MB na request na darmowym planie jest bez znaczenia dla zdjęć
(miałby znaczenie dla wideo).

### Odrzucona architektura: front na Netlify

Rozważana i **odrzucona świadomie**. Netlify Functions mają limit ~6 MB na request
i zero trwałego dysku, więc nie mogą pośredniczyć w uploadzie zdjęć. Podział
„front na Netlify + API na Pi" nadal wymaga wystawienia Pi, a dokłada CORS,
problemy z cookies między originami i drugi cel wdrożenia.

Rozważony był też wariant „Netlify + Cloudflare R2 + `rclone sync` na Pi", który jako
jedyny usuwał ryzyko awarii domowego prądu/łącza w trakcie wesela. **Właściciel projektu
wybrał świadomie prostszy wariant** (wszystko na Pi + tunel), akceptując to ryzyko.
Nie proponuj tego ponownie bez powodu.

### Domena

Jeszcze **niekupiona**. Ustalenia: standardowa porada „patrz na cenę odnowienia"
tu nie obowiązuje, bo domena jest jednorazowa (~2 miesiące użycia). Liczy się wyłącznie
cena pierwszego roku, odnowienia się nie robi.

- Rekomendacja: **Porkbun `.xyz`, ~8 zł** — czysto, bez upsellu.
- Absolutnie najtaniej: `.pl` w nazwa.pl (0 zł netto promocja), ale **trzeba od razu
  wyłączyć auto-odnowienie**, bo odnowienie to 50–200 zł netto.
- Tanie TLD (`.xyz`, `.top`, `.shop`) bywają oflagowane przez filtry antyspamowe —
  bez znaczenia przy kodzie QR, znaczenie ma przy wysyłaniu linku na grupę.
- **Wymóg techniczny:** DNS musi trafić na nameservery Cloudflare (rejestrator dowolny).

### VPN

Na Pi stoi **serwer WireGuard**. To przypadek zerowego konfliktu — nasłuchuje na swoim
porcie UDP, `cloudflared` robi połączenie wychodzące. Nie ma czego stroić.

Gdyby kiedyś doszedł **klient** VPN na Pi: jego kill switch ubijałby tunel, a część
providerów dławi QUIC (UDP 7844), na co lekarstwem jest `cloudflared --protocol http2`.

---

## 3. Stan faktyczny — co jest zweryfikowane, a co nie

### Zweryfikowane empirycznie (na Windowsie)

- `npm install` przechodzi; **`better-sqlite3` 13.0.3 wciągnął gotowy prebuild w 23 s,
  bez kompilacji** — natywne moduły są zdrowe dla ABI Node 24.
- Migracje nakładają się i są idempotentne (druga próba: „brak nowych migracji").
- `GET /healthz` → `{"ok":true,"version":"0.1.0","tasks":5,"uptime":1}`
- `GET /api/tasks` → 5 zadań-placeholderów z bazy.
- `/`, `/style.css`, `/app.js` → HTTP 200.
- `bash -n scripts/deploy.sh` — składnia czysta.
- `scripts/deploy.sh` ma w gicie tryb **100755** (ustawiony jawnie, bo Windows tego nie robi).
- Push na GitHub przeszedł: `main`, `v0.1.0`, `v0.2.0`.

### NIEzweryfikowane — zero potwierdzenia

**Nic nie zostało uruchomione na Raspberry Pi.** W szczególności nieznane jest:

- czy `npm ci` przejdzie na arm64 (prebuildy `better-sqlite3` dla arm64),
- czy unit systemd jest poprawny,
- czy `deploy.sh` faktycznie działa (sprawdzona wyłącznie składnia, nie wykonanie),
- czy montowanie dysku i `RequiresMountsFor` zachowują się jak zakładamy,
- czy aplikacja wraca sama po `reboot`.

**To jest dokładnie zakres v0.2 i pierwsza rzecz do zrobienia.**

---

## 4. Poprawki z przeglądu — klasa błędów, na którą uważać

Przed pushem znaleziono pięć błędów, wszystkie tej samej klasy: **kod pisany na Windowsie,
wykonywany na Linuksie**. Warto pamiętać ten wzorzec przy kolejnych skryptach.

| Błąd | Skutek |
|---|---|
| `git tag \| head -1` przy `set -o pipefail` | SIGPIPE → deploy pada z kodem 141, losowo |
| Brak `AF_NETLINK` w `RestrictAddressFamilies` | glibc nie odpyta interfejsów, Node pada na DNS-ie |
| `fstab` bez `nofail` | **Pi bez dysku nie kończy bootu — nie wstaje SSH** |
| `ssh-keygen` do nieistniejącego `.ssh/` | krok z deploy key nie przechodzi |
| Pierwszy deploy opisany jako `v0.1.0` | checkout usuwa `deploy.sh` spod bash-a w trakcie działania |

Dlatego w repo jest `.gitattributes` wymuszający LF — CRLF łamie shebang na Linuksie.

---

## 5. Zmiana środowiska pracy — ważne

Do tej pory obowiązywało „pracujemy na Windowsie, Pi to tylko cel wdrożenia".
**Od teraz praca odbywa się na Pi.** To zmienia dwie rzeczy:

### Dwa osobne klony, nie jeden

`/srv/fotofoto/app` to **checkout produkcyjny**, którym zarządza wyłącznie `deploy.sh`
(fetch → checkout taga → restart). Nie edytuj go ręcznie i nie pracuj w nim — inaczej
tracimy rollback, czyli plan awaryjny na wesele.

Pracuj w osobnym klonie w katalogu domowym, np. `~/fotofoto`, z własnym `DATA_DIR`:

```
DATA_DIR=~/fotofoto-dev-data npm run dev
```

### Deploy key nie umie pushować

Klucz wgrany na Pi w kroku 4 runbooka jest **tylko do odczytu** i celowo taki zostaje.
Do pushowania z klonu deweloperskiego potrzeba osobnego uwierzytelnienia — własnego
klucza SSH dodanego do konta GitHub albo `gh auth login`. Nie nadawaj deploy keyowi
prawa zapisu.

---

## 6. Fakty środowiskowe

- **Pi:** Raspberry Pi 5, Raspberry Pi OS 64-bit.
- **Repo:** `github.com/kszajner/fotofoto`, prywatne. Stan: `main` = `v0.2.0`.
- **Tożsamość gita** użyta w commitach: `jszajner11 <j.szajner11@gmail.com>`
  (właściciel repo to `kszajner` — push przeszedł, więc poświadczenia są w porządku).
- **Laptop Windows:** Node 24.19.0 zainstalowany przez winget, git 2.47.1.
  **Nie ma tam żadnego klucza SSH** (`~/.ssh` zawiera wyłącznie `known_hosts`) —
  to była przyczyna tego, że SSH do Pi „nie działało z tego laptopa".
- Node LTS w sierpniu 2026 to **24.x** — plan pierwotnie mówił o 22, zaktualizowano.

---

## 7. Pytania otwarte

1. **Data wesela.** Nieznana. Od niej zależy cały harmonogram, a zwłaszcza okno
   hard freeze (5 dni przed) i termin, do którego trzeba kupić domenę.
2. **Czy jest zewnętrzny SSD/pendrive na dane?** Niepotwierdzone. Jeśli nie ma —
   v0.2 da się dokończyć na karcie SD po zakomentowaniu `RequiresMountsFor`,
   ale **musi to być rozwiązane przed v0.3**, kiedy zaczynają lecieć zdjęcia.
3. **Zasięg LTE na sali weselnej.** Niezmierzony. To ryzyko numer jeden całego
   projektu i żadna optymalizacja kodu go nie naprawi. Do zmierzenia na miejscu.
4. **Domena** — do kupienia przed v1.0.

---

## 8. Następny krok

Wykonać `docs/PI-SETUP.md` sekcje 1–7, potem **sekcja 8: test odporności**
(`systemctl kill -s SIGKILL` oraz pełny `reboot`).

v0.2 jest domknięte dopiero wtedy, gdy aplikacja **wraca sama po reboocie**.
Nie zaczynaj v0.3 wcześniej — to jest awaria, której nie chcemy odkryć w dniu wesela.

Plan wersji od v0.3 w górę: [ARCHITECTURE.md](../ARCHITECTURE.md), sekcja 7.

### Ryzyko czekające w v0.3

HEIC z iPhone'a. Założenie: Safari dekoduje HEIC natywnie w canvas, a `toBlob('image/jpeg')`
zwraca już JPEG, więc kompresja po stronie klienta rozwiązuje problem sama.
**To założenie wymaga sprawdzenia na prawdziwym iPhonie**, nie w emulatorze.
Fallback: upload oryginału i konwersja przez `sharp` — ale domyślne buildy libvips
często nie mają obsługi HEIF, więc plan B może nie zadziałać i trzeba to wiedzieć wcześnie.
