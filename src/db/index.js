import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config, paths } from '../config.js';

let db;

export function getDb() {
  if (db) return db;

  fs.mkdirSync(paths.originals, { recursive: true });
  fs.mkdirSync(paths.thumbs, { recursive: true });

  db = new Database(paths.db);
  // WAL pozwala czytać feed w trakcie trwającego zapisu — bez tego
  // upload blokowałby przeglądanie galerii.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function closeDb() {
  if (!db) return;
  db.close();
  db = undefined;
}
