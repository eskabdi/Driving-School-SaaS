/**
 * Deploy supabase/functions/* to a hosted project via the Supabase Management
 * API's single-file JSON endpoint (POST/PATCH /v1/projects/{ref}/functions),
 * instead of `supabase functions deploy`'s multipart bundle upload.
 *
 * This exists because some environments can reach api.supabase.com (a plain
 * JSON POST) but not the multipart upload the CLI performs — it hangs or 404s
 * behind a TLS-re-terminating egress proxy. The JSON endpoint takes one file's
 * raw source as `body`, so every function's `_shared/*` imports are inlined
 * here before sending, and its `npm:`-eligible bare specifiers (zod,
 * @supabase/supabase-js) are rewritten to explicit `npm:` specifiers since the
 * endpoint's `import_map` field is not honored in practice (confirmed live —
 * a bare `import { z } from 'zod'` fails to resolve at boot even when an
 * import_map is sent alongside `body`).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcd \
 *     NODE_USE_ENV_PROXY=1 node scripts/deploy-functions.mjs [name] [--dry-run]
 *
 * With no [name], deploys every function directory under supabase/functions/
 * (excluding _shared). Node >= 22.21 needs NODE_USE_ENV_PROXY=1 for built-in
 * fetch to honor HTTPS_PROXY.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const SHARED_DIR = join(FUNCTIONS_DIR, '_shared');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const target = args.find((a) => !a.startsWith('--'));

if (!token || !ref) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF.');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${ref}/functions`;

// Functions that must skip gateway JWT verification (docs/functions.md).
// Everything else is JWT-verified at the gateway, then role-checked inside
// _shared/handler.ts via requireAuth/allowedRoles.
const PUBLIC_FUNCTIONS = new Set(['submit-public-registration', 'verify-certificate', 'payment-webhook']);

const cors = stripHeaderComment(readFileSync(join(SHARED_DIR, 'cors.ts'), 'utf8'));
const errorsSrc = stripHeaderComment(readFileSync(join(SHARED_DIR, 'errors.ts'), 'utf8'));
const handlerSrc = readFileSync(join(SHARED_DIR, 'handler.ts'), 'utf8')
  .split('\n')
  .filter((line) => !/^import .* from '\.\/(cors|errors)\.ts';?$/.test(line.trim()))
  .join('\n');

function stripHeaderComment(src) {
  return src.replace(/^\/\/.*$/m, '');
}

function resolveBareSpecifiers(src) {
  return src
    .replace(/from '@supabase\/supabase-js'/g, "from 'npm:@supabase/supabase-js@2'")
    .replace(/from 'zod'/g, "from 'npm:zod@3'");
}

/** Inline _shared/* into one file and dedupe re-declared imports (handler.ts
 * already imports z/createClient; most function files re-import them too). */
function bundleFunction(slug) {
  const target = readFileSync(join(FUNCTIONS_DIR, slug, 'index.ts'), 'utf8')
    .split('\n')
    .filter((line) => !/^import .* from '\.\.\/_shared\/(handler|errors)\.ts';?$/.test(line.trim()))
    .join('\n');

  const bundled = [
    '// --- bundled: _shared/cors.ts ---',
    cors,
    '// --- bundled: _shared/errors.ts ---',
    errorsSrc,
    '// --- bundled: _shared/handler.ts ---',
    handlerSrc,
    `// --- ${slug}/index.ts ---`,
    target,
  ].join('\n\n');

  const resolved = resolveBareSpecifiers(bundled);
  const seenImports = new Set();
  return resolved
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('import ')) return true;
      if (seenImports.has(trimmed)) return false;
      seenImports.add(trimmed);
      return true;
    })
    .join('\n');
}

async function deployOne(slug) {
  const body = bundleFunction(slug);
  const verify_jwt = !PUBLIC_FUNCTIONS.has(slug);
  const payload = { slug, name: slug, verify_jwt, body };

  let res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 400) {
    const probe = await res.clone().text();
    if (probe.includes('Duplicated function slug')) {
      res = await fetch(`${API}/${slug}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
  }
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function discoverFunctions() {
  return readdirSync(FUNCTIONS_DIR).filter((name) => {
    if (name === '_shared' || name === 'deno.json') return false;
    return statSync(join(FUNCTIONS_DIR, name)).isDirectory();
  });
}

async function main() {
  const list = target ? [target] : discoverFunctions();
  console.log(`Project ${ref} — ${list.length} function(s) to deploy.`);

  if (dryRun) {
    for (const slug of list) {
      console.log(`  would deploy  ${slug}${PUBLIC_FUNCTIONS.has(slug) ? ' (no-verify-jwt)' : ''}`);
    }
    return;
  }

  let failures = 0;
  for (const slug of list) {
    process.stdout.write(`  deploy   ${slug} … `);
    const r = await deployOne(slug);
    if (r.ok) {
      console.log('ok');
    } else {
      failures++;
      console.log(`FAILED (${r.status}): ${r.text.slice(0, 300)}`);
    }
  }

  console.log(
    failures === 0
      ? `Deployed ${list.length} function(s).`
      : `Deployed ${list.length - failures}/${list.length}; ${failures} failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
