import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './index.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Nakłada migracje, których jeszcze nie ma w tabeli _migrations.
 * Idempotentne — bezpiecznie wołać przy każdym starcie i przy każdym deployu.
 * Zwraca liczbę nałożonych migracji.
 */
export function migrate({ log = console.log } = {}) {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const pending = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !applied.has(f));

  if (pending.length === 0) return 0;

  const record = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Migracja i wpis o niej w jednej transakcji — nie da się nałożyć
    // połowy migracji i uznać jej za zrobioną.
    db.transaction(() => {
      db.exec(sql);
      record.run(file, Date.now());
    })();
    log(`migracja: ${file}`);
  }

  return pending.length;
}
