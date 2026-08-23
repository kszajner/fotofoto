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

## Stan: v0.1

Jest: szkielet serwera, SQLite z migracjami, `/api/tasks`, `/healthz`, statyczny front
listujący zadania.

Nie ma jeszcze: uploadu zdjęć (v0.3), gości i rozgrywki (v0.4), galerii i admina (v0.5).
Zadania w bazie to placeholdery z migracji `002_seed_tasks.sql`.
