import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

function shouldUseSsl(connectionString: string) {
  try {
    const sslMode = new URL(connectionString).searchParams.get('sslmode');

    // Supabase requires SSL, while GitHub Actions' local Postgres service does not.
    // Let CI opt out explicitly with sslmode=disable instead of weakening production.
    return sslMode !== 'disable';
  } catch {
    return true;
  }
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  ...(shouldUseSsl(databaseUrl) ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
