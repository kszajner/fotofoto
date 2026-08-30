# Design — "instax"

Zatwierdzone 2026-08-30. Referencyjna makieta (Artifact, do wglądu):
https://claude.ai/code/artifact/80afd71b-73e7-4df1-b05d-4fc98fc1f49e

## Koncept

Zadanie = kwadratowa fotografia instax: gruba biała ramka papieru, zdjęcie
w środku, podpis pod spodem. Jesienny, ale nie ludowy — biel/czerń jako baza,
jeden akcent (ochra), zero motywów folk/wycinanek/liści.

**Po zrobieniu zdjęcia w "klatce" pokazuje się prawdziwe zdjęcie**, nie tylko
ptaszek — natychmiast z bloba w przeglądarce (zero czekania na serwer),
a po odświeżeniu strony z miniatury serwera (`/api/tasks` zwraca `photo_id`,
tylko gdy miniatura jest już gotowa — `GET /media/thumb/:id.webp`). Placeholder
z numerem klatki i sam ptaszek (`.checkmark`) zostają jako fallbacki na czas,
zanim zdjęcie/miniatura są dostępne.

## Paleta

**Bez trybu ciemnego** — jeden, stały wygląd (decyzja użytkownika 2026-08-30,
nie tylko `prefers-color-scheme`, usunięte całkowicie).

Karta/papier:
- `--card-paper: #fdfdfb` — papier
- `--card-ink: #171513` — tekst/pismo na papierze
- `--card-muted: #726c63`
- `--card-line: #e7e3da`
- `--blank-fill: #ece7dd` — niewywołana klatka
- `--card-accent: #a8752c` — ochra/musztarda (jedyny akcent; było wino
  `#6e2a34`, zmienione na coś bardziej neutralnego, dalej jesiennego)

Otoczenie strony ("blat"):
- `--page-bg: #f2efe8`, `--page-ink: #171513`, `--page-muted: #726c63`,
  `--page-accent: #a8752c`

## Typografia

- Nagłówki/logotyp: **Bricolage Grotesque** (bold/800) — charakterystyczny,
  nie "bezpieczny" Inter/Space Grotesk
- Treść: **Schibsted Grotesk** — czytelny na telefonie w słońcu
- Detale (data, liczby klatek): **Space Mono** — efekt wypalonej daty
- Odręczne akcenty (punkty, "wywołane!", inicjały): **Caveat** — używane
  oszczędnie, 2-3 miejsca max, nigdy jako główny font

Wszystkie z Google Fonts, link w `<head>`.

## Layout

- Karta zadania: kwadratowy `.photo-area` (placeholder z numerem klatki,
  po ukończeniu: wypełnienie `--card-accent` + duży ptaszek) + `.caption`
  pod spodem (tytuł, opis, punkty, przycisk)
- Lekki naprzemienny obrót kart (±1–1.5°) — efekt "rozrzuconych na stole"
  zdjęć, nie za mocny, nie przeszkadza w klikaniu
- Nagłówek: mały odręczny **"O × K"** nad kickerem, plakietka z datą ślubu
  (03·10·26) w rogu w stylu wypalonej daty z aparatu

## Zakres wdrożenia

Dotyczy tylko frontu gościa (`public/`) — `index.html`, `app.js`, `style.css`,
`feed.html`. Panel admina (`admin/`) zostaje bez zmian, to narzędzie
wewnętrzne, nie tożsamość dla gości.
