import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

export const config = {
  version: pkg.version,
  rootDir,
  publicDir: path.join(rootDir, 'public'),
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Bezwzględny DATA_DIR (Pi: /srv/fotofoto/data) zostaje jak jest,
  // względny (dev na Windowsie) liczy się od katalogu projektu.
  dataDir: path.resolve(rootDir, process.env.DATA_DIR ?? 'data'),
};

export const paths = {
  db: path.join(config.dataDir, 'fotofoto.db'),
  originals: path.join(config.dataDir, 'uploads', 'original'),
  thumbs: path.join(config.dataDir, 'uploads', 'thumb'),
};
