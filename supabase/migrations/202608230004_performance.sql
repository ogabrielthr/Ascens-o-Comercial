begin;

create table public.mood_scale_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  label text not null,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, score)
);

create table public.mood_factors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sentiment text not null check (sentiment in ('positive', 'negative', 'neutral')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index mood_factors_org_name_unique
  on public.mood_factors(organization_id, lower(name));

create table public.daily_mood_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checkin_date date not null default current_date,
  score smallint not null check (score between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, checkin_date)
);
create index daily_mood_checkins_org_date_idx
  on public.daily_mood_checkins(organization_id, checkin_date desc);
create index daily_mood_checkins_user_date_idx
  on public.daily_mood_checkins(user_id, checkin_date desc);

create table public.mood_checkin_factors (
  checkin_id uuid not null references public.daily_mood_checkins(id) on delete cascade,
  factor_id uuid not null references public.mood_factors(id) on delete restrict,
  primary key (checkin_id, factor_id)
);

create table public.mood_checkin_skips (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  skip_date date not null default current_date,
  skipped_at timestamptz not null default now(),
  primary key (organization_id, user_id, skip_date)
);

create table public.learning_tracks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  cover_path text,
  published boolean not null default false,
  position smallint not null default 0 check (position >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index learning_tracks_org_position_idx
  on public.learning_tracks(organization_id, published, position) where deleted_at is null;

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  track_id uuid not null references public.learning_tracks(id) on delete cascade,
  title text not null,
  description text,
  content_type text not null default 'link'
    check (content_type in ('video', 'audio', 'document', 'link', 'text')),
  content_url text,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  position smallint not null default 0 check (position >= 0),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index lessons_track_position_unique
  on public.lessons(track_id, position) where deleted_at is null;

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.learning_progress_status not null default 'not_started',
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, lesson_id, user_id),
  constraint lesson_progress_completed check (
    status <> 'completed' or (completed_at is not null and progress_percent = 100)
  )
);
create index lesson_progress_user_idx
  on public.lesson_progress(organization_id, user_id, status);

create table public.gamification_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  points integer not null check (points >= 0),
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, event_type, effective_from)
);

create table public.point_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  source_type text not null,
  source_id uuid not null,
  points integer not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, event_type, source_type, source_id)
);
create index point_events_ranking_idx
  on public.point_events(organization_id, occurred_at desc, user_id);

create table public.file_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  access_level public.file_access_level not null default 'organization',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index file_categories_org_name_unique
  on public.file_categories(organization_id, lower(name));

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.file_categories(id) on delete set null,
  name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  access_level public.file_access_level not null default 'organization',
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, storage_path)
);
create index files_org_category_idx
  on public.files(organization_id, category_id) where deleted_at is null;

create table public.file_downloads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);
create index file_downloads_file_idx on public.file_downloads(file_id, downloaded_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'mood_scale_options','mood_factors','daily_mood_checkins',
    'learning_tracks','lessons','lesson_progress','file_categories','files'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end $$;

commit;