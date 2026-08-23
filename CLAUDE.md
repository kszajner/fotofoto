# fotofoto — instrukcje projektowe

Gra weselna: gość wybiera zadanie, robi zdjęcie parze młodej, zdjęcie ląduje na dysku
Raspberry Pi 5. Strona wystawiona do internetu przez Cloudflare Tunnel na własnej domenie.
Skala: ~50 gości, ~400 zdjęć, jeden dzień.

Pełny kontekst projektu i historia decyzji: [docs/HANDOFF.md](docs/HANDOFF.md).
Architektura i plan wersji: [ARCHITECTURE.md](ARCHITECTURE.md).
Runbook Pi: [docs/PI-SETUP.md](docs/PI-SETUP.md).

## Twarde zasady

**Migracje wyłącznie addytywne.** Nowe tabele, nowe kolumny z wartością domyślną.
Nigdy `DROP COLUMN` ani zmiany typu. Powód: `deploy.sh` cofa kod, ale nie cofa schematu —
migracja destrukcyjna zamienia rollback z ratunku w drugą awarię.

**Zadania to dane, nie kod.** Treści zadań siedzą w tabeli `tasks` i są edytowalne
z panelu admina. Zmiana zadania nigdy nie może wymagać deployu.

**Brak kroku budowania frontendu.** Vanilla JS + natywne moduły ES. Bez bundlera,
bez transpilacji. Nie dodawaj Vite/webpacka/frameworka.

**Kompresja zdjęć po stronie przeglądarki**, nie na Pi. Canvas → JPEG ~2048 px.
To jednocześnie rozwiązuje HEIC z iPhone'a i zdejmuje obciążenie z CPU.

**Front buduje DOM przez `textContent`, nie `innerHTML`.** Treści zadań pochodzą
z panelu admina — traktujemy je jak dane.

**Galeria serwuje wyłącznie miniatury.** Oryginały tylko na wyraźne żądanie —
domowy uplink jest wąskim gardłem, nie Pi.

**Kod i dane rozdzielone.** `/srv/fotofoto/app` jest wymienialne, `/srv/fotofoto/data`
nietykalne. Deploy nigdy nie dotyka danych.

## Deploy

Każda wersja dostaje tag gita. Deploy odpala się **na Pi**, nigdy zdalnie z laptopa:

```
cd /srv/fotofoto/app && ./scripts/deploy.sh v0.3.0
```

Nie edytuj `/srv/fotofoto/app` ręcznie — to checkout produkcyjny, którym zarządza
wyłącznie `deploy.sh`. Praca deweloperska idzie w osobnym klonie (patrz HANDOFF).

## Konwencje

- Dokumentacja, komentarze i commity po polsku.
- Komentarze tłumaczą **dlaczego**, nie **co**.
- Node 24 LTS — ten sam major na każdej maszynie (ABI natywnych modułów).
- Raspberry Pi OS **64-bit** (arm64), inaczej brak prebuildów `sharp`/`better-sqlite3`.
