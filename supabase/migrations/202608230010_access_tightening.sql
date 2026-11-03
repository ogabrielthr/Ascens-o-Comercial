begin;

-- Role assignment and account activation are server-side operations only.
drop policy if exists memberships_admin_all on public.organization_members;
drop policy if exists profiles_update_admin on public.profiles;

revoke update on public.profiles from authenticated;
grant update (full_name, phone, extension, avatar_path, admission_date, updated_at)
  on public.profiles to authenticated;

-- A user may edit only today's mood response. Historical answers are immutable.
drop policy if exists mood_checkins_update_self on public.daily_mood_checkins;
create policy mood_checkins_update_today_self on public.daily_mood_checkins
for update to authenticated
using (user_id = auth.uid() and checkin_date = current_date)
with check (user_id = auth.uid() and checkin_date = current_date);

drop policy if exists mood_factors_link_self_write on public.mood_checkin_factors;
create policy mood_factors_link_self_insert on public.mood_checkin_factors
for insert to authenticated
with check (
  exists (
    select 1 from public.daily_mood_checkins c
    where c.id = mood_checkin_factors.checkin_id
      and c.user_id = auth.uid()
      and c.checkin_date = current_date
  )
);
create policy mood_factors_link_self_delete on public.mood_checkin_factors
for delete to authenticated
using (
  exists (
    select 1 from public.daily_mood_checkins c
    where c.id = mood_checkin_factors.checkin_id
      and c.user_id = auth.uid()
      and c.checkin_date = current_date
  )
);

-- Financial approval, realization, cancellation and reversal are server-side.
drop policy if exists financial_entries_finance_write on public.financial_entries;
create policy financial_entries_insert_draft on public.financial_entries
for insert to authenticated
with check (
  app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role])
  and status in ('draft', 'scheduled', 'pending_approval')
  and approved_by is null
  and approved_at is null
);
create policy financial_entries_update_unapproved on public.financial_entries
for update to authenticated
using (
  app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role])
  and status in ('draft', 'scheduled', 'pending_approval')
)
with check (
  app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role])
  and status in ('draft', 'scheduled', 'pending_approval')
  and approved_by is null
  and approved_at is null
);

-- Catalogs and budgets remain directly manageable by Finance/Admin.
drop policy if exists chart_of_accounts_finance_write on public.chart_of_accounts;
create policy chart_of_accounts_admin_finance_write on public.chart_of_accounts
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]));

drop policy if exists cost_centers_finance_write on public.cost_centers;
create policy cost_centers_admin_finance_write on public.cost_centers
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]));

drop policy if exists budgets_finance_write on public.budgets;
create policy budgets_admin_finance_write on public.budgets
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]));

commit;