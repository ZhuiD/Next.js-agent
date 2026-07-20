import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.test', quiet: true });

const action = process.argv[2];
const databaseUrl = process.env.TEST_DATABASE_URL;
const resetAllowed = process.env.ALLOW_TEST_DATABASE_RESET === 'true';
const requiredTables = [
  'Account',
  'AgentEvent',
  'AgentRun',
  'Chat',
  'Message',
  'QuotaUsage',
  'RateLimit',
  'Session',
  'User',
  'VerificationToken',
];

function fail(message) {
  console.error(`\nIntegration test database is not ready: ${message}\n`);
  process.exit(1);
}

function validateConfiguration() {
  if (!databaseUrl) return null;

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail('TEST_DATABASE_URL is not a valid PostgreSQL URL.');
  }

  const databaseName = parsed.pathname.replace(/^\//, '');
  if (databaseName !== 'codex_test') {
    fail('TEST_DATABASE_URL must point to a disposable database named codex_test.');
  }

  if (!resetAllowed) {
    fail('set ALLOW_TEST_DATABASE_RESET="true" because integration tests delete test rows.');
  }

  return databaseUrl;
}

async function checkDatabase(url) {
  const { Client } = pg;
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 3_000,
  });
  let failureMessage = null;

  try {
    await client.connect();
    const result = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'`,
    );
    const existingTables = new Set(result.rows.map(row => row.table_name));
    const missingTables = requiredTables.filter(name => !existingTables.has(name));

    if (missingTables.length > 0) {
      failureMessage =
        `missing tables: ${missingTables.join(', ')}. ` +
        'Run `pnpm db:test:migrate` first.';
    }
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? ` (${String(error.code)})`
        : '';
    failureMessage =
      `cannot connect to codex_test${code}. Start the optional local PostgreSQL service, ` +
      'or leave database integration tests to GitHub Actions.';
  } finally {
    await client.end().catch(() => undefined);
  }

  if (failureMessage) fail(failureMessage);
}

function migrateDatabase(url) {
  const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
    },
    stdio: 'inherit',
  });

  if (result.error) fail(`could not start Prisma: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

if (action !== 'check' && action !== 'migrate') {
  fail('expected action "check" or "migrate".');
}

const validatedUrl = validateConfiguration();

if (!validatedUrl) {
  if (action === 'migrate') {
    fail('copy .env.test.example to .env.test before running test migrations.');
  }

  console.log(
    'Local database integration tests are not configured; GitHub Actions runs them with a temporary PostgreSQL service.',
  );
  process.exit(0);
}

if (action === 'migrate') {
  migrateDatabase(validatedUrl);
} else {
  await checkDatabase(validatedUrl);
}
