-- Live presence for the admin dashboard.
--
-- The site polls /api/auth/session while a tab is open, and that endpoint touches
-- one row per player here (at most every 20 seconds). The admin dashboard treats a
-- player as online while last_seen_at is within the last minute, so presence also
-- works when API requests land on different serverless instances.
--
-- This table is intentionally tiny and disposable: it never stores balances and a
-- stale row only costs one byte until the player comes back.

create table if not exists public.rorisk_presence (
  user_uuid uuid primary key references public.rorisk_users(uuid) on delete cascade,
  last_seen_at timestamptz not null default now(),
  room text
);

create index if not exists rorisk_presence_seen_idx on public.rorisk_presence (last_seen_at desc);

alter table public.rorisk_presence enable row level security;
revoke all on table public.rorisk_presence from public, anon, authenticated;
grant select, insert, update, delete on table public.rorisk_presence to service_role;

comment on table public.rorisk_presence is
  'Last time each player was seen. Written by the server session endpoint, read by the admin dashboard.';
