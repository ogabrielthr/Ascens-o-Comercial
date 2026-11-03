import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const password = process.env.ASCENSAO_LOCAL_ADMIN_PASSWORD;
if (!password) throw new Error('Defina ASCENSAO_LOCAL_ADMIN_PASSWORD apenas no processo local.');
const status = execSync('npx.cmd supabase status -o env', { encoding: 'utf8', shell: process.env.ComSpec });
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map((match) => [match[1], match[2]]));
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = 'admin@ascensao.local';
const { data: users, error: listError } = await service.auth.admin.listUsers();
if (listError) throw listError;
let user = users.users.find((item) => item.email === email);
if (!user) {
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: 'Administrador Local' },
  });
  if (error) throw error;
  user = data.user;
}
const { data: org, error: orgError } = await service.from('organizations').select('id').limit(1).single();
if (orgError) throw orgError;
const { error: membershipError } = await service.from('organization_members').upsert({
  organization_id: org.id, user_id: user.id, role: 'admin', active: true,
}, { onConflict: 'organization_id,user_id' });
if (membershipError) throw membershipError;
console.log(`Administrador local pronto: ${email}`);
