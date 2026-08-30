import fs from 'node:fs';
import path from 'node:path';

import { paths } from '../config.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Filename od klienta nigdy nie trafia tutaj — id musi wyglądać jak UUID
// wygenerowany przez serwer, inaczej to próba przejścia po dysku (../../).
function parseId(filename, ext) {
  if (!filename.endsWith(ext)) return null;
  const id = filename.slice(0, -ext.length);
  return UUID_RE.test(id) ? id : null;
}

async function streamFile(reply, filePath, contentType) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    return reply.code(404).send();
  }
  reply.header('content-type', contentType);
  reply.header('x-content-type-options', 'nosniff');
  reply.header('cache-control', 'public, max-age=31536000, immutable');
  return reply.send(fs.createReadStream(filePath));
}

// Ukrywanie (submissions.status='hidden') dotyczy tylko /api/feed — link do
// konkretnego zdjęcia (UUID, nieodgadywalny) działa dalej. Prościej i
// wystarczająco na skalę wesela; pełne blokowanie wymagałoby drugiego
// zestawu tras tylko dla admina.
export default async function mediaRoutes(app) {
  app.get('/media/thumb/:filename', async (req, reply) => {
    const id = parseId(req.params.filename, '.webp');
    if (!id) return reply.code(404).send();
    return streamFile(reply, path.join(paths.thumbs, `${id}.webp`), 'image/webp');
  });

  app.get('/media/original/:filename', async (req, reply) => {
    const id = parseId(req.params.filename, '.jpg');
    if (!id) return reply.code(404).send();
    return streamFile(reply, path.join(paths.originals, `${id}.jpg`), 'image/jpeg');
  });
}
