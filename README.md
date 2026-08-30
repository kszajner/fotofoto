# fotofoto

Gra weselna: gość wybiera zadanie, robi zdjęcie, zdjęcie ląduje na dysku Raspberry Pi.

Architektura, plan wersji i sposób wdrożenia: [ARCHITECTURE.md](ARCHITECTURE.md).

## Wymagania

- Node.js 24 LTS (`engines` w `package.json` tego pilnuje)
- Pi docelowo na Raspberry Pi OS **64-bit** — na 32-bit `sharp` i `better-sqlite3`
  nie mają prebuildów i `npm ci` kompilowałby ze źródeł

Wersja Node'a na Windowsie i na Pi musi mieć **ten sam major**. Natywne moduły
są budowane pod konkretne ABI i rozjazd wersji objawia się dopiero na Pi.

## Uruchomienie (Windows, dev)

```
npm install
npm run dev
```

Aplikacja startuje na <http://localhost:3000>. Migracje nakładają się same przy starcie.

### Test na telefonie

Serwer słucha na `0.0.0.0`, więc z telefonu w tej samej sieci Wi-Fi:
`http://<ip-windowsa>:3000` (`ipconfig` → IPv4). Trzeba przepuścić port 3000
przez Windows Firewall.

Uwaga: **klienci VPN domyślnie blokują ruch do sieci lokalnej.** Jeśli telefon
nie widzi serwera, a `localhost` działa — najpierw sprawdź VPN, nie firewall.

## Struktura

```
src/
  config.js            konfiguracja z env, ścieżki do danych
  server.js            wejście: Fastify, rejestracja tras, graceful shutdown
  db/
    index.js           połączenie SQLite (WAL, foreign keys)
    migrate.js         idempotentny runner migracji
    migrations/*.sql   migracje, nakładane w kolejności nazw
  routes/
    health.js          /healthz — dotyka bazy, używany przy deployu
    tasks.js           /api/tasks
public/                frontend, bez kroku budowania
scripts/migrate.js     CLI migracji dla deployu
data/                  baza i zdjęcia — poza repo, na Pi osobny wolumen
```

## Konfiguracja

Zmienne z `.env.example`. W devie działają domyślne, `.env` nie jest wymagany.
Na Pi trafiają do `/etc/fotofoto.env` (`EnvironmentFile` w systemd).

## Deploy na Pi

Cała automatyka deployu jest w bashu i **odpala się na Pi**, nie na Windowsie.
Jednorazowe przygotowanie maszyny: [docs/PI-SETUP.md](docs/PI-SETUP.md).

```
./scripts/deploy.sh            # najnowszy tag
./scripts/deploy.sh v0.2.0     # konkretny tag
```

Gdy healthcheck nie przejdzie w 30 s, skrypt sam cofa się na poprzedni commit.

## Stan: v0.5

Jest wszystko z v0.4 (gra, panel admina z CRUD zadań) — oraz galeria (v0.5):
publiczny feed z miniaturkami (`/feed.html`, paginacja keyset), serwowanie
`/media/thumb/:id.webp` i `/media/original/:id.jpg`, ukrywanie zdjęć i eksport
ZIP w panelu admina (foldery per zadanie). Zweryfikowane na telefonie.

Nie ma jeszcze: kolejki offline i backupu (v0.6), Cloudflare Tunnel/domeny (v1.0).
