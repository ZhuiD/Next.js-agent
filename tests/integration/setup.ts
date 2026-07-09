import { config } from 'dotenv';

config({ path: '.env.test' });

if (process.env.TEST_DATABASE_URL) {
  // lib/prisma reads DATABASE_URL at import time.
  // Integration tests must opt into TEST_DATABASE_URL so we never wipe .env.local data.
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
