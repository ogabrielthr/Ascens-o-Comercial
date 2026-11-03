const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const leaderModule = import('../assets/js/core/workspace-leader.mjs');

class FakeChannel {
  static channels = new Map();
  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    const peers = FakeChannel.channels.get(name) || new Set();
    peers.add(this);
    FakeChannel.channels.set(name, peers);
  }
  addEventListener(type, listener) { if (type === 'message') this.listeners.add(listener); }
  removeEventListener(type, listener) { if (type === 'message') this.listeners.delete(listener); }
  postMessage(data) {
    for (const peer of FakeChannel.channels.get(this.name) || []) {
      if (peer !== this) for (const listener of peer.listeners) listener({ data });
    }
  }
  close() {
    FakeChannel.channels.get(this.name)?.delete(this);
  }
}

function fakeStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function fakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const group = listeners.get(type) || new Set(); group.add(listener); listeners.set(type, group);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, event = {}) { for (const listener of listeners.get(type) || []) listener(event); },
  };
}

test('one visible tab owns workspace sync and followers receive relayed deltas', async () => {
  FakeChannel.channels.clear();
  const { createWorkspaceLeader } = await leaderModule;
  const storage = fakeStorage();
  const eventTarget = fakeTarget();
  const documentRef = { ...fakeTarget(), hidden: false };
  const intervals = new Set();
  const common = { scope: 'org:user', storage, BroadcastChannelCtor: FakeChannel, eventTarget, documentRef,
    setIntervalFn: fn => (intervals.add(fn), fn), clearIntervalFn: fn => intervals.delete(fn) };
  const first = createWorkspaceLeader({ ...common, randomId: () => 'first' });
  const second = createWorkspaceLeader({ ...common, randomId: () => 'second' });
  assert.equal(first.isLeader(), true);
  assert.equal(second.isLeader(), false);

  const received = [];
  second.subscribe(message => received.push(message));
  assert.equal(first.broadcast('crm-change', { id: 'lead' }), true);
  assert.deepEqual(received.map(message => message.type), ['crm-change']);
  assert.equal(second.broadcast('crm-change', { id: 'duplicate' }), false);

  first.dispose();
  assert.equal(second.isLeader(), true);
  second.dispose();
  assert.equal(intervals.size, 0);
});

test('coordination safely degrades when BroadcastChannel is unavailable', async () => {
  const { createWorkspaceLeader } = await leaderModule;
  const storage = fakeStorage();
  const common = { scope: 'fallback', storage, BroadcastChannelCtor: null, eventTarget: fakeTarget(),
    documentRef: { ...fakeTarget(), hidden: false }, setIntervalFn: () => 1, clearIntervalFn() {} };
  const first = createWorkspaceLeader({ ...common, randomId: () => 'first' });
  const second = createWorkspaceLeader({ ...common, randomId: () => 'second' });
  assert.equal(first.isLeader(), true);
  assert.equal(second.isLeader(), true);
  first.dispose(); second.dispose();
});

test('database performance migration keeps owner scope and aggregates ranking server-side', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '202609140001_performance_workspace_snapshot.sql'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const analytics = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'analytics.js'), 'utf8');
  const accessBody = sql.slice(sql.indexOf('create or replace function app_private.can_access_crm_owner'), sql.indexOf('create index if not exists contacts_org_live_id_idx'));

  assert.equal((accessBody.match(/from public\.organization_members/g) || []).length, 1);
  assert.match(accessBody, /member\.role = 'admin'/);
  assert.match(accessBody, /target_owner = \(select auth\.uid\(\)\)/);
  assert.match(sql, /create or replace function app_private\.has_role\(target_org uuid, allowed text\[\]\)/);
  assert.match(sql, /create or replace function public\.crm_workspace_snapshot/);
  assert.match(sql, /p_known -> 'opportunities' ->> opportunity_row\.id::text/);
  assert.match(sql, /::timestamptz\s+is distinct from opportunity_row\.updated_at/);
  assert.match(sql, /can_read_all or opportunity_row\.owner_id = caller_id/);
  assert.match(sql, /create or replace function public\.sales_ranking_snapshot/);
  assert.match(sql, /date_trunc\('day', sale\.closed_at at time zone 'America\/Sao_Paulo'\)/);
  assert.match(sql, /count\(\*\)::integer as sales_count/);
  assert.match(sql, /limit p_recent_limit/);
  assert.match(main, /rpc\('crm_workspace_snapshot'/);
  assert.match(main, /rpc\('sales_ranking_snapshot'/);
  assert.match(analytics, /Number\(o\.quantidadeVendas\)/);
});

test('workspace snapshot enforces seller/admin scope and returns only changed rows', { timeout: 30000 }, async () => {
  const db = new PGlite();
  const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '202609140001_performance_workspace_snapshot.sql'), 'utf8');
  const ids = Array.from({ length: 10 }, (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`);
  const [org, admin, seller, other, contactA, contactB, opportunityA, opportunityB, activityA, activityB] = ids;
  try {
    await db.exec(`
      create schema auth; create schema app_private;
      create role anon; create role authenticated; create role service_role;
      create type public.access_role as enum ('admin','commercial');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create table public.organization_members(organization_id uuid,user_id uuid,role public.access_role,active boolean);
      create function app_private.has_role(target_org uuid, allowed public.access_role[])
        returns boolean language sql stable security definer set search_path = '' as $$
        select exists (select 1 from public.organization_members member
          where member.organization_id = target_org and member.user_id = auth.uid()
            and member.active and member.role = any(allowed)) $$;
      create table public.contacts(id uuid primary key,organization_id uuid,owner_id uuid,full_name text,updated_at timestamptz,deleted_at timestamptz);
      create table public.opportunities(id uuid primary key,organization_id uuid,owner_id uuid,status text,updated_at timestamptz,deleted_at timestamptz,closed_at timestamptz,requested_reversal numeric,total_value numeric,product_id uuid,source_id uuid);
      create table public.activities(id uuid primary key,organization_id uuid,owner_id uuid,opportunity_id uuid,status text,updated_at timestamptz,deleted_at timestamptz);
      create table public.opportunity_change_history(id uuid primary key,organization_id uuid);
      create table public.opportunity_stage_history(id uuid primary key,organization_id uuid);
      create table public.tags(id uuid primary key,organization_id uuid,name text);
      create table public.opportunity_tags(opportunity_id uuid,tag_id uuid);
      create table public.opportunity_messages(id uuid primary key,organization_id uuid,opportunity_id uuid,created_at timestamptz,deleted_at timestamptz);
      create table public.payment_receipts(id uuid primary key,organization_id uuid,opportunity_id uuid,created_at timestamptz);
      create table public.teams(id uuid primary key,organization_id uuid,active boolean,deleted_at timestamptz);
      create table public.team_members(team_id uuid,user_id uuid,joined_at timestamptz);
    `);
    await db.exec(migration);
    await db.exec(`
      insert into public.organization_members values
        ('${org}','${admin}','admin',true),('${org}','${seller}','commercial',true),('${org}','${other}','commercial',true);
      insert into public.contacts values
        ('${contactA}','${org}','${seller}','Carteira A','2026-09-14T12:00:00Z',null),
        ('${contactB}','${org}','${other}','Carteira B','2026-09-14T12:00:00Z',null);
      insert into public.opportunities values
        ('${opportunityA}','${org}','${seller}','won','2026-09-14T12:00:00Z',null,'2026-09-14T11:00:00Z',100.25,500.75,null,null),
        ('${opportunityB}','${org}','${other}','won','2026-09-14T12:00:00Z',null,'2026-09-14T11:30:00Z',200.50,800.25,null,null);
      insert into public.activities values
        ('${activityA}','${org}','${seller}','${opportunityA}','pending','2026-09-14T12:00:00Z',null),
        ('${activityB}','${org}','${other}','${opportunityB}','pending','2026-09-14T12:00:00Z',null);
    `);

    await db.query("select set_config('test.user_id',$1,false)", [seller]);
    const sellerSnapshot = (await db.query('select public.crm_workspace_snapshot($1,null) as data', [org])).rows[0].data;
    assert.deepEqual(sellerSnapshot.contact_ids, [contactA]);
    assert.deepEqual(sellerSnapshot.opportunity_ids, [opportunityA]);
    assert.deepEqual(sellerSnapshot.activity_ids, [activityA]);

    const known = { contacts: { [contactA]: '2026-09-14T12:00:00.000Z' },
      opportunities: { [opportunityA]: '2026-09-14T12:00:00.000Z' },
      activities: { [activityA]: '2026-09-14T12:00:00.000Z' } };
    const unchanged = (await db.query('select public.crm_workspace_snapshot($1,$2) as data', [org, JSON.stringify(known)])).rows[0].data;
    assert.deepEqual(unchanged.contacts, []);
    assert.deepEqual(unchanged.opportunities, []);
    assert.deepEqual(unchanged.activities, []);

    await db.query("select set_config('test.user_id',$1,false)", [admin]);
    const adminSnapshot = (await db.query('select public.crm_workspace_snapshot($1,null) as data', [org])).rows[0].data;
    assert.equal(adminSnapshot.opportunity_ids.length, 2);
    const ranking = (await db.query(
      "select public.sales_ranking_snapshot($1,'2026-09-01T00:00:00Z','2026-09-30T23:59:59Z') as data", [org],
    )).rows[0].data;
    assert.equal(ranking.entries.length, 2);
    assert.equal(ranking.recent.length, 2);
    assert.equal(ranking.entries.reduce((sum, row) => sum + Number(row.sales_count), 0), 2);
  } finally {
    await db.close();
  }
});
