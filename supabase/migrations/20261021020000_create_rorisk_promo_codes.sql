-- Promo codes let staff hand out Coins or RoCoins without touching balances by hand.
-- Codes are created from the Supabase dashboard (Table Editor -> rorisk_promo_codes)
-- or with select public.create_rorisk_promo_code(...). Redemption is server-only.

create table if not exists public.rorisk_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  reward_type text not null default 'coins',
  amount bigint not null,
  max_redemptions integer,
  redeemed_count integer not null default 0,
  per_user_limit integer not null default 1,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rorisk_promo_codes_code_format check (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  constraint rorisk_promo_codes_reward_type check (reward_type in ('coins', 'rocoins')),
  constraint rorisk_promo_codes_amount check (amount > 0),
  constraint rorisk_promo_codes_max_redemptions check (max_redemptions is null or max_redemptions > 0),
  constraint rorisk_promo_codes_redeemed_count check (redeemed_count >= 0),
  constraint rorisk_promo_codes_per_user_limit check (per_user_limit > 0),
  constraint rorisk_promo_codes_window check (expires_at is null or expires_at > starts_at)
);

create unique index if not exists rorisk_promo_codes_code_unique_idx
  on public.rorisk_promo_codes (upper(code));
create index if not exists rorisk_promo_codes_active_idx
  on public.rorisk_promo_codes (active, expires_at);

create table if not exists public.rorisk_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.rorisk_promo_codes(id) on delete cascade,
  user_uuid uuid not null references public.rorisk_users(uuid) on delete cascade,
  code text not null,
  reward_type text not null,
  amount bigint not null,
  redeemed_at timestamptz not null default now()
);

create index if not exists rorisk_promo_redemptions_code_idx
  on public.rorisk_promo_redemptions (code_id, redeemed_at desc);
create index if not exists rorisk_promo_redemptions_user_idx
  on public.rorisk_promo_redemptions (user_uuid, redeemed_at desc);

alter table public.rorisk_promo_codes enable row level security;
alter table public.rorisk_promo_redemptions enable row level security;

revoke all on table public.rorisk_promo_codes from public, anon, authenticated;
revoke all on table public.rorisk_promo_redemptions from public, anon, authenticated;
grant select, insert, update, delete on table public.rorisk_promo_codes to service_role;
grant select, insert, update, delete on table public.rorisk_promo_redemptions to service_role;

comment on table public.rorisk_promo_codes is
  'Staff-managed promo codes. Insert a row (or call create_rorisk_promo_code) to publish a code instantly; the API reads it on redeem.';
comment on column public.rorisk_promo_codes.code is 'Case-insensitive, 3-32 letters, numbers, underscore or hyphen.';
comment on column public.rorisk_promo_codes.reward_type is 'coins or rocoins.';
comment on column public.rorisk_promo_codes.max_redemptions is 'Total redemptions allowed. null means unlimited.';
comment on column public.rorisk_promo_codes.per_user_limit is 'Redemptions allowed per account.';
comment on table public.rorisk_promo_redemptions is
  'Audit trail for promo code redemptions. Inserted by redeem_rorisk_promo_code().';

create or replace function public.create_rorisk_promo_code(
  p_code text,
  p_reward_type text,
  p_amount bigint,
  p_max_redemptions integer default null,
  p_per_user_limit integer default 1,
  p_starts_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_note text default null
)
returns public.rorisk_promo_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo public.rorisk_promo_codes%rowtype;
  v_reward_type text := lower(trim(coalesce(p_reward_type, 'coins')));
begin
  if v_reward_type not in ('coins', 'rocoins') then
    raise exception 'reward_type must be coins or rocoins.';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'amount must be greater than zero.';
  end if;
  insert into public.rorisk_promo_codes (
    code, reward_type, amount, max_redemptions, per_user_limit, starts_at, expires_at, note
  ) values (
    upper(trim(p_code)), v_reward_type, p_amount, p_max_redemptions,
    greatest(1, coalesce(p_per_user_limit, 1)), coalesce(p_starts_at, now()), p_expires_at, p_note
  )
  returning * into v_promo;
  return v_promo;
end;
$$;

create or replace function public.redeem_rorisk_promo_code(p_user_uuid uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_promo public.rorisk_promo_codes%rowtype;
  v_user public.rorisk_users%rowtype;
  v_redemptions integer;
begin
  if p_user_uuid is null then
    raise exception 'Please sign in to perform this action.';
  end if;
  if v_code = '' then
    raise exception 'Enter a promo code to redeem.';
  end if;

  select * into v_promo
  from public.rorisk_promo_codes
  where upper(code) = upper(v_code)
  for update;

  if not found then
    raise exception 'Your entered promo code is invalid.';
  end if;
  if not v_promo.active then
    raise exception 'This promo code is no longer active.';
  end if;
  if v_promo.starts_at is not null and now() < v_promo.starts_at then
    raise exception 'This promo code is not active yet.';
  end if;
  if v_promo.expires_at is not null and now() >= v_promo.expires_at then
    raise exception 'This promo code has expired.';
  end if;
  if v_promo.max_redemptions is not null and v_promo.redeemed_count >= v_promo.max_redemptions then
    raise exception 'This promo code has been fully redeemed.';
  end if;

  select count(*) into v_redemptions
  from public.rorisk_promo_redemptions
  where code_id = v_promo.id and user_uuid = p_user_uuid;

  if v_redemptions >= v_promo.per_user_limit then
    raise exception 'You have already redeemed this promo code.';
  end if;

  if v_promo.reward_type = 'coins' then
    update public.rorisk_users
    set coins = coins + v_promo.amount
    where uuid = p_user_uuid
    returning * into v_user;
  else
    update public.rorisk_users
    set rocoins = rocoins + v_promo.amount
    where uuid = p_user_uuid
    returning * into v_user;
  end if;

  if not found then
    raise exception 'Your account could not be found.';
  end if;

  insert into public.rorisk_promo_redemptions (code_id, user_uuid, code, reward_type, amount)
  values (v_promo.id, p_user_uuid, v_promo.code, v_promo.reward_type, v_promo.amount);

  update public.rorisk_promo_codes
  set redeemed_count = redeemed_count + 1,
      updated_at = now()
  where id = v_promo.id;

  return jsonb_build_object(
    'code', v_promo.code,
    'rewardType', v_promo.reward_type,
    'amount', v_promo.amount,
    'user', to_jsonb(v_user)
  );
end;
$$;

revoke all on function public.create_rorisk_promo_code(text, text, bigint, integer, integer, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.redeem_rorisk_promo_code(uuid, text) from public, anon, authenticated;
grant execute on function public.create_rorisk_promo_code(text, text, bigint, integer, integer, timestamptz, timestamptz, text) to service_role;
grant execute on function public.redeem_rorisk_promo_code(uuid, text) to service_role;
