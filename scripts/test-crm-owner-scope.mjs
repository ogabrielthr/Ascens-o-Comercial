import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const status = execSync('npx.cmd supabase status -o env', {
  encoding: 'utf8', shell: process.env.ComSpec,
});
const env = Object.fromEntries(
  [...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map((match) => [match[1], match[2]]),
);
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = env.ANON_KEY;
const suffix = Date.now();
const password = 'ScopeTest@2026!';
const createdUsers = [];
const createdOpportunities = [];
const createdContacts = [];
let teamId = null;
let organizationId = null;
const avatarPaths = [];
const paymentReceiptPaths = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createUser(email, role) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const { error: membershipError } = await service.from('organization_members').insert({
    organization_id: organizationId, user_id: data.user.id, role, active: true,
  });
  if (membershipError) throw membershipError;
  return { id: data.user.id, email, role };
}

async function login(account) {
  const client = createClient(env.API_URL, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password });
  if (error) throw error;
  return client;
}

try {
  const { data: organization, error: organizationError } = await service.from('organizations').select('id').limit(1).single();
  if (organizationError) throw organizationError;
  organizationId = organization.id;

  const [pipelineResult, stageResult, productResult] = await Promise.all([
    service.from('pipelines').select('id').eq('organization_id', organizationId).eq('active', true).limit(1).single(),
    service.from('pipeline_stages').select('id').eq('organization_id', organizationId).eq('stage_type', 'open').eq('active', true).order('position').limit(1).single(),
    service.from('products').select('id').eq('organization_id', organizationId).eq('active', true).limit(1).single(),
  ]);
  for (const result of [pipelineResult, stageResult, productResult]) if (result.error) throw result.error;

  const admin = await createUser(`scope-admin-${suffix}@ascensao.local`, 'admin');
  const manager = await createUser(`scope-manager-${suffix}@ascensao.local`, 'manager');
  const seller = await createUser(`scope-seller-${suffix}@ascensao.local`, 'commercial');

  const { data: team, error: teamError } = await service.from('teams').insert({
    organization_id: organizationId, name: `Equipe Scope ${suffix}`,
    manager_id: manager.id, active: true,
  }).select('id').single();
  if (teamError) throw teamError;
  teamId = team.id;
  const { error: teamMemberError } = await service.from('team_members').insert([
    { team_id: teamId, user_id: manager.id, is_manager: true },
    { team_id: teamId, user_id: seller.id, is_manager: false },
  ]);
  if (teamMemberError) throw teamMemberError;

  const adminClient = await login(admin);
  for (const [owner, name, cpf] of [
    [manager, 'Lead do gestor', '90909090001'],
    [seller, 'Lead do vendedor', '90909090002'],
  ]) {
    const { data: opportunity, error } = await adminClient.rpc('create_opportunity', {
      p_organization_id: organizationId,
      p_owner_id: owner.id,
      p_pipeline_id: pipelineResult.data.id,
      p_stage_id: stageResult.data.id,
      p_product_id: productResult.data.id,
      p_bank_id: null,
      p_source_id: null,
      p_full_name: name,
      p_phone: null,
      p_cpf: cpf,
      p_amount: 100,
      p_expected_close_date: null,
      p_notes: null,
      p_company_id: null,
    });
    if (error) throw error;
    createdOpportunities.push(opportunity.id);
    createdContacts.push(opportunity.contact_id);
  }

  const { data: adminLeads, error: adminReadError } = await adminClient.from('opportunities')
    .select('id, owner_id').in('id', createdOpportunities);
  if (adminReadError) throw adminReadError;
  assert(adminLeads.length === 2, 'O administrador deve visualizar toda a carteira.');

  const managerClient = await login(manager);
  const { data: managerLeads, error: managerReadError } = await managerClient.from('opportunities')
    .select('id, owner_id').in('id', createdOpportunities);
  if (managerReadError) throw managerReadError;
  assert(
    managerLeads.length === 1 && managerLeads[0].owner_id === manager.id,
    'Um usuario nao administrador deve visualizar somente leads de sua responsabilidade.',
  );

  const sellerClient = await login(seller);
  const { data: sellerCreated, error: sellerCreateError } = await sellerClient.rpc('create_opportunity', {
    p_organization_id: organizationId,
    p_owner_id: seller.id,
    p_pipeline_id: pipelineResult.data.id,
    p_stage_id: stageResult.data.id,
    p_product_id: productResult.data.id,
    p_bank_id: null, p_source_id: null,
    p_full_name: 'Lead criado pelo vendedor', p_phone: null,
    p_cpf: '90909090003', p_amount: 250,
    p_expected_close_date: null, p_notes: null, p_company_id: null,
  });
  if (sellerCreateError) throw sellerCreateError;
  createdOpportunities.push(sellerCreated.id);
  createdContacts.push(sellerCreated.contact_id);

  const { data: wonStage, error: wonStageError } = await service.from('pipeline_stages')
    .select('id').eq('pipeline_id', pipelineResult.data.id).eq('stage_type', 'won')
    .eq('active', true).is('deleted_at', null).limit(1).single();
  if (wonStageError) throw wonStageError;
  const { error: sellerWinWithoutReceiptError } = await sellerClient.rpc('transition_opportunity', {
    p_opportunity_id: sellerCreated.id, p_target_stage_id: wonStage.id,
    p_expected_version: sellerCreated.version, p_loss_reason_id: null,
  });
  assert(Boolean(sellerWinWithoutReceiptError) && /comprovante de pagamento/i.test(sellerWinWithoutReceiptError.message || ''),
    'O vendedor deve continuar impedido de ganhar um lead sem comprovante.');
  const { data: adminWonWithoutReceipt, error: adminWinWithoutReceiptError } = await adminClient.rpc('transition_opportunity', {
    p_opportunity_id: adminLeads[0].id, p_target_stage_id: wonStage.id,
    p_expected_version: 1, p_loss_reason_id: null,
  });
  if (adminWinWithoutReceiptError) throw adminWinWithoutReceiptError;
  assert(adminWonWithoutReceipt.status === 'won',
    'O administrador deve poder confirmar uma venda sem comprovante.');

  const avatarPath = `${seller.id}/scope-avatar-${suffix}.jpg`;
  const { error: avatarUploadError } = await sellerClient.storage.from('ascensao-avatars')
    .upload(avatarPath, new Blob(['fake-jpeg'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  if (avatarUploadError) throw avatarUploadError;
  avatarPaths.push(avatarPath);
  const { error: avatarProfileError } = await sellerClient.from('profiles')
    .update({ avatar_path: avatarPath }).eq('id', seller.id);
  if (avatarProfileError) throw avatarProfileError;

  const sellerReceiptPath = `${organizationId}/payment-receipts/${sellerCreated.id}/${seller.id}/${crypto.randomUUID()}-vendedor.pdf`;
  const sellerReceiptBody = new Blob(['Comprovante enviado pelo vendedor'], { type: 'application/pdf' });
  const { error: sellerReceiptUploadError } = await sellerClient.storage.from('ascensao-receipts')
    .upload(sellerReceiptPath, sellerReceiptBody, { contentType: 'application/pdf' });
  if (sellerReceiptUploadError) throw sellerReceiptUploadError;
  paymentReceiptPaths.push(sellerReceiptPath);
  const { error: sellerReceiptRecordError } = await sellerClient.from('payment_receipts').insert({
    organization_id: organizationId, opportunity_id: sellerCreated.id, uploaded_by: seller.id,
    original_name: 'comprovante-vendedor.pdf', storage_path: sellerReceiptPath,
    mime_type: 'application/pdf', size_bytes: sellerReceiptBody.size,
  });
  if (sellerReceiptRecordError) throw sellerReceiptRecordError;

  for (const opportunityId of createdOpportunities.slice(0, 2)) {
    const receiptPath = `${organizationId}/payment-receipts/${opportunityId}/${admin.id}/${crypto.randomUUID()}-ranking.pdf`;
    const receiptBody = new Blob(['Comprovante para teste do ranking'], { type: 'application/pdf' });
    const { error: receiptUploadError } = await adminClient.storage.from('ascensao-receipts')
      .upload(receiptPath, receiptBody, { contentType: 'application/pdf' });
    if (receiptUploadError) throw receiptUploadError;
    paymentReceiptPaths.push(receiptPath);
    const { error: receiptRecordError } = await adminClient.from('payment_receipts').insert({
      organization_id: organizationId, opportunity_id: opportunityId, uploaded_by: admin.id,
      original_name: 'comprovante-ranking.pdf', storage_path: receiptPath,
      mime_type: 'application/pdf', size_bytes: receiptBody.size,
    });
    if (receiptRecordError) throw receiptRecordError;
  }

  const closedAt = new Date().toISOString();
  const { error: rankingSeedError } = await service.from('opportunities').update({
    status: 'won', closed_at: closedAt, requested_reversal: 75, final_value: 500,
  }).in('id', createdOpportunities.slice(0, 2));
  if (rankingSeedError) throw rankingSeedError;
  const { data: sharedRanking, error: sharedRankingError } = await sellerClient
    .rpc('sales_ranking_entries', { p_organization_id: organizationId });
  if (sharedRankingError) throw sharedRankingError;
  assert(new Set(sharedRanking.map((row) => row.owner_id)).size >= 2,
    'O ranking agregado deve ser igual para todos sem liberar os cards dos colegas.');

  const { data: forbiddenFinance, error: financeReadError } = await sellerClient
    .from('financial_entries').select('id').eq('organization_id', organizationId);
  if (financeReadError) throw financeReadError;
  assert(forbiddenFinance.length === 0, 'Vendedor nao deve ler o modulo financeiro.');

  const sellerLead = adminLeads.find((lead) => lead.owner_id === seller.id);
  const { error: forbiddenTransition } = await managerClient.rpc('cancel_opportunity', {
    p_opportunity_id: sellerLead.id,
    p_expected_version: 1,
  });
  assert(Boolean(forbiddenTransition), 'O gestor nao pode alterar o lead do vendedor, mesmo pertencendo a mesma equipe.');

  console.log('CRM owner scope: vendedor cria o proprio lead; carteira isolada; ranking agregado compartilhado; avatar proprio e Financeiro restrito.');
} finally {
  if (avatarPaths.length) await service.storage.from('ascensao-avatars').remove(avatarPaths);
  if (paymentReceiptPaths.length) await service.storage.from('ascensao-receipts').remove(paymentReceiptPaths);
  if (createdOpportunities.length) await service.from('opportunities').delete().in('id', createdOpportunities);
  if (createdContacts.length) await service.from('contacts').delete().in('id', createdContacts);
  if (teamId) await service.from('teams').delete().eq('id', teamId);
  if (createdUsers.length && organizationId) {
    await service.from('organization_members').delete().eq('organization_id', organizationId).in('user_id', createdUsers);
  }
  for (const userId of createdUsers.reverse()) await service.auth.admin.deleteUser(userId);
}
