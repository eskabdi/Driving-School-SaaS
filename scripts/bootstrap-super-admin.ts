/**
 * Bootstrap the first platform super_admin (spec §8.4).
 *
 * Run once per environment:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     pnpm tsx scripts/bootstrap-super-admin.ts admin@example.com
 *
 * Refuses to run if a super_admin already exists. The invited user sets their
 * own password via the email link; MFA enrollment is forced on first login.
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.argv[2];

  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
    process.exit(1);
  }
  if (!email) {
    console.error('Usage: pnpm tsx scripts/bootstrap-super-admin.ts <email>');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Refuse if a super_admin already exists.
  const { data: existing, error: exErr } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'super_admin')
    .limit(1);
  if (exErr) {
    console.error('Could not query users:', exErr.message);
    process.exit(1);
  }
  if (existing && existing.length > 0) {
    console.error('A super_admin already exists. Refusing to create another.');
    process.exit(1);
  }

  const { data: invited, error: iErr } = await supabase.auth.admin.inviteUserByEmail(email);
  if (iErr || !invited?.user) {
    console.error('Could not invite user:', iErr?.message);
    process.exit(1);
  }

  const { error: uErr } = await supabase.from('users').insert({
    auth_user_id: invited.user.id,
    tenant_id: null,
    role: 'super_admin',
    status: 'invited',
    full_name: 'Platform Super Admin',
  });
  if (uErr) {
    await supabase.auth.admin.deleteUser(invited.user.id);
    console.error('Could not create users row:', uErr.message);
    process.exit(1);
  }

  console.log(`✓ Invited super_admin ${email}. They must set a password via the email link.`);
}

void main();
