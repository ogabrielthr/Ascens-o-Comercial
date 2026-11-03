import { createClient } from '@supabase/supabase-js';
import { createFinanceRepository } from './core/finance-repository.mjs';
import { createOpportunityMutations } from './core/opportunity-mutations.mjs';
import './core/performance.js';
import { readCollectionDelta } from './core/reconcile-read.mjs';
import { createImportTask } from './core/import-task.mjs';
import { createWorkspaceLeader } from './core/workspace-leader.mjs';
window.AGIR.createImportTask = typeof Worker === 'undefined' ? null : () =>
  createImportTask(() => new Worker(new URL('./core/import-worker.mjs', import.meta.url), { type: 'module' }));
window.AGIR.createWorkspaceLeader = createWorkspaceLeader;
const finishBootMeasurement = window.AGIR.perf.start('boot.ready');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const configured = Boolean(supabaseUrl && supabaseAnonKey);
const client = configured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

function withTimeout(task, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || 'A conexão demorou mais que o esperado.')), milliseconds);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

async function accessContext() {
  if (!client) return null;
  const { data, error } = await client.rpc('my_access_context');
  if (error) throw error;
  if (data?.success === false) {
    throw new Error(data.error || 'Nao foi possivel carregar o contexto de acesso.');
  }
  const context = data?.data ?? data;
  if (!context) return null;
  return {
    ...context,
    profile: context.profile ?? context.user ?? null,
  };
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

async function loadMood(organizationId, userId) {
  if (!client || !organizationId || !userId) return null;
  const date = localDate();
  const [scaleResult, factorsResult, checkinResult, skipResult] = await Promise.all([
    readAllRows(() => client.from('mood_scale_options').select('id, score, label, color').eq('organization_id', organizationId).eq('active', true), ['id'], [['score']]),
    readAllRows(() => client.from('mood_factors').select('id, name, sentiment').eq('organization_id', organizationId).eq('active', true), ['id'], [['name']]),
    client.from('daily_mood_checkins').select('id, score, comment, submitted_at, mood_checkin_factors(factor_id)').eq('organization_id', organizationId).eq('user_id', userId).eq('checkin_date', date).maybeSingle(),
    client.from('mood_checkin_skips').select('skip_date').eq('organization_id', organizationId).eq('user_id', userId).eq('skip_date', date).maybeSingle(),
  ]);
  for (const result of [scaleResult, factorsResult, checkinResult, skipResult]) {
    if (result.error) throw result.error;
  }
  return {
    date,
    scale: scaleResult.data ?? [],
    factors: factorsResult.data ?? [],
    checkin: checkinResult.data,
    skipped: Boolean(skipResult.data),
  };
}

async function loadNotifications({ organizationId, limit = 120 }) {
  if (!client || !organizationId) return [];
  const { data, error } = await client.from('notifications')
    .select('id, organization_id, recipient_id, actor_id, opportunity_id, notification_type, title, body, metadata, read_at, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false }).order('id')
    .limit(Math.max(1, Math.min(Number(limit) || 120, 250)));
  if (error) throw error;
  return data ?? [];
}

async function saveMood({ organizationId, userId, score, comment = '', factorIds = [] }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const date = localDate();
  const { data: checkin, error } = await client.from('daily_mood_checkins').upsert({
    organization_id: organizationId,
    user_id: userId,
    checkin_date: date,
    score,
    comment: comment || null,
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,user_id,checkin_date' }).select('id, score, comment, submitted_at').single();
  if (error) throw error;

  const { error: deleteError } = await client.from('mood_checkin_factors').delete().eq('checkin_id', checkin.id);
  if (deleteError) throw deleteError;
  if (factorIds.length) {
    const { error: factorError } = await client.from('mood_checkin_factors').insert(
      [...new Set(factorIds)].map((factorId) => ({ checkin_id: checkin.id, factor_id: factorId })),
    );
    if (factorError) throw factorError;
  }
  return { ...checkin, checkin_date: date, factor_ids: [...new Set(factorIds)] };
}

async function skipMood({ organizationId, userId }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { error } = await client.from('mood_checkin_skips').upsert({
    organization_id: organizationId,
    user_id: userId,
    skip_date: localDate(),
  });
  if (error) throw error;
}

// UX-09: cursor por chave imutavel; cada pagina conserva os filtros e a RLS.
// Continua ate pagina vazia, inclusive se max_rows do servidor for menor que 500.
// Publica somente o conjunto completo. Nao representa uma transacao entre paginas;
// alteracoes concorrentes sao reconciliadas pelo realtime/snapshot seguinte.
let readSessionController = new AbortController();
function cancelSessionReads() {
  readSessionController.abort();
  readSessionController = new AbortController();
}
async function readAllRows(factory, keys = ['id'], sort = [], signal = readSessionController.signal) {
  const rows = [];
  let cursor = null;
  const seen = new Set();
  for (;;) {
    if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    let query = factory();
    keys.forEach((key) => { query = query.order(key, { ascending: true }); });
    if (cursor) {
      const value = (key) => {
        const id = String(cursor[key] ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Cursor de paginacao invalido.');
        return id;
      };
      query = keys.length === 1 ? query.gt(keys[0], value(keys[0])) : query.or(
        keys.map((key, index) => {
          const terms = keys.slice(0, index).map((previous) => `${previous}.eq.${value(previous)}`);
          terms.push(`${key}.gt.${value(key)}`);
          return terms.length === 1 ? terms[0] : `and(${terms.join(',')})`;
        }).join(','),
      );
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 20000);
    let result;
    const finishMeasurement = window.AGIR?.perf?.start('query.page');
    try { result = await query.limit(500).abortSignal(controller.signal); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); finishMeasurement?.(); }
    if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    if (result.error) throw result.error;
    const page = result.data || [];
    if (!page.length) break;
    for (const row of page) {
      const identity = keys.map((key) => row[key]).join(':');
      if (keys.some((key) => row[key] == null) || seen.has(identity)) {
        throw new Error('Paginacao inconsistente; os dados anteriores foram preservados.');
      }
      seen.add(identity);
      rows.push(row);
    }
    if (rows.length > 100000) throw new Error('Consulta excedeu 100.000 registros; refine o escopo.');
    cursor = page[page.length - 1];
  }
  if (sort.length) rows.sort((a, b) => {
    for (const [key, ascending = true] of sort) {
      const av = a[key], bv = b[key];
      const difference = av == null ? (bv == null ? 0 : 1) : bv == null ? -1
        : typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR');
      if (difference) return ascending ? difference : -difference;
    }
    return 0;
  });
  return { data: rows, error: null };
}

async function runQueryBatches(tasks, batchSize = 6) {
  const signal = readSessionController.signal;
  if (!Number.isInteger(batchSize) || batchSize < 1 || tasks.some((task) => typeof task !== 'function')) {
    throw new TypeError('runQueryBatches exige funcoes e batchSize inteiro positivo.');
  }
  const output = [];
  for (let index = 0; index < tasks.length; index += batchSize) {
    if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    const batch = tasks.slice(index, index + batchSize);
    output.push(...await Promise.all(batch.map((task) => task())));
  }
  if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
  return output;
}
const deferredCommercialKeys = {
  learning: ['tracks', 'lessons', 'lessonProgress', 'studyPlans', 'studyPlanTracks', 'gamificationRules'],
  files: ['fileCategories', 'files'],
  analytics: ['stageHistory'],
  ranking: ['salesRanking'],
};

function commercialQueries(organizationId) {
  const org = (table, columns = '*') => client.from(table).select(columns).eq('organization_id', organizationId);
  return {
    profiles: () => readAllRows(() => client.from('profiles').select('id, full_name, email, phone, extension, avatar_path, active, admission_date, organization_members!inner(organization_id)').eq('organization_members.organization_id', organizationId), ["id"], []),
    memberships: () => readAllRows(() => org('organization_members', 'user_id, role, active'), ["user_id"], []),
    teams: () => readAllRows(() => org('teams', 'id, name, color, manager_id, active').is('deleted_at', null), ["id"], [["name",true]]),
    teamMembers: () => readAllRows(() => client.from('team_members').select('team_id, user_id, is_manager, teams!inner(organization_id)').eq('teams.organization_id', organizationId), ["team_id","user_id"], []),
    pipelines: () => readAllRows(() => org('pipelines', 'id, name, is_default, active').is('deleted_at', null), ["id"], [["name",true]]),
    stages: () => readAllRows(() => org('pipeline_stages', 'id, pipeline_id, name, position, stage_type, probability, sla_days, color, active').is('deleted_at', null), ["id"], [["position",true]]),
    products: () => readAllRows(() => org('products', 'id, name, code, default_commission_rate, min_amount, max_amount, active').is('deleted_at', null), ["id"], [["name",true]]),
    conventions: () => readAllRows(() => org('conventions', 'id, name, code, active').is('deleted_at', null), ["id"], [["name",true]]),
    banks: () => readAllRows(() => org('banks', 'id, name, code, active').is('deleted_at', null), ["id"], [["name",true]]),
    sources: () => readAllRows(() => org('lead_sources', 'id, name, code, active').is('deleted_at', null), ["id"], [["name",true]]),
    lossReasons: () => readAllRows(() => org('loss_reasons', 'id, name, code, active').is('deleted_at', null), ["id"], [["name",true]]),
    companies: () => readAllRows(() => org('companies').is('deleted_at', null), ["id"], [["name",true]]),
    contacts: () => readAllRows(() => org('contacts').is('deleted_at', null), ["id"], [["full_name",true]]),
    opportunities: () => readAllRows(() => org('opportunities').is('deleted_at', null).neq('status', 'cancelled'), ["id"], [["created_at",false]]),
    stageHistory: () => readAllRows(() => org('opportunity_stage_history', 'id, opportunity_id, from_stage_id, to_stage_id, changed_by, changed_at, duration_seconds'), ["id"], [["changed_at",true]]),
    changeHistory: () => readAllRows(() => org('opportunity_change_history', 'id, opportunity_id, changed_by, event_type, changes, changed_at'), ["id"], [["changed_at",true]]),
    activities: () => readAllRows(() => org('activities').is('deleted_at', null).neq('status', 'cancelled'), ["id"], [["created_at",false]]),
    goals: () => readAllRows(() => org('goals'), ["id"], [["year",false],["month",false]]),
    organization: () => client.from('organizations').select('id, name, legal_name, cnpj, phone, site, city, state, founded_on, segment, active').eq('id', organizationId).single(),
    tracks: () => readAllRows(() => org('learning_tracks').is('deleted_at', null), ["id"], [["position",true]]),
    lessons: () => readAllRows(() => org('lessons').is('deleted_at', null), ["id"], [["position",true]]),
    lessonProgress: () => readAllRows(() => org('lesson_progress'), ["id"], [["updated_at",false]]),
    studyPlans: () => readAllRows(() => org('study_plans').is('deleted_at', null), ["id"], [["created_at",false]]),
    studyPlanTracks: () => readAllRows(() => org('study_plan_tracks'), ["id"], [["position",true]]),
    gamificationRules: () => readAllRows(() => org('gamification_rules').eq('active', true), ["id"], [["effective_from",false]]),
    fileCategories: () => readAllRows(() => org('file_categories').eq('active', true), ["id"], [["name",true]]),
    files: () => readAllRows(() => org('files', '*, file_downloads(count)').is('deleted_at', null), ["id"], [["created_at",false]]),
    // Only the ordering index belongs to the board; message bodies are lead-scoped.
    opportunityMessages: () => readAllRows(() => org('opportunity_messages', 'id, opportunity_id, created_at').is('deleted_at', null), ["id"], [["created_at",false]]),
    tags: () => readAllRows(() => org('tags'), ["id"], [["name",true]]),
    opportunityTags: () => readAllRows(() => client.from('opportunity_tags').select('opportunity_id, tag_id, opportunities!inner(organization_id)').eq('opportunities.organization_id', organizationId), ["opportunity_id","tag_id"], []),
    salesRanking: () => loadSalesRanking({ organizationId }).then((data) => ({ data })),
    paymentReceipts: () => readAllRows(() => org('payment_receipts', 'id, opportunity_id'), ["id"], []),
  };
}

async function queryCommercialKeys(organizationId, keys) {
  const queries = commercialQueries(organizationId);
  const results = await runQueryBatches(keys.map((key) => queries[key]), 4);
  for (const result of results) if (result.error) throw result.error;
  return Object.fromEntries(keys.map((key, index) => [key, results[index].data ?? []]));
}

let workspaceSnapshotRpcAvailable = true;
function knownVersionMap(known) {
  if (!known) return null;
  return Object.fromEntries(['contacts', 'opportunities', 'activities'].map((table) => [
    table,
    Object.fromEntries((known[table] || []).filter((row) => row?.id).map((row) => [
      row.id, row.updated_at == null ? '' : String(row.updated_at),
    ])),
  ]));
}

function normalizeWorkspaceSnapshot(data, incremental) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Snapshot comercial invalido; os dados anteriores foram preservados.');
  }
  const snapshot = {
    contacts: data.contacts || [],
    opportunities: data.opportunities || [],
    activities: data.activities || [],
    tags: data.tags || [],
    opportunityTags: data.opportunity_tags || [],
    opportunityMessages: data.opportunity_messages || [],
    paymentReceipts: data.payment_receipts || [],
  };
  if (incremental) snapshot.incremental = {
    contacts: { ids: data.contact_ids || [], rows: snapshot.contacts },
    opportunities: { ids: data.opportunity_ids || [], rows: snapshot.opportunities },
    activities: { ids: data.activity_ids || [], rows: snapshot.activities },
  };
  return snapshot;
}

async function loadWorkspaceSnapshot({ organizationId, known = null, signal = readSessionController.signal }) {
  if (!workspaceSnapshotRpcAvailable) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const { data, error } = await client.rpc('crm_workspace_snapshot', {
      p_organization_id: organizationId,
      p_known: knownVersionMap(known),
    }).retry(false).abortSignal(controller.signal);
    if (error) throw error;
    if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    return normalizeWorkspaceSnapshot(data, Boolean(known));
  } catch (error) {
    if (error?.code !== 'PGRST202') throw error;
    workspaceSnapshotRpcAvailable = false;
    console.warn('[workspace] Aplique a migration de snapshot para reduzir as leituras do CRM.');
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

async function loadCommercialModule({ organizationId, module }) {
  if (!client || !organizationId) throw new Error('Sessao indisponivel.');
  const keys = deferredCommercialKeys[module];
  if (!keys) throw new Error('Modulo de dados desconhecido.');
  return queryCommercialKeys(organizationId, keys);
}

async function loadCommercial(organizationId) {
  if (!client || !organizationId) return null;
  const deferred = Object.values(deferredCommercialKeys).flat();
  const workspaceKeys = ['contacts', 'opportunities', 'activities', 'opportunityMessages', 'tags', 'opportunityTags', 'paymentReceipts'];
  const keys = Object.keys(commercialQueries(organizationId)).filter((key) =>
    !deferred.includes(key) && !['companies', 'changeHistory'].includes(key) && !workspaceKeys.includes(key));
  const [catalogs, optimizedWorkspace] = await Promise.all([
    queryCommercialKeys(organizationId, keys),
    loadWorkspaceSnapshot({ organizationId }),
  ]);
  const workspace = optimizedWorkspace || await queryCommercialKeys(organizationId, workspaceKeys);
  const output = { ...catalogs, ...workspace };
  try { output.notifications = await loadNotifications({ organizationId }); }
  catch (error) {
    console.warn('[notificacoes] Nao foi possivel carregar a caixa.', error);
    output.notifications = [];
  }
  return output;
}

async function loadCrmRealtimeSnapshot({ organizationId, known }) {
  if (!client || !organizationId) return null;
  const optimized = await loadWorkspaceSnapshot({ organizationId, known });
  if (optimized) return optimized;
  if (known) {
    const signal = readSessionController.signal;
    const tables = ['contacts', 'opportunities', 'activities'];
    const changes = await runQueryBatches(tables.map(table => () => readCollectionDelta({
      known: known[table], signal,
      read: async (columns, ids) => {
        const result = await readAllRows(() => {
          let query = client.from(table).select(columns).eq('organization_id', organizationId).is('deleted_at', null);
          if (table !== 'contacts') query = query.neq('status', 'cancelled');
          return ids ? query.in('id', ids) : query;
        }, ['id'], [], signal);
        return result.data;
      }
    })), 3);
    const indexes = await queryCommercialKeys(organizationId, ['opportunityMessages', 'tags', 'opportunityTags', 'paymentReceipts']);
    if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    return { ...indexes, incremental: Object.fromEntries(tables.map((table, index) => [table, changes[index]])) };
  }
  const snapshot = await queryCommercialKeys(organizationId, [
    'contacts', 'opportunities', 'activities',
    'opportunityMessages', 'tags', 'opportunityTags', 'paymentReceipts',
  ]);
  try { snapshot.notifications = await loadNotifications({ organizationId }); }
  catch (error) {
    // Ausencia significa falha desta secao, nunca uma caixa vazia confirmada.
    console.warn('[notificacoes] Falha ao sincronizar.', error);
  }
  return snapshot;
}

async function markNotificationRead({ organizationId, notificationId, read = true }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.from('notifications')
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq('organization_id', organizationId)
    .eq('id', notificationId)
    .select('id, read_at')
    .single();
  if (error) throw error;
  return data;
}

async function markAllNotificationsRead({ organizationId }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { error } = await client.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .is('read_at', null);
  if (error) throw error;
}

let workspaceChannel = null;

async function stopWorkspaceRealtime() {
  if (!client || !workspaceChannel) return;
  const previous = workspaceChannel;
  workspaceChannel = null;
  await client.removeChannel(previous).catch(() => {});
}

async function subscribeWorkspace({ organizationId, userId, onCrmChange, onNotification, onStatus }) {
  if (!client || !organizationId || !userId) return () => {};
  await stopWorkspaceRealtime();
  const crm = typeof onCrmChange === 'function' ? onCrmChange : () => {};
  const notification = typeof onNotification === 'function' ? onNotification : () => {};
  const emit = (table) => (payload) => crm({ table, payload });
  workspaceChannel = client.channel(`ascensao-workspace:${organizationId}:${userId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}`,
    }, notification)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'opportunities', filter: `organization_id=eq.${organizationId}`,
    }, emit('opportunities'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'contacts', filter: `organization_id=eq.${organizationId}`,
    }, emit('contacts'))
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'opportunity_change_history', filter: `organization_id=eq.${organizationId}`,
    }, emit('opportunity_change_history'))
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'opportunity_stage_history', filter: `organization_id=eq.${organizationId}`,
    }, emit('opportunity_stage_history'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'activities', filter: `organization_id=eq.${organizationId}`,
    }, emit('activities'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'opportunity_messages', filter: `organization_id=eq.${organizationId}`,
    }, emit('opportunity_messages'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'payment_receipts', filter: `organization_id=eq.${organizationId}`,
    }, emit('payment_receipts'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'tags', filter: `organization_id=eq.${organizationId}`,
    }, emit('tags'))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'opportunity_tags',
    }, emit('opportunity_tags'))
    .subscribe((status) => {
      if (typeof onStatus === 'function') onStatus(status);
    });
  const current = workspaceChannel;
  return async () => {
    if (workspaceChannel === current) workspaceChannel = null;
    await client.removeChannel(current).catch(() => {});
  };
}

let rankingRpcVersion = 3;
async function loadSalesRanking({
  organizationId, from, to, teamId = null, productId = null, sourceId = null,
  recentAfter = null, signal = readSessionController.signal,
}) {
  if (!client || !organizationId) throw new Error('Organizacao obrigatoria.');
  const rangeFrom = new Date(from);
  const rangeTo = new Date(to);
  if (!Number.isFinite(rangeFrom.getTime()) || !Number.isFinite(rangeTo.getTime()) || rangeFrom > rangeTo) {
    throw new TypeError('Periodo do ranking invalido.');
  }
  const scope = query => {
    query = query.gte('closed_at', rangeFrom.toISOString());
    query = query.lte('closed_at', rangeTo.toISOString());
    return query;
  };
  if (rankingRpcVersion === 3) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const { data, error } = await client.rpc('sales_ranking_snapshot', {
        p_organization_id: organizationId,
        p_from: rangeFrom.toISOString(),
        p_to: rangeTo.toISOString(),
        p_team_id: teamId || null,
        p_product_id: productId || null,
        p_source_id: sourceId || null,
        p_recent_after: recentAfter ? new Date(recentAfter).toISOString() : null,
        p_recent_limit: 50,
      }).retry(false).abortSignal(controller.signal);
      if (error) throw error;
      if (!data || !Array.isArray(data.entries) || !Array.isArray(data.recent)) {
        throw new Error('Resumo do ranking invalido; o placar anterior foi preservado.');
      }
      return { entries: data.entries, recent: data.recent, aggregated: true };
    } catch (error) {
      if (error?.code !== 'PGRST202') throw error;
      rankingRpcVersion = 2;
      console.warn('[ranking] Resumo agregado indisponivel; usando compatibilidade temporaria.');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  if (rankingRpcVersion === 2) {
    try {
      const result = await readAllRows(() => scope(client.rpc('sales_ranking_entries_v2', {
        p_organization_id: organizationId,
      })), ['sale_id'], [], signal);
      return { entries: result.data, recent: result.data, aggregated: false };
    } catch (error) {
      // Compatibilidade durante deploy: apenas RPC ausente permite fallback.
      // Falhas de rede/permissao preservam o placar anterior e usam backoff.
      if (error.code !== 'PGRST202') throw error;
      rankingRpcVersion = 1;
      console.warn('[ranking] Atualize a migration do ranking para habilitar identificadores de venda.');
    }
  }
  // RPC anonima sem ID unico: ordena todas as colunas e usa count para detectar
  // truncamento. Empates completos sao equivalentes para os totais da UI.
  const rows = [];
  let expectedCount;
  for (;;) {
    if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    let query = scope(client.rpc('sales_ranking_entries', { p_organization_id: organizationId }, { count: 'exact' }));
    for (const column of ['owner_id', 'closed_at', 'requested_reversal', 'production_value', 'product_id', 'source_id', 'team_id']) {
      query = query.order(column, { ascending: true, nullsFirst: false });
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 20000);
    let result;
    try { result = await query.range(rows.length, rows.length + 499).abortSignal(controller.signal); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    if (signal.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
    if (result.error) throw result.error;
    if (!Number.isInteger(result.count) || (expectedCount !== undefined && expectedCount !== result.count)) {
      throw new Error('Totais mudaram durante a consulta; tente novamente.');
    }
    expectedCount = result.count;
    rows.push(...(result.data || []));
    if (rows.length === expectedCount) return { entries: rows, recent: rows, aggregated: false };
    if (!(result.data || []).length || rows.length > expectedCount || expectedCount > 100000) {
      throw new Error('Consulta de totais incompleta; os dados anteriores foram preservados.');
    }
  }
}

async function loadOpportunityHistory({ organizationId, opportunityId, signal = readSessionController.signal }) {
  if (!client || !organizationId || !opportunityId) throw new Error('Lead e organizacao obrigatorios.');
  const result = await readAllRows(() => client.from('opportunity_change_history')
    .select('id, opportunity_id, changed_by, event_type, changes, changed_at')
    .eq('organization_id', organizationId).eq('opportunity_id', opportunityId),
  ['id'], [['changed_at', false]], signal);
  return result.data;
}
async function loadLeadWorkspace({ organizationId, opportunityId, signal }) {
  if (!client || !organizationId || !opportunityId) throw new Error('Lead e organização obrigatórios.');
  const orgLead = table => client.from(table).select('*').eq('organization_id', organizationId).eq('opportunity_id', opportunityId);
  const [changes, messages, receipts] = await Promise.all([
    readAllRows(() => orgLead('opportunity_change_history'), ['id'], [['changed_at', false]], signal),
    readAllRows(() => orgLead('opportunity_messages').is('deleted_at', null), ['id'], [['created_at', false]], signal),
    readAllRows(() => orgLead('payment_receipts'), ['id'], [['created_at', false]], signal),
  ]);
  return { changes: changes.data, messages: messages.data, receipts: receipts.data };
}
async function restoreSession() {
  if (!client) return { session: null, context: null };
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) return { session: null, context: null, mood: null };
  const context = await accessContext();
  const organization = context?.organizations?.[0];
  let mood = null;
  let commercial = null;
  let loadError = null;
  if (organization) {
    try { mood = await loadMood(organization.id, data.session.user.id); }
    catch (error) { console.warn('[bootstrap] Clima indisponivel temporariamente.', error); }
    try { commercial = await loadCommercial(organization.id); }
    catch (error) { loadError = error; console.warn('[bootstrap] Dados comerciais indisponiveis temporariamente.', error); }
  }
  return { session: data.session, context, mood, commercial, loadError };
}

async function signIn(email, password) {
  if (!client) throw new Error('Supabase nao configurado neste ambiente.');
  return withTimeout((async () => {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const context = await accessContext();
    const organization = context?.organizations?.[0];
    let mood = null;
    let commercial = null;
    let loadError = null;
    if (organization) {
      try { mood = await loadMood(organization.id, data.session.user.id); }
      catch (error) { console.warn('[login] Clima indisponivel temporariamente.', error); }
      try { commercial = await loadCommercial(organization.id); }
      catch (error) { loadError = error; console.warn('[login] Dados comerciais indisponiveis temporariamente.', error); }
    }
    return { session: data.session, context, mood, commercial, loadError };
  })(), 30000, 'O acesso demorou mais que o esperado. Verifique sua internet e tente novamente.');
}

const opportunityMutations = createOpportunityMutations({
  async write(name, args, signal) {
    if (!client) throw new Error('Supabase não configurado.');
    const { data, error } = await client.rpc(name, args).retry(false).abortSignal(signal);
    if (error) throw error;
    return data;
  },
  async read(id, signal) {
    const { data, error } = await client.from('opportunities').select('*, contacts(*)')
      .eq('id', id).is('deleted_at', null).maybeSingle().retry(false).abortSignal(signal);
    if (error) throw error;
    return data;
  },
  onReconciled(detail) {
    window.dispatchEvent(new CustomEvent('ascensao:business-conflict', { detail }));
  },
});

async function setOpportunityFinancialValues(payload) {
  const numberOrNull = (value) => value === '' || value === null || value === undefined ? null : Number(value);
  return opportunityMutations.run('set_opportunity_financial_values', {
    p_opportunity_id: payload.opportunityId, p_expected_version: payload.expectedVersion,
    p_total_value: numberOrNull(payload.totalValue), p_final_value: numberOrNull(payload.finalValue),
    p_requested_reversal: numberOrNull(payload.requestedReversal),
  });
}
async function createOpportunity(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const numberOrNull = (value) => value === '' || value === null || value === undefined ? null : Number(value);
  const { data, error } = await client.rpc('create_opportunity_v3', {
    p_organization_id: payload.organizationId,
    p_owner_id: payload.ownerId,
    p_pipeline_id: payload.pipelineId,
    p_stage_id: payload.stageId,
    p_product_id: payload.productId || null,
    p_convention_id: payload.conventionId || null,
    p_registration_number: payload.registrationNumber || null,
    p_bank_id: payload.bankId || null,
    p_source_id: payload.sourceId || null,
    p_full_name: payload.fullName,
    p_phone: payload.phone || null,
    p_cpf: payload.cpf || null,
    p_amount: payload.amount || 0,
    p_total_value: numberOrNull(payload.totalValue),
    p_final_value: numberOrNull(payload.finalValue),
    p_requested_reversal: numberOrNull(payload.requestedReversal),
    p_expected_close_date: payload.expectedCloseDate || null,
    p_notes: payload.notes || null,
    p_company_id: payload.companyId || null,
  });
  if (error) throw error;
  return data;
}

async function createActivity(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  if (!payload.opportunityId) throw new Error('Selecione o lead desta atividade.');
  const typeMap = { ligacao: 'call', reuniao: 'meeting', whatsapp: 'whatsapp', email: 'email', proposta: 'proposal', followup: 'follow_up', virada_folha: 'payroll_turn', tarefa: 'task', nota: 'task' };
  const pending = payload.result === 'pendente';
  const now = new Date().toISOString();
  const { data, error } = await client.from('activities').insert({
    organization_id: payload.organizationId,
    opportunity_id: payload.opportunityId,
    owner_id: payload.ownerId,
    activity_type: typeMap[payload.type] || 'task',
    status: pending ? 'pending' : 'completed',
    result: payload.result || null,
    notes: payload.notes || null,
    duration_seconds: payload.durationSeconds || 0,
    scheduled_at: pending ? (payload.scheduledAt || now) : null,
    completed_at: pending ? null : now,
    created_by: payload.ownerId,
  }).select('*').single();
  if (error) throw error;
  return data;
}
async function sendOpportunityMessage(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const body = String(payload.body || '').trim();
  if (!payload.opportunityId || !body) throw new Error('Lead e mensagem sao obrigatorios.');
  const { data, error } = await client.from('opportunity_messages').insert({
    organization_id: payload.organizationId,
    opportunity_id: payload.opportunityId,
    author_id: payload.authorId,
    message_type: payload.messageType === 'chat' ? 'chat' : 'note',
    body,
    mentioned_user_ids: payload.messageType === 'chat'
      ? [...new Set(payload.mentionUserIds || [])]
      : [],
  }).select('*').single();
  if (error) throw error;
  return data;
}
async function createCompany(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.from('companies').insert({
    organization_id: payload.organizationId,
    name: payload.name,
    cnpj: payload.cnpj || null,
    company_type: payload.companyType || null,
    contact_name: payload.contactName || null,
    phone: payload.phone || null,
    city: payload.city || null,
    state: payload.state || null,
    owner_id: payload.ownerId,
    created_by: payload.ownerId,
  }).select('*').single();
  if (error) throw error;
  return data;
}
async function createContact(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const cpf = String(payload.cpf || '').replace(/\D/g, '') || null;
  const phone = String(payload.phone || '').replace(/\D/g, '') || null;
  const { data, error } = await client.from('contacts').insert({
    organization_id: payload.organizationId,
    full_name: payload.fullName,
    cpf,
    email: payload.email || null,
    phone,
    city: payload.city || null,
    state: payload.state || null,
    company_id: payload.companyId || null,
    owner_id: payload.ownerId,
    consent_status: payload.consentStatus || 'unknown',
    created_by: payload.ownerId,
  }).select('*').single();
  if (error) throw error;
  return data;
}
async function upsertGoals({ organizationId, goals }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const rows = goals.map((goal) => ({
    organization_id: organizationId, user_id: goal.userId,
    year: goal.year, month: goal.month,
    calls: Math.max(0, Number(goal.calls) || 0),
    appointments: Math.max(0, Number(goal.appointments) || 0),
    meetings: Math.max(0, Number(goal.meetings) || 0),
    proposals: Math.max(0, Number(goal.proposals) || 0),
    sales_count: Math.max(0, Number(goal.salesCount) || 0),
    requested_reversal_amount: Math.max(0, Number(
      goal.requestedReversalAmount == null ? goal.salesAmount : goal.requestedReversalAmount
    ) || 0),
  }));
  const { data, error } = await client.from('goals').upsert(rows, {
    onConflict: 'organization_id,user_id,year,month',
  }).select('*');
  if (error) throw error;
  return data ?? [];
}
async function invokeFunction(name, payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.functions.invoke(name, { body: payload });
  if (error) {
    let detail = data?.error || data?.message || '';
    if (!detail && error.context && typeof error.context.json === 'function') {
      try {
        const responseBody = await error.context.json();
        detail = responseBody?.error || responseBody?.message || '';
      } catch (_) { /* A resposta pode nao ter corpo JSON. */ }
    }
    const failure = new Error(detail || error.message || 'A operacao server-side falhou.');
    failure.status = error.context?.status;
    failure.cause = error;
    throw failure;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
async function inviteUser(payload) {
  return invokeFunction('invite-user', payload);
}
async function manageUser(payload) {
  return invokeFunction('manage-user', payload);
}
/**
 * Define a senha de outro usuario. Exige administrador ativo na organizacao —
 * a validacao real acontece na Edge Function, unica camada com credencial
 * administrativa. Nenhuma senha fica guardada no cliente.
 */
async function setUserPassword({ organizationId, userId, newPassword }) {
  return manageUser({
    organizationId, userId, action: 'set_password', password: newPassword,
  });
}

async function updateManagedUser(payload) {
  await manageUser({
    organizationId: payload.organizationId, userId: payload.userId,
    action: 'update_profile', fullName: payload.fullName,
    phone: payload.phone || null, extension: payload.extension || null,
  });
  if (payload.role && payload.role !== payload.currentRole) {
    await manageUser({
      organizationId: payload.organizationId, userId: payload.userId,
      action: 'set_role', role: payload.role,
    });
  }
  if ((payload.teamId || null) !== (payload.currentTeamId || null)) {
    await manageUser({
      organizationId: payload.organizationId, userId: payload.userId,
      action: 'set_team', teamId: payload.teamId || null,
    });
  }
  return { ok: true };
}
const catalogTables = {
  products: 'products', conventions: 'conventions', banks: 'banks', sources: 'lead_sources', lossReasons: 'loss_reasons',
};
async function saveCatalog({ kind, organizationId, id = null, name, commissionRate = 0 }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const table = catalogTables[kind];
  if (!table) throw new Error('Catalogo nao suportado.');
  const values = { name: name.trim(), active: true, deleted_at: null };
  if (kind === 'products') values.default_commission_rate = Math.max(0, Number(commissionRate) || 0);
  let query;
  if (id) query = client.from(table).update(values).eq('id', id).eq('organization_id', organizationId);
  else query = client.from(table).insert({ ...values, organization_id: organizationId });
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}
async function archiveCatalog({ kind, organizationId, id }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const table = catalogTables[kind];
  if (!table) throw new Error('Catalogo nao suportado.');
  const { data, error } = await client.from(table).update({
    active: false, deleted_at: new Date().toISOString(),
  }).eq('id', id).eq('organization_id', organizationId).select('id').single();
  if (error) throw error;
  return data;
}
async function savePipelineStage(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('save_pipeline_stage', {
    p_pipeline_id: payload.pipelineId, p_stage_id: payload.stageId || null,
    p_name: payload.name, p_sla_days: payload.slaDays,
    p_probability: payload.probability, p_color: payload.color || null,
  });
  if (error) throw error;
  return data;
}
async function reorderPipelineStages({ pipelineId, stageIds }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('reorder_pipeline_stages', {
    p_pipeline_id: pipelineId, p_stage_ids: stageIds,
  });
  if (error) throw error;
  return data ?? [];
}
async function archivePipelineStage(stageId) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('archive_pipeline_stage', { p_stage_id: stageId });
  if (error) throw error;
  return data;
}
async function saveTeam({ organizationId, id = null, name, color, managerId }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('save_team', {
    p_organization_id: organizationId, p_team_id: id,
    p_name: name, p_color: color || null, p_manager_id: managerId || null,
  });
  if (error) throw error;
  return data;
}
async function updateOrganization(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.from('organizations').update({
    name: payload.name.trim(), legal_name: payload.legalName || null,
    cnpj: payload.cnpj || null, phone: payload.phone || null,
    site: payload.site || null, city: payload.city || null,
    state: payload.state || null, founded_on: payload.foundedOn || null,
    segment: payload.segment || null,
  }).eq('id', payload.organizationId).select('*').single();
  if (error) throw error;
  return data;
}
async function updateOwnProfile({ userId, fullName, phone, extension, avatarPath }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.from('profiles').update({
    full_name: fullName.trim(), phone: phone || null, extension: extension || null,
    ...(avatarPath !== undefined ? { avatar_path: avatarPath || null } : {}),
  }).eq('id', userId).select('*').single();
  if (error) throw error;
  return data;
}
function avatarUrl(path) {
  if (!client || !path) return null;
  return client.storage.from('ascensao-avatars').getPublicUrl(path).data.publicUrl;
}
async function uploadOwnAvatar({ userId, blob }) {
  if (!client) throw new Error('Supabase nao configurado.');
  if (!(blob instanceof Blob) || !blob.size) throw new Error('Imagem invalida.');
  if (blob.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no maximo 5 MB.');
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error: uploadError } = await client.storage.from('ascensao-avatars').upload(path, blob, {
    contentType: 'image/jpeg', upsert: false, cacheControl: '3600',
  });
  if (uploadError) throw uploadError;
  try {
    const { data: currentProfile, error: profileReadError } = await client.from('profiles')
      .select('full_name, phone, extension, avatar_path').eq('id', userId).single();
    if (profileReadError) throw profileReadError;
    const profile = await updateOwnProfile({
      userId, fullName: currentProfile.full_name, phone: currentProfile.phone,
      extension: currentProfile.extension, avatarPath: path,
    });
    if (currentProfile.avatar_path && currentProfile.avatar_path !== path) {
      await client.storage.from('ascensao-avatars').remove([currentProfile.avatar_path]);
    }
    return { path, url: avatarUrl(path), profile };
  } catch (error) {
    await client.storage.from('ascensao-avatars').remove([path]);
    throw error;
  }
}
async function changePassword(password) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;
  return data.user;
}
async function savePreferences(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.from('user_preferences').upsert({
    user_id: payload.userId, theme: payload.theme, density: payload.density,
    sidebar_collapsed: Boolean(payload.sidebarCollapsed),
    hide_currency: Boolean(payload.hideCurrency),
    default_module: payload.defaultModule || null,
    mood_checkin_enabled: payload.moodCheckinEnabled !== false,
    dashboard_widgets: Array.isArray(payload.dashboardWidgets) ? payload.dashboardWidgets : [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select('*').single();
  if (error) throw error;
  return data;
}
async function setLessonCompletion({ lessonId, completed }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('set_lesson_completion', {
    p_lesson_id: lessonId, p_completed: Boolean(completed),
  });
  if (error) throw error;
  return data;
}
async function markLessonStarted(lessonId) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('mark_lesson_started', { p_lesson_id: lessonId });
  if (error) throw error;
  return data;
}
async function saveStudyPlan(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('save_study_plan', {
    p_organization_id: payload.organizationId,
    p_plan_id: payload.planId || null,
    p_user_id: payload.userId,
    p_title: payload.title,
    p_description: payload.description || null,
    p_starts_on: payload.startsOn,
    p_due_on: payload.dueOn || null,
    p_status: payload.status || 'active',
    p_track_ids: payload.trackIds,
    p_track_due_dates: payload.trackDueDates,
  });
  if (error) throw error;
  return data;
}
async function archiveStudyPlan(planId) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('archive_study_plan', { p_plan_id: planId });
  if (error) throw error;
  return data;
}
async function saveLearningTrack(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('save_learning_track', {
    p_organization_id: payload.organizationId, p_track_id: payload.trackId || null,
    p_title: payload.title, p_published: Boolean(payload.published),
  });
  if (error) throw error;
  return data;
}
async function archiveLearningTrack(trackId) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('archive_learning_track', { p_track_id: trackId });
  if (error) throw error;
  return data;
}
async function saveLesson(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('save_lesson', {
    p_track_id: payload.trackId, p_lesson_id: payload.lessonId || null,
    p_title: payload.title, p_duration_minutes: payload.durationMinutes,
    p_content_url: payload.contentUrl || null, p_description: payload.description || null,
  });
  if (error) throw error;
  return data;
}
async function archiveLesson(lessonId) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('archive_lesson', { p_lesson_id: lessonId });
  if (error) throw error;
  return data;
}
async function saveFileCategory({ organizationId, id = null, name, accessLevel = 'organization' }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const values = { name: name.trim(), access_level: accessLevel, active: true };
  let query = id
    ? client.from('file_categories').update(values).eq('id', id).eq('organization_id', organizationId)
    : client.from('file_categories').insert({ ...values, organization_id: organizationId });
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}
async function archiveFileCategory({ organizationId, id }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { error } = await client.from('file_categories').update({ active: false })
    .eq('id', id).eq('organization_id', organizationId);
  if (error) throw error;
}
async function uploadFile({ organizationId, categoryId, userId, file, name, accessLevel = 'organization' }) {
  if (!client) throw new Error('Supabase nao configurado.');
  if (!file || file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error('O arquivo deve ter entre 1 byte e 25 MB.');
  const safeName = (file.name || name || 'arquivo').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120);
  const storagePath = `${organizationId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await client.storage.from('ascensao-files').upload(storagePath, file, {
    contentType: file.type || 'application/octet-stream', upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await client.from('files').insert({
    organization_id: organizationId, category_id: categoryId || null,
    name: name.trim(), storage_path: storagePath,
    mime_type: file.type || 'application/octet-stream', size_bytes: file.size,
    access_level: accessLevel, uploaded_by: userId,
  }).select('*').single();
  if (error) {
    await client.storage.from('ascensao-files').remove([storagePath]);
    throw error;
  }
  return data;
}
async function createFileDownload({ organizationId, fileId, storagePath, userId }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data: signed, error: signedError } = await client.storage.from('ascensao-files').createSignedUrl(storagePath, 60);
  if (signedError) throw signedError;
  const { error: logError } = await client.from('file_downloads').insert({
    organization_id: organizationId, file_id: fileId, user_id: userId,
  });
  if (logError) throw logError;
  return signed.signedUrl;
}
async function archiveFile({ organizationId, fileId, storagePath }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const deletedAt = new Date().toISOString();
  const { error: metadataError } = await client.from('files').update({ deleted_at: deletedAt })
    .eq('id', fileId).eq('organization_id', organizationId);
  if (metadataError) throw metadataError;
  const { error: storageError } = await client.storage.from('ascensao-files').remove([storagePath]);
  if (storageError) {
    await client.from('files').update({ deleted_at: null }).eq('id', fileId).eq('organization_id', organizationId);
    throw storageError;
  }
}
async function loadLeadDocuments({ organizationId, opportunityId, signal }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const result = await readAllRows(() => client.from('lead_documents').select('*')
    .eq('organization_id', organizationId).eq('opportunity_id', opportunityId),
    ['id'], [['created_at', false]], signal);
  return result.data;
}
async function uploadLeadDocument({ organizationId, opportunityId, file }) {
  if (!client) throw new Error('Supabase nao configurado.');
  if (!file || file.size < 1 || file.size > 50 * 1024 * 1024) {
    throw new Error('Cada arquivo deve ter entre 1 byte e 50 MB.');
  }
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user?.id) throw new Error('Sua sessao expirou. Entre novamente.');
  const originalName = String(file.name || 'documento').slice(0, 180);
  const safeName = originalName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120);
  const storagePath = organizationId + '/documents/' + opportunityId + '/' + authData.user.id + '/' + crypto.randomUUID() + '-' + safeName;
  const mimeType = file.type || 'application/octet-stream';
  const { error: uploadError } = await client.storage.from('ascensao-documents').upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await client.from('lead_documents').insert({
    organization_id: organizationId, opportunity_id: opportunityId, uploaded_by: authData.user.id,
    original_name: originalName, storage_path: storagePath, mime_type: mimeType, size_bytes: file.size,
  }).select('*').single();
  if (error) {
    const { error: cleanupError } = await client.storage.from('ascensao-documents').remove([storagePath]);
    if (cleanupError) console.error('[documentos] Falha ao limpar envio incompleto.', cleanupError);
    throw error;
  }
  return data;
}
async function createLeadDocumentDownload({ storagePath }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.storage.from('ascensao-documents').createSignedUrl(storagePath, 300, { download: true });
  if (error) throw error;
  return data.signedUrl;
}

function paymentReceiptMime(file) {
  const byExtension = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
  };
  const declared = String(file?.type || '').toLowerCase() === 'image/jpg'
    ? 'image/jpeg' : String(file?.type || '').toLowerCase();
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  return ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(declared)
    ? declared : byExtension[extension] || '';
}
async function uploadPaymentReceipt({ organizationId, opportunityId, userId, file }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user?.id) {
    throw new Error('Sua sessao expirou. Entre novamente antes de anexar o comprovante.');
  }
  const authenticatedUserId = authData.user.id;
  if (userId && userId !== authenticatedUserId) {
    console.warn('[comprovantes] O usuario da tela estava dessincronizado da sessao autenticada.');
  }
  if (!file || file.size < 1 || file.size > 10 * 1024 * 1024) {
    throw new Error('O comprovante deve ter entre 1 byte e 10 MB.');
  }
  const mimeType = paymentReceiptMime(file);
  if (!mimeType) throw new Error('Envie um comprovante em PDF, JPG, PNG ou WebP.');
  const originalName = String(file.name || 'comprovante').slice(0, 180);
  const safeName = originalName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120);
  const storagePath = `${organizationId}/payment-receipts/${opportunityId}/${authenticatedUserId}/${crypto.randomUUID()}-${safeName || 'comprovante'}`;
  /* Preserva a causa real ao traduzir o erro para o vendedor.
     Substituir a mensagem do Supabase por um palpite deixa a falha invisivel
     para quem vai corrigir — foi o que fez esta correcao falhar da primeira vez.
     Agora o motivo tecnico vai para o console e um codigo curto acompanha a
     mensagem, para o vendedor conseguir relatar o que aconteceu. */
  function falha(etapa, erroBruto, amigavel, codigo) {
    console.error('[comprovantes] Falha em ' + etapa + '.', {
      etapa,
      mensagem: erroBruto?.message,
      codigo: erroBruto?.code || erroBruto?.statusCode,
      detalhe: erroBruto?.details || erroBruto?.hint,
      storagePath,
      organizationId,
      opportunityId,
      usuarioAutenticado: authenticatedUserId,
      mimeType,
      tamanhoBytes: file?.size,
      erroBruto,
    });
    const erro = new Error(amigavel + ' (cod. ' + codigo + ')');
    erro.causa = erroBruto;
    erro.codigo = codigo;
    return erro;
  }

  const { error: uploadError } = await client.storage.from('ascensao-receipts').upload(storagePath, file, {
    contentType: mimeType, upsert: false,
  });
  if (uploadError) {
    const message = String(uploadError.message || '');
    const status = Number(uploadError.statusCode || uploadError.status || 0);

    /* Bucket ausente significa migration nao aplicada no banco: o deploy do
       front sobe sozinho, o Storage nao. Merece mensagem propria. */
    if (/bucket.*not.*found|not.*found.*bucket/i.test(message) || status === 404) {
      throw falha('upload', uploadError,
        'O armazenamento de comprovantes ainda nao foi criado neste ambiente. Avise o administrador.', 'ARM-404');
    }
    if (/mime|content.?type/i.test(message)) {
      throw falha('upload', uploadError, 'Formato nao aceito. Envie PDF, JPG, PNG ou WebP.', 'ARM-415');
    }
    if (/size|large|limit|413/i.test(message) || status === 413) {
      throw falha('upload', uploadError, 'O arquivo ultrapassa o limite de 10 MB.', 'ARM-413');
    }
    if (/jwt|expired|invalid.*token/i.test(message) || status === 401) {
      throw falha('upload', uploadError,
        'Sua sessao expirou. Atualize a pagina e entre novamente.', 'ARM-401');
    }
    if (/row.level|policy|unauthorized|forbidden|permission/i.test(message) || status === 403) {
      throw falha('upload', uploadError,
        'Voce nao tem permissao para anexar neste lead. Confirme se o lead esta na sua carteira.', 'ARM-403');
    }
    if (/duplicate|already exists|conflict/i.test(message) || status === 409) {
      throw falha('upload', uploadError, 'Este arquivo ja foi enviado. Atualize a pagina.', 'ARM-409');
    }
    throw falha('upload', uploadError,
      message || 'O armazenamento nao conseguiu receber o arquivo. Tente novamente.', 'ARM-500');
  }

  const { data, error } = await client.from('payment_receipts').insert({
    organization_id: organizationId, opportunity_id: opportunityId,
    uploaded_by: authenticatedUserId, original_name: originalName, storage_path: storagePath,
    mime_type: mimeType, size_bytes: file.size,
  }).select('*').single();
  if (error) {
    /* O arquivo subiu mas o registro falhou: remove o binario para nao deixar
       lixo orfao no Storage. Se a limpeza tambem falhar, seguimos com o erro
       original — ele e o que importa para o diagnostico. */
    try {
      await client.storage.from('ascensao-receipts').remove([storagePath]);
    } catch (limpezaError) {
      console.error('[comprovantes] Nao foi possivel remover o arquivo orfao.', limpezaError);
    }
    const codigo = String(error.code || '');
    if (codigo === '42P01') {
      throw falha('registro', error,
        'A tabela de comprovantes ainda nao existe neste ambiente. Avise o administrador.', 'REG-42P01');
    }
    if (codigo === '42501' || /row.level|policy/i.test(String(error.message || ''))) {
      throw falha('registro', error,
        'Voce nao tem permissao para registrar comprovante neste lead.', 'REG-42501');
    }
    if (codigo === 'PGRST116') {
      throw falha('registro', error,
        'O comprovante foi enviado mas nao pode ser lido de volta. Atualize a pagina.', 'REG-116');
    }
    throw falha('registro', error,
      error.message || 'Nao foi possivel registrar o comprovante.', 'REG-' + (codigo || '500'));
  }
  return data;
}
async function createPaymentReceiptDownload({ storagePath }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.storage.from('ascensao-receipts').createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
async function deletePaymentReceipt({ receiptId }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('delete_payment_receipt', {
    p_receipt_id: receiptId,
  });
  if (error) throw error;

  const storagePath = data?.storage_path;
  let storageCleanupPending = false;
  if (storagePath) {
    const { error: storageError } = await client.storage.from('ascensao-receipts').remove([storagePath]);
    if (storageError) {
      storageCleanupPending = true;
      console.error('[comprovantes] Metadados removidos, mas a limpeza do arquivo falhou.', storageError);
    }
  }
  return { ...data, storageCleanupPending };
}
async function transitionOpportunity({ opportunityId, targetStageId, expectedVersion, lossReasonId = null }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const row = await opportunityMutations.run('transition_opportunity', {
    p_opportunity_id: opportunityId,
    p_target_stage_id: targetStageId,
    p_expected_version: expectedVersion,
    p_loss_reason_id: lossReasonId,
  });
  // Publish the committed row immediately; don't wait for a delayed Realtime
  // message to invalidate the previous won/open state in goals and ranking.
  window.dispatchEvent(new CustomEvent('ascensao:opportunity-committed', { detail: { row } }));
  return row;
}

async function bulkUpdateOpportunities({ organizationId, opportunityIds, ownerId = null, pipelineId = null }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const ids = [...new Set((opportunityIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Selecione ao menos um lead.');
  const { data, error } = await client.rpc('bulk_update_opportunities', {
    p_organization_id: organizationId,
    p_opportunity_ids: ids,
    p_owner_id: ownerId || null,
    p_pipeline_id: pipelineId || null,
  });
  if (error) throw error;
  return data || [];
}
async function completeActivity({ activityId, result, notes = null, durationSeconds = null }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('complete_activity', {
    p_activity_id: activityId, p_result: result, p_notes: notes,
    p_duration_seconds: durationSeconds,
  });
  if (error) throw error;
  return data;
}
async function rescheduleActivity({ activityId, scheduledAt }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('reschedule_activity', {
    p_activity_id: activityId, p_scheduled_at: scheduledAt,
  });
  if (error) throw error;
  return data;
}
async function cancelActivity(activityId) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('cancel_activity', { p_activity_id: activityId });
  if (error) throw error;
  return data;
}
async function cancelOpportunity({ opportunityId, expectedVersion }) {
  if (!client) throw new Error('Supabase nao configurado.');
  return opportunityMutations.run('cancel_opportunity', {
    p_opportunity_id: opportunityId, p_expected_version: expectedVersion,
  });
}
async function updateOpportunity(payload) {
  if (!client) throw new Error('Supabase nao configurado.');
  const numberOrNull = (value) => value === '' || value === null || value === undefined ? null : Number(value);
  return opportunityMutations.run('update_opportunity_details_v4', {
    p_opportunity_id: payload.opportunityId,
    p_expected_version: payload.expectedVersion,
    p_owner_id: payload.ownerId,
    p_product_id: payload.productId || null,
    p_convention_id: payload.conventionId || null,
    p_registration_number: payload.registrationNumber || null,
    p_bank_id: payload.bankId || null,
    p_source_id: payload.sourceId || null,
    p_full_name: payload.fullName,
    p_cpf: payload.cpf || null,
    p_phone: payload.phone || null,
    p_email: payload.email || null,
    p_city: payload.city || null,
    p_state: payload.state || null,
    p_amount: payload.amount,
    p_total_value: numberOrNull(payload.totalValue),
    p_final_value: numberOrNull(payload.finalValue),
    p_requested_reversal: numberOrNull(payload.requestedReversal),
    p_expected_close_date: payload.expectedCloseDate || null,
    p_notes: payload.notes || null,
  });
}

async function saveTag({ organizationId, tagId = null, name, color }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('save_tag', {
    p_organization_id: organizationId,
    p_tag_id: tagId,
    p_name: name,
    p_color: color,
  });
  if (error) throw error;
  return data;
}

async function setOpportunityTags({ opportunityId, tagIds = [] }) {
  if (!client) throw new Error('Supabase nao configurado.');
  const { data, error } = await client.rpc('set_opportunity_tags', {
    p_opportunity_id: opportunityId,
    p_tag_ids: [...new Set(tagIds)],
  });
  if (error) throw error;
  return data ?? [];
}
async function signOut() {
  window.AGIR.fin?.resetSession?.();
  if (!client) return;
  cancelSessionReads();
  await stopWorkspaceRealtime();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

window.AGIR_BACKEND = {
  mode: configured ? 'supabase' : 'demo',
  configured,
  client,
  accessContext,
  signIn,
  loadMood,
  loadCommercial,
  loadCommercialModule,
  loadLeadWorkspace,
  cancelSessionReads,
  loadCrmRealtimeSnapshot,
  loadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeWorkspace,
  stopWorkspaceRealtime,
  loadSalesRanking,
  loadOpportunityHistory,
  saveMood,
  skipMood,
  createOpportunity,
  createActivity,
  sendOpportunityMessage,
  createCompany,
  createContact,
  upsertGoals,
  inviteUser,
  manageUser,
  updateManagedUser,
  setUserPassword,
  saveCatalog,
  archiveCatalog,
  savePipelineStage,
  reorderPipelineStages,
  archivePipelineStage,
  saveTeam,
  updateOrganization,
  updateOwnProfile,
  uploadOwnAvatar,
  avatarUrl,
  changePassword,
  savePreferences,
  setLessonCompletion,
  markLessonStarted,
  saveStudyPlan,
  archiveStudyPlan,
  saveLearningTrack,
  archiveLearningTrack,
  saveLesson,
  archiveLesson,
  saveFileCategory,
  archiveFileCategory,
  uploadFile,
  createFileDownload,
  archiveFile,
  loadLeadDocuments,
  uploadLeadDocument,
  createLeadDocumentDownload,
  uploadPaymentReceipt,
  createPaymentReceiptDownload,
  deletePaymentReceipt,
  transitionOpportunity,
  refreshOpportunity: (id) => opportunityMutations.refresh(id),
  bulkUpdateOpportunities,
  completeActivity,
  rescheduleActivity,
  cancelActivity,
  cancelOpportunity,
  updateOpportunity,
  saveTag,
  setOpportunityTags,
  restoreSession,
  signOut,
};

// Fetch the runtime while authentication/data restoration is in flight.
const bootstrapReady = (async () => {
  try {
    window.AGIR_BOOTSTRAP = await withTimeout(restoreSession(), 45000, 'A restauracao da sessao expirou.');
  } catch (error) {
    cancelSessionReads();
    console.error('[bootstrap] Nao foi possivel restaurar a sessao.', error);
    window.AGIR_BOOTSTRAP = { session: null, context: null, error };
  }
})();

const coreScripts = [
  'assets/js/core/dom.js',
  'assets/js/core/format.js',
  'assets/js/core/lead-io.js',
  'assets/js/core/agency-domain.js',
  'assets/js/core/store.js',
  'assets/js/core/analytics.js',
  'assets/js/core/charts.js',
  'assets/js/core/motion.js',
  'assets/js/core/ui.js',
  'assets/js/core/router.js',
  'assets/js/core/widgets.js',
  /* O check-in de humor e global e precisa estar disponivel logo apos o
     bootstrap. As demais telas sao carregadas somente quando a rota abrir. */
  'assets/js/pages/performance/clima.js',
];

const pageScripts = {
  notifications: 'assets/js/pages/notifications.js',
  crmPipeline: 'assets/js/pages/crm/pipeline.js',
  crmDashboard: ['assets/js/pages/crm/metas.js', 'assets/js/pages/crm/dashboard.js'],
  crmLeads: 'assets/js/pages/crm/leads.js',
  crmContatos: 'assets/js/pages/crm/leads.js',
  crmAtividades: 'assets/js/pages/crm/atividades.js',
  crmRelatorios: 'assets/js/pages/crm/relatorios.js',
  perfCockpit: 'assets/js/pages/performance/cockpit.js',
  perfInicio: 'assets/js/pages/performance/cockpit.js',
  perfConteudos: 'assets/js/pages/performance/conteudos.js',
  perfRanking: 'assets/js/pages/performance/ranking.js',
  perfClima: 'assets/js/pages/performance/clima.js',
  perfLigacoes: 'assets/js/pages/performance/ligacoes.js',
  perfArquivos: 'assets/js/pages/performance/equipe.js',
  finVisao: 'assets/js/pages/financeiro/workspace.js',
  finDRE: 'assets/js/pages/financeiro/workspace.js',
  finDre: 'assets/js/pages/financeiro/workspace.js',
  finFluxo: 'assets/js/pages/financeiro/workspace.js',
  finLancamentos: 'assets/js/pages/financeiro/workspace.js',
  finOrcamento: 'assets/js/pages/financeiro/workspace.js',
  finPagar: 'assets/js/pages/financeiro/workspace.js',
  finReceber: 'assets/js/pages/financeiro/workspace.js',
  finContas: 'assets/js/pages/financeiro/workspace.js',
  finConciliacao: 'assets/js/pages/financeiro/workspace.js',
  finCadastros: 'assets/js/pages/financeiro/workspace.js',
  finAprovacoes: 'assets/js/pages/financeiro/workspace.js',
  finRelatorios: 'assets/js/pages/financeiro/workspace.js',
  finAnalise: 'assets/js/pages/financeiro/workspace.js',
  finAuditoria: 'assets/js/pages/financeiro/workspace.js',
  config: [
    'assets/js/pages/performance/equipe.js',
    'assets/js/pages/crm/metas.js',
    'assets/js/pages/config/config.js',
  ],
};

// Generated from source contents by Vite: no forgotten manual cache version.
const scriptVersion = import.meta.env.DEV ? String(Date.now()) : __AGIR_ASSET_VERSION__;

const loadedScripts = new Map();

function loadLegacyScript(source) {
  if (loadedScripts.has(source)) return loadedScripts.get(source);
  const loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${source}?v=${scriptVersion}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Falha ao carregar ${source}`));
    document.body.appendChild(script);
  }).catch((error) => {
    /* Permite uma nova tentativa se a rede falhar durante o primeiro acesso. */
    loadedScripts.delete(source);
    throw error;
  });
  loadedScripts.set(source, loading);
  return loading;
}

let financeRepositoryScope = null;
async function prepareFinance() {
  if (configured) {
    const organizationId = window.AGIR.store.get('session.organizationId');
    const userId = window.AGIR.store.get('session.userId');
    if (!organizationId || !userId) throw new Error('Entre com uma conta ativa para acessar o financeiro.');
    const scope = organizationId + ':' + userId;
    if (financeRepositoryScope !== scope) {
      window.AGIR.fin?.resetSession?.();
      window.AGIR_FINANCE_REPOSITORY = createFinanceRepository({ client, organizationId, userId });
      financeRepositoryScope = scope;
    }
  } else {
    window.AGIR_FINANCE_REPOSITORY = null;
  }
  return window.AGIR.fin.ready();
}
window.AGIR_LOAD_PAGE_SCRIPT = function loadPageScript(pageKey) {
  if (/^fin/.test(pageKey)) {
    return loadLegacyScript('assets/js/core/finance.js')
      .then(prepareFinance)
      .then(() => loadLegacyScript('assets/js/core/finance-export.js'))
      .then(() => loadLegacyScript('assets/js/core/finance-attachments.js'))
      .then(() => loadLegacyScript('assets/js/pages/financeiro/workspace.js'))
      .then(() => { if (window.AGIR.pages.finDre) window.AGIR.pages.finDRE = window.AGIR.pages.finDre; });
  }
  const configured = pageScripts[pageKey];
  if (!configured) return Promise.resolve();
  const sources = Array.isArray(configured) ? configured : [configured];
  return Promise.all(sources.map(loadLegacyScript));
};

if (!client) await loadLegacyScript('assets/js/core/seed.js');
if (import.meta.env.PROD) await loadLegacyScript('assets/js/core-runtime.js');
else for (const source of coreScripts) await loadLegacyScript(source);
await bootstrapReady;
await loadLegacyScript('assets/js/app.js');
finishBootMeasurement();
