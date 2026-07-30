/**
 * Apply supabase/migrations/*.sql (and optionally seed.sql) to a hosted project
 * via the Supabase Management API.
 *
 * This exists because some environments can reach api.supabase.com but not the
 * project's own host or raw Postgres (5432/6543) — so neither `supabase db push`
 * nor psql can be used. The Management API's /database/query endpoint runs SQL
 * over HTTPS, which is enough to apply the whole schema.
 *
 * Applied versions are recorded in supabase_migrations.schema_migrations using
 * the same convention as the Supabase CLI, so a later `supabase db push` from a
 * developer machine sees these as already applied and does not re-run them.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcd \
 *     NODE_USE_ENV_PROXY=1 node scripts/supabase-migrate.mjs [--seed] [--dry-run]
 *
 * Node >= 22.21 needs NODE_USE_ENV_PROXY=1 for built-in fetch to honor HTTPS_PROXY.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const SEED_FILE = join(ROOT, 'supabase', 'seed.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const args = process.argv.slice(2);
const withSeed = args.includes('--seed');
const dryRun = args.includes('--dry-run');

if (!token || !ref) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF.');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${ref}/database/query`;

/** Run one SQL statement batch. Returns parsed rows; throws with the API error. */
async function runSql(sql, label) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.message ?? j.error ?? text;
    } catch {
      /* keep raw text */
    }
    throw new Error(`[${label}] HTTP ${res.status}: ${detail}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Project ${ref} — ${files.length} migration file(s) found.`);

  if (dryRun) {
    for (const f of files) console.log(`  would apply  ${f}`);
    if (withSeed) console.log('  would apply  seed.sql');
    return;
  }

  // Migration ledger, matching the Supabase CLI's schema/table names.
  await runSql(
    `create schema if not exists supabase_migrations;
     create table if not exists supabase_migrations.schema_migrations (
       version text primary key,
       name text,
       statements text[],
       inserted_at timestamptz not null default now()
     );`,
    'ledger',
  );

  const appliedRows = await runSql(
    'select version from supabase_migrations.schema_migrations order by version;',
    'read-ledger',
  );
  const applied = new Set(
    (Array.isArray(appliedRows) ? appliedRows : []).map((r) => String(r.version)),
  );

  let count = 0;
  for (const file of files) {
    const version = file.split('_')[0];
    const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '');

    if (applied.has(version)) {
      console.log(`  skip     ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  apply    ${file} … `);
    await runSql(sql, file);

    // Record it only after the migration itself succeeded.
    await runSql(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ('${version}', '${name.replace(/'/g, "''")}')
       on conflict (version) do nothing;`,
      `ledger:${version}`,
    );
    console.log('ok');
    count++;
  }

  console.log(count === 0 ? 'Schema already up to date.' : `Applied ${count} migration(s).`);

  if (withSeed) {
    process.stdout.write('  apply    seed.sql … ');
    await runSql(readFileSync(SEED_FILE, 'utf8'), 'seed.sql');
    console.log('ok');
  }
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
