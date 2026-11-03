import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const status = execSync('npx.cmd supabase status -o env', { encoding: 'utf8', shell: process.env.ComSpec });
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map((match) => [match[1], match[2]]));
const url = env.API_URL;
const anonKey = env.ANON_KEY;
const serviceKey = env.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error('Supabase local nao esta disponivel.');

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const email = `integration-${Date.now()}@ascensao.local`;
const password = 'LocalTest@2026!';
let userId;
let invitedUserId;
let paymentReceiptPath;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const { data: org, error: orgError } = await service.from('organizations').select('id').limit(1).single();
  if (orgError) throw orgError;
  const { data: authData, error: authError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError) throw authError;
  userId = authData.user.id;
  const { error: memberError } = await service.from('organization_members').insert({
    organization_id: org.id, user_id: userId, role: 'admin', active: true,
  });
  if (memberError) throw memberError;

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  const { data: ownProfile, error: ownProfileError } = await client.from('profiles').update({
    full_name: 'Administrador Integracao', phone: '11966665555', extension: '101',
  }).eq('id', userId).select('full_name, phone, extension').single();
  if (ownProfileError) throw ownProfileError;
  assert(ownProfile.extension === '101', 'O perfil proprio deveria persistir sob RLS.');
  const { data: preferences, error: preferencesError } = await client.from('user_preferences').upsert({
    user_id: userId, theme: 'light', density: 'compact', sidebar_collapsed: true,
    hide_currency: false, default_module: 'crm', mood_checkin_enabled: true,
  }, { onConflict: 'user_id' }).select('*').single();
  if (preferencesError) throw preferencesError;
  assert(preferences.theme === 'light' && preferences.density === 'compact', 'As preferencias deveriam ser sincronizadas.');
  const changedPassword = 'LocalTestChanged@2026!';
  const { error: passwordError } = await client.auth.updateUser({ password: changedPassword });
  if (passwordError) throw passwordError;
  const { data: fileCategory, error: fileCategoryError } = await client.from('file_categories').insert({
    organization_id: org.id, name: `Categoria Integracao ${Date.now()}`, access_level: 'management',
  }).select('*').single();
  if (fileCategoryError) throw fileCategoryError;
  const storagePath = `${org.id}/${crypto.randomUUID()}-integracao.txt`;
  const fileBody = new Blob(['Arquivo de integracao Ascensão Comercial'], { type: 'text/plain' });
  const { error: storageUploadError } = await client.storage.from('ascensao-files').upload(storagePath, fileBody, { contentType: 'text/plain' });
  if (storageUploadError) throw storageUploadError;
  const { data: fileRecord, error: fileRecordError } = await client.from('files').insert({
    organization_id: org.id, category_id: fileCategory.id, name: 'Integracao.txt',
    storage_path: storagePath, mime_type: 'text/plain', size_bytes: fileBody.size,
    access_level: 'management', uploaded_by: userId,
  }).select('*').single();
  if (fileRecordError) throw fileRecordError;
  const { data: signedFile, error: signedFileError } = await client.storage.from('ascensao-files').createSignedUrl(storagePath, 60);
  if (signedFileError) throw signedFileError;
  const fileResponse = await fetch(signedFile.signedUrl);
  assert(fileResponse.ok && (await fileResponse.text()) === 'Arquivo de integracao Ascensão Comercial', 'A URL assinada deveria acessar o arquivo privado.');
  const { error: downloadLogError } = await client.from('file_downloads').insert({ organization_id: org.id, file_id: fileRecord.id, user_id: userId });
  if (downloadLogError) throw downloadLogError;
  const { error: fileArchiveError } = await client.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', fileRecord.id);
  if (fileArchiveError) throw fileArchiveError;
  const { error: storageRemoveError } = await client.storage.from('ascensao-files').remove([storagePath]);
  if (storageRemoveError) throw storageRemoveError;
  const { data: track, error: trackError } = await client.rpc('save_learning_track', {
    p_organization_id: org.id, p_track_id: null, p_title: 'Trilha Integracao', p_published: false,
  });
  if (trackError) throw trackError;
  const { data: lesson, error: lessonError } = await client.rpc('save_lesson', {
    p_track_id: track.id, p_lesson_id: null, p_title: 'Aula Integracao',
    p_duration_minutes: 5, p_content_url: 'https://example.com/aula', p_description: 'Autor: Ascensão Comercial',
  });
  if (lessonError) throw lessonError;
  const { error: publishError } = await client.rpc('save_learning_track', {
    p_organization_id: org.id, p_track_id: track.id, p_title: track.title, p_published: true,
  });
  if (publishError) throw publishError;
  const { data: completedLesson, error: completionError } = await client.rpc('set_lesson_completion', {
    p_lesson_id: lesson.id, p_completed: true,
  });
  if (completionError) throw completionError;
  assert(completedLesson.status === 'completed', 'A aula deveria ser concluida.');
  const { data: learningPoints, error: learningPointsError } = await service.from('point_events').select('event_type').eq('user_id', userId).in('event_type', ['lesson_completed', 'track_completed']);
  if (learningPointsError) throw learningPointsError;
  assert(learningPoints.length === 2, 'A conclusao deveria gerar pontos da aula e da trilha.');
  const { error: undoCompletionError } = await client.rpc('set_lesson_completion', { p_lesson_id: lesson.id, p_completed: false });
  if (undoCompletionError) throw undoCompletionError;
  const { count: remainingLearningPoints, error: remainingPointsError } = await service.from('point_events').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('event_type', ['lesson_completed', 'track_completed']);
  if (remainingPointsError) throw remainingPointsError;
  assert(remainingLearningPoints === 0, 'Desfazer conclusao deveria remover os pontos relacionados.');
  const { error: archiveLessonError } = await client.rpc('archive_lesson', { p_lesson_id: lesson.id });
  if (archiveLessonError) throw archiveLessonError;
  const { error: archiveTrackError } = await client.rpc('archive_learning_track', { p_track_id: track.id });
  if (archiveTrackError) throw archiveTrackError;
  const teamName = `Equipe Integracao ${Date.now()}`;
  const { data: team, error: teamError } = await client.rpc('save_team', {
    p_organization_id: org.id, p_team_id: null, p_name: teamName,
    p_color: '#ff9500', p_manager_id: userId,
  });
  if (teamError) throw teamError;
  const { data: editedTeam, error: editTeamError } = await client.rpc('save_team', {
    p_organization_id: org.id, p_team_id: team.id, p_name: teamName + ' Editada',
    p_color: '#ffaa00', p_manager_id: userId,
  });
  if (editTeamError) throw editTeamError;
  const { data: managerMembership, error: managerMembershipError } = await service.from('team_members').select('is_manager').eq('team_id', team.id).eq('user_id', userId).single();
  if (managerMembershipError) throw managerMembershipError;
  assert(editedTeam.manager_id === userId && managerMembership.is_manager, 'O gestor deveria ser atualizado atomicamente.');
  const { data: updatedOrg, error: updateOrgError } = await client.from('organizations').update({
    legal_name: 'Ascensão Comercial Integracao', founded_on: '2020-01-01', segment: 'Credito',
  }).eq('id', org.id).select('legal_name, founded_on, segment').single();
  if (updateOrgError) throw updateOrgError;
  assert(updatedOrg.segment === 'Credito', 'Os dados institucionais deveriam persistir.');
  const invitedEmail = `invited-${Date.now()}@ascensao.local`;
  const invitedPassword = 'InvitedLocal@2026!';
  const { data: inviteResult, error: inviteError } = await client.functions.invoke('invite-user', { body: {
    organizationId: org.id, email: invitedEmail,
    fullName: 'Usuario Convidado', role: 'commercial', teamId: null,
    initialPassword: invitedPassword,
  } });
  if (inviteError) throw inviteError;
  if (inviteResult?.error) throw new Error(inviteResult.error);
  invitedUserId = inviteResult.user.id;
  assert(inviteResult.delivery === 'password' && !inviteResult.activationLink,
    'O cadastro operacional deve usar a senha inicial definida pelo administrador.');
  assert(Boolean(inviteResult.user.teamId), 'O convite deve atribuir uma equipe ao usuario.');
  const { data: invitedTeamMember, error: invitedTeamMemberError } = await service.from('team_members')
    .select('team_id').eq('team_id', inviteResult.user.teamId).eq('user_id', invitedUserId).single();
  if (invitedTeamMemberError) throw invitedTeamMemberError;
  assert(invitedTeamMember.team_id === inviteResult.user.teamId, 'O usuario convidado deveria pertencer a equipe retornada.');
  const { data: profileResult, error: profileFunctionError } = await client.functions.invoke('manage-user', { body: {
    organizationId: org.id, userId: invitedUserId, action: 'update_profile',
    fullName: 'Usuario Editado', phone: '11977776666', extension: '204',
  } });
  if (profileFunctionError) throw profileFunctionError;
  if (!profileResult?.ok) throw new Error(profileResult?.error || 'A edicao de perfil deveria funcionar.');
  const { data: editedProfile, error: editedProfileError } = await service.from('profiles').select('full_name, phone, extension').eq('id', invitedUserId).single();
  if (editedProfileError) throw editedProfileError;
  assert(editedProfile.phone === '11977776666' && editedProfile.extension === '204', 'O perfil deveria persistir telefone e ramal.');
  const invitedClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: invitedLoginError } = await invitedClient.auth.signInWithPassword({
    email: invitedEmail, password: invitedPassword,
  });
  if (invitedLoginError) throw invitedLoginError;
  const { data: passwordResult, error: managedPasswordError } = await client.functions.invoke('manage-user', { body: {
    organizationId: org.id, userId: invitedUserId, action: 'set_password', password: 'UpdatedLocal@2026!',
  } });
  if (managedPasswordError) throw managedPasswordError;
  assert(passwordResult?.ok, 'O administrador deve poder redefinir a senha operacional.');
  const { data: forbiddenReset, error: forbiddenResetError } = await invitedClient.functions.invoke('manage-user', { body: {
    organizationId: org.id, userId, action: 'set_password', password: 'ShouldNeverApply@2026!',
  } });
  assert(Boolean(forbiddenResetError || forbiddenReset?.error), 'Um vendedor nao pode redefinir a senha de outra conta.');
  const { data: manageResult, error: manageError } = await client.functions.invoke('manage-user', { body: {
    organizationId: org.id, userId: invitedUserId, action: 'set_active', active: false,
  } });
  if (manageError) throw manageError;
  if (!manageResult?.ok) throw new Error(manageResult?.error || 'A gestao de usuario deveria funcionar.');
  const [pipelineResult, stageResult, productResult] = await Promise.all([
    client.from('pipelines').select('id').eq('organization_id', org.id).limit(1).single(),
    client.from('pipeline_stages').select('id').eq('organization_id', org.id).eq('stage_type', 'open').order('position').limit(1).single(),
    client.from('products').select('id').eq('organization_id', org.id).eq('active', true).limit(1).single(),
  ]);
  for (const result of [pipelineResult, stageResult, productResult]) if (result.error) throw result.error;
  const { data: createdStage, error: createStageError } = await client.rpc('save_pipeline_stage', {
    p_pipeline_id: pipelineResult.data.id, p_stage_id: null, p_name: 'Etapa Integracao',
    p_sla_days: 2, p_probability: 35, p_color: '#123456',
  });
  if (createStageError) throw createStageError;
  const { data: editedStage, error: editStageError } = await client.rpc('save_pipeline_stage', {
    p_pipeline_id: pipelineResult.data.id, p_stage_id: createdStage.id, p_name: 'Etapa Integracao Editada',
    p_sla_days: 4, p_probability: 45, p_color: '#654321',
  });
  if (editStageError) throw editStageError;
  assert(editedStage.sla_days === 4, 'A etapa deveria persistir a edicao.');
  const { data: stageList, error: stageListError } = await client.from('pipeline_stages').select('id, stage_type').eq('pipeline_id', pipelineResult.data.id).is('deleted_at', null).order('position');
  if (stageListError) throw stageListError;
  const { error: reorderError } = await client.rpc('reorder_pipeline_stages', {
    p_pipeline_id: pipelineResult.data.id, p_stage_ids: stageList.map((stage) => stage.id),
  });
  if (reorderError) throw reorderError;
  const { data: archivedStage, error: archiveStageError } = await client.rpc('archive_pipeline_stage', { p_stage_id: createdStage.id });
  if (archiveStageError) throw archiveStageError;
  assert(Boolean(archivedStage.deleted_at), 'A etapa deveria usar exclusao logica.');

  const { data: opportunity, error: opportunityError } = await client.rpc('create_opportunity', {
    p_organization_id: org.id, p_owner_id: userId, p_pipeline_id: pipelineResult.data.id,
    p_stage_id: stageResult.data.id, p_product_id: productResult.data.id,
    p_bank_id: null, p_source_id: null, p_full_name: 'Contato Integracao',
    p_phone: '11999990000', p_cpf: '98765432100', p_amount: 1000,
    p_expected_close_date: null, p_notes: null, p_company_id: null,
  });
  if (opportunityError) throw opportunityError;
  assert(opportunity.status === 'open', 'A oportunidade deveria iniciar aberta.');
  paymentReceiptPath = `${org.id}/payment-receipts/${opportunity.id}/${userId}/${crypto.randomUUID()}-comprovante.pdf`;
  const receiptBody = new Blob(['Comprovante de integracao Ascensão Comercial'], { type: 'application/pdf' });
  const { error: receiptUploadError } = await client.storage.from('ascensao-receipts')
    .upload(paymentReceiptPath, receiptBody, { contentType: 'application/pdf' });
  if (receiptUploadError) throw receiptUploadError;
  const { data: receiptRecord, error: receiptRecordError } = await client.from('payment_receipts').insert({
    organization_id: org.id, opportunity_id: opportunity.id, uploaded_by: userId,
    original_name: 'comprovante.pdf', storage_path: paymentReceiptPath,
    mime_type: 'application/pdf', size_bytes: receiptBody.size,
  }).select('*').single();
  if (receiptRecordError) throw receiptRecordError;
  const { data: signedReceipt, error: signedReceiptError } = await client.storage.from('ascensao-receipts')
    .createSignedUrl(receiptRecord.storage_path, 60);
  if (signedReceiptError) throw signedReceiptError;
  const receiptResponse = await fetch(signedReceipt.signedUrl);
  assert(receiptResponse.ok && (await receiptResponse.text()) === 'Comprovante de integracao Ascensão Comercial',
    'O comprovante privado deveria ser acessivel apenas por URL assinada.');
  const { data: mentionedMessage, error: mentionedMessageError } = await client.from('opportunity_messages').insert({
    organization_id: org.id, opportunity_id: opportunity.id, author_id: userId,
    message_type: 'chat', body: 'Gestao acionada no teste local.', mentioned_user_ids: [userId],
  }).select('mentioned_user_ids').single();
  if (mentionedMessageError) throw mentionedMessageError;
  assert(mentionedMessage.mentioned_user_ids[0] === userId, 'O bate-papo deveria persistir a mencao ao administrador.');
  const { error: invalidMentionError } = await client.from('opportunity_messages').insert({
    organization_id: org.id, opportunity_id: opportunity.id, author_id: userId,
    message_type: 'chat', body: 'Mencao indevida.', mentioned_user_ids: [invitedUserId],
  });
  assert(Boolean(invalidMentionError), 'Somente usuarios ativos de gestao podem ser mencionados.');
  const { data: updatedBundle, error: updateError } = await client.rpc('update_opportunity_details', {
    p_opportunity_id: opportunity.id, p_expected_version: opportunity.version,
    p_owner_id: userId, p_product_id: productResult.data.id, p_bank_id: null,
    p_source_id: null, p_company_id: null, p_full_name: 'Contato Integracao Editado',
    p_cpf: '98765432100', p_phone: '11988887777', p_email: 'contato@ascensao.local',
    p_city: 'Sao Paulo', p_state: 'SP', p_amount: 2000,
    p_expected_close_date: null, p_notes: 'Edicao integrada',
  });
  if (updateError) throw updateError;
  assert(updatedBundle.opportunity.version === opportunity.version + 1, 'A edicao deveria incrementar a versao.');
  assert(updatedBundle.contact.full_name === 'Contato Integracao Editado', 'O contato deveria ser atualizado na mesma transacao.');
  const { data: updatedHistory, error: updatedHistoryError } = await client.from('opportunity_change_history')
    .select('event_type, changes').eq('opportunity_id', opportunity.id).order('changed_at');
  if (updatedHistoryError) throw updatedHistoryError;
  assert(updatedHistory.some((event) => event.event_type === 'created'), 'A criacao do lead deveria entrar no historico.');
  assert(updatedHistory.some((event) => event.event_type === 'updated' && event.changes.full_name),
    'A alteracao dos dados do contato deveria entrar no historico.');
  assert(updatedHistory.some((event) => event.event_type === 'updated' && event.changes.amount),
    'A alteracao dos dados comerciais deveria entrar no historico.');

  const legacyCatalogName = `Produto Legado ${Date.now()}`;
  const { data: legacyProduct, error: legacyProductError } = await client.from('products').insert({
    organization_id: org.id, name: legacyCatalogName, default_commission_rate: 2.5,
  }).select('*').single();
  if (legacyProductError) throw legacyProductError;
  const { data: openStages, error: openStagesError } = await client.from('pipeline_stages')
    .select('id').eq('pipeline_id', pipelineResult.data.id).eq('stage_type', 'open')
    .eq('active', true).is('deleted_at', null).order('position').limit(2);
  if (openStagesError) throw openStagesError;
  assert(openStages.length >= 2, 'O teste exige duas etapas abertas no pipeline.');
  const { data: legacyOpportunity, error: legacyOpportunityError } = await client.rpc('create_opportunity', {
    p_organization_id: org.id, p_owner_id: userId, p_pipeline_id: pipelineResult.data.id,
    p_stage_id: openStages[0].id, p_product_id: legacyProduct.id,
    p_bank_id: null, p_source_id: null, p_full_name: 'Lead com produto legado',
    p_phone: null, p_cpf: null, p_amount: 1500,
    p_expected_close_date: null, p_notes: null, p_company_id: null,
  });
  if (legacyOpportunityError) throw legacyOpportunityError;
  const { error: deactivateLegacyProductError } = await client.from('products').update({
    active: false, deleted_at: new Date().toISOString(),
  }).eq('id', legacyProduct.id);
  if (deactivateLegacyProductError) throw deactivateLegacyProductError;
  const { data: movedLegacyOpportunity, error: movedLegacyOpportunityError } = await client.rpc('transition_opportunity', {
    p_opportunity_id: legacyOpportunity.id, p_target_stage_id: openStages[1].id,
    p_expected_version: legacyOpportunity.version, p_loss_reason_id: null,
  });
  if (movedLegacyOpportunityError) throw movedLegacyOpportunityError;
  assert(movedLegacyOpportunity.stage_id === openStages[1].id,
    'Um lead com produto legado inativo deve continuar podendo mudar de etapa.');
  const { data: movementHistory, error: movementHistoryError } = await client.from('opportunity_change_history')
    .select('event_type, changes').eq('opportunity_id', legacyOpportunity.id).eq('event_type', 'stage_changed');
  if (movementHistoryError) throw movementHistoryError;
  assert(movementHistory.some((event) => event.changes.stage_id?.new === openStages[1].id),
    'A movimentacao entre etapas deveria entrar no historico do lead.');

  const now = new Date();
  const { data: goal, error: goalError } = await client.from('goals').upsert({
    organization_id: org.id, user_id: userId, year: now.getFullYear(), month: now.getMonth() + 1,
    calls: 100, appointments: 20, meetings: 10, proposals: 5, sales_count: 2,
    requested_reversal_amount: 5000,
  }, { onConflict: 'organization_id,user_id,year,month' }).select('*').single();
  if (goalError) throw goalError;
  assert(Number(goal.requested_reversal_amount) === 5000,
    'A meta mensal de Estorno Solicitado deveria persistir sob RLS.');
  const catalogName = `Produto Integracao ${Date.now()}`;
  const { data: catalog, error: catalogError } = await client.from('products').insert({
    organization_id: org.id, name: catalogName, default_commission_rate: 3.5,
  }).select('*').single();
  if (catalogError) throw catalogError;
  const { data: editedCatalog, error: editedCatalogError } = await client.from('products').update({
    name: catalogName + ' Editado', default_commission_rate: 4.25,
  }).eq('id', catalog.id).select('*').single();
  if (editedCatalogError) throw editedCatalogError;
  assert(Number(editedCatalog.default_commission_rate) === 4.25, 'O catalogo deveria persistir a edicao.');
  const { data: archivedCatalog, error: archiveCatalogError } = await client.from('products').update({
    active: false, deleted_at: new Date().toISOString(),
  }).eq('id', catalog.id).select('active, deleted_at').single();
  if (archiveCatalogError) throw archiveCatalogError;
  assert(!archivedCatalog.active && archivedCatalog.deleted_at, 'O catalogo deveria usar exclusao logica.');

  const scheduledAt = new Date(Date.now() + 3600000).toISOString();
  const { data: activity, error: activityError } = await client.from('activities').insert({
    organization_id: org.id, opportunity_id: opportunity.id, owner_id: userId, created_by: userId,
    activity_type: 'call', status: 'pending', scheduled_at: scheduledAt,
  }).select('*').single();
  if (activityError) throw activityError;
  const movedAt = new Date(Date.now() + 7200000).toISOString();
  const { data: moved, error: moveError } = await client.rpc('reschedule_activity', { p_activity_id: activity.id, p_scheduled_at: movedAt });
  if (moveError) throw moveError;
  assert(moved.status === 'pending', 'A atividade reagendada deveria continuar pendente.');
  const { data: completed, error: completeError } = await client.rpc('complete_activity', {
    p_activity_id: activity.id, p_result: 'atendeu', p_notes: 'Teste local', p_duration_seconds: 60,
  });
  if (completeError) throw completeError;
  assert(completed.status === 'completed', 'A atividade deveria estar concluida.');

  const { data: secondActivity, error: secondError } = await client.from('activities').insert({
    organization_id: org.id, opportunity_id: opportunity.id, owner_id: userId, created_by: userId,
    activity_type: 'task', status: 'pending', scheduled_at: scheduledAt,
  }).select('*').single();
  if (secondError) throw secondError;
  const { data: cancelledActivity, error: cancelActivityError } = await client.rpc('cancel_activity', { p_activity_id: secondActivity.id });
  if (cancelActivityError) throw cancelActivityError;
  assert(cancelledActivity.status === 'cancelled', 'A atividade deveria estar cancelada.');

  const { data: cancelledOpportunity, error: cancelOpportunityError } = await client.rpc('cancel_opportunity', {
    p_opportunity_id: opportunity.id, p_expected_version: updatedBundle.opportunity.version,
  });
  if (cancelOpportunityError) throw cancelOpportunityError;
  assert(cancelledOpportunity.status === 'cancelled', 'A oportunidade deveria estar cancelada.');
  const { error: staleError } = await client.rpc('cancel_opportunity', {
    p_opportunity_id: opportunity.id, p_expected_version: opportunity.version,
  });
  assert(Boolean(staleError), 'Uma segunda alteracao obsoleta deveria falhar.');
  console.log('Integracao local: autenticacao, RLS e ciclo de vida validados.');
} finally {
  if (paymentReceiptPath) await service.storage.from('ascensao-receipts').remove([paymentReceiptPath]);
  if (invitedUserId) await service.auth.admin.deleteUser(invitedUserId);
  if (userId) await service.auth.admin.deleteUser(userId);
}
