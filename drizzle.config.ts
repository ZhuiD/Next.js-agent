import path from 'path';
import { defineConfig } from 'drizzle-kit';

const dbFile = process.env.DATABASE_URL?.startsWith('file:')
  ? process.env.DATABASE_URL
  : `file:${process.env.DATABASE_URL ?? path.join(process.cwd(), 'data', 'app.db')}`;

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbFile,
  },
});
