-- Schemat bazowy. Czasy trzymamy jako epoch ms (INTEGER).

CREATE TABLE guests (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Zadania są DANYMI, nie kodem: edytowalne z panelu admina,
-- zmiana treści zadania nie wymaga deployu.
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  points      INTEGER NOT NULL DEFAULT 1,
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE submissions (
  id         TEXT PRIMARY KEY,
  guest_id   TEXT NOT NULL REFERENCES guests(id),
  task_id    INTEGER NOT NULL REFERENCES tasks(id),
  created_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'hidden'))
);

CREATE INDEX idx_submissions_guest ON submissions (guest_id);
CREATE INDEX idx_submissions_task  ON submissions (task_id);

-- Nazwa pliku na dysku to id (UUID). original_name jest tylko informacyjna
-- i nigdy nie trafia do ścieżki ani do nagłówka odpowiedzi.
CREATE TABLE photos (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  thumb_ready   INTEGER NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  bytes         INTEGER,
  original_name TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_photos_submission ON photos (submission_id);
CREATE INDEX idx_photos_created    ON photos (created_at DESC);

-- Kolejka dla workera miniatur: indeks częściowy, więc jest mały
-- niezależnie od tego, ile zdjęć już przetworzono.
CREATE INDEX idx_photos_pending ON photos (created_at) WHERE thumb_ready = 0;
