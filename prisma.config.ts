import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '.env.local' });
config();

function withRequiredSsl(databaseUrl: string | undefined) {
  if (!databaseUrl?.startsWith('postgres')) return databaseUrl;

  const url = new URL(databaseUrl);
  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require');
  }

  return url.toString();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: withRequiredSsl(process.env.DIRECT_URL ?? process.env.DATABASE_URL),
  },
});
