import fs from 'fs';
import path from 'path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

function resolveDbFilePath(): string {
  const raw = process.env.DATABASE_URL ?? path.join(process.cwd(), 'data', 'app.db');
  if (raw.startsWith('file:')) {
    return raw.slice('file:'.length);
  }
  return raw;
}

const dbFilePath = resolveDbFilePath();
const dbDir = path.dirname(dbFilePath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const client = createClient({ url: `file:${dbFilePath}` });

export const db = drizzle(client, { schema });

let initialized = false;

/** 首次访问时自动建表，避免额外跑迁移命令 */
export async function ensureDb() {
  if (initialized) return;

  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  initialized = true;
}
