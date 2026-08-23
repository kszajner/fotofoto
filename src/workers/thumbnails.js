import path from 'node:path';
import sharp from 'sharp';

import { getDb } from '../db/index.js';
import { paths } from '../config.js';

const CONCURRENCY = 2; // zostawia CPU na obsługę requestów w trakcie wesela
const POLL_MS = 1000;
const THUMB_WIDTH = 480;

async function processOne(log, photo) {
  const src = path.join(paths.originals, `${photo.id}.jpg`);
  const dest = path.join(paths.thumbs, `${photo.id}.webp`);

  try {
    const img = sharp(src).rotate(); // rotate() bez argumentów: auto-orient z EXIF
    const meta = await img.metadata();
    await img.resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toFile(dest);

    getDb()
      .prepare(
        'UPDATE photos SET thumb_ready = 1, width = ?, height = ? WHERE id = ?',
      )
      .run(meta.width ?? null, meta.height ?? null, photo.id);
  } catch (err) {
    log.error({ err, photoId: photo.id }, 'miniatura: błąd przetwarzania');
    // Nie oznaczamy thumb_ready — kolejny tick spróbuje ponownie. Jeśli plik
    // jest trwale uszkodzony, zostanie w kolejce widoczny w logach na stałe,
    // co jest zamierzone: cichy brak miniatury byłby gorszy niż hałaśliwy błąd.
  }
}

// Poller, nie kolejka w pamięci: przeżywa restart usługi bez utraty zadań,
// bo stan „do zrobienia" to po prostu wiersz z thumb_ready = 0 w bazie.
export function startThumbnailWorker(log) {
  let stopped = false;
  let inFlight = 0;

  const tick = async () => {
    if (stopped) return;
    const free = CONCURRENCY - inFlight;
    if (free <= 0) return;

    const pending = getDb()
      .prepare(
        `SELECT id FROM photos WHERE thumb_ready = 0 ORDER BY created_at LIMIT ?`,
      )
      .all(free);

    for (const photo of pending) {
      inFlight += 1;
      processOne(log, photo).finally(() => {
        inFlight -= 1;
      });
    }
  };

  const interval = setInterval(tick, POLL_MS);
  tick();

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
