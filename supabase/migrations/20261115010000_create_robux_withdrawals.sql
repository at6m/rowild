-- Robux withdrawals were a placeholder in the cashier: the wallet only showed a
-- fake "queued" screen, so there was never anything for an admin to pay out.
-- This queue makes them real. RoCoins leave the balance when the request is
-- made and come back if the request is canceled, mirroring crypto withdrawals.

create table if not exists public.rorisk_robux_withdrawals (
  uuid uuid primary key default gen_random_uuid(),
  user_uuid uuid not null references public.rorisk_users(uuid) on delete restrict,
  roblox_id bigint,
  rocoins bigint not null check (rocoins > 0),
  robux bigint not null check (robux > 0),
  robux_after_tax bigint not null default 0 check (robux_after_tax >= 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'canceled')),
  note text,
  refunded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists rorisk_robux_withdrawals_status_idx
  on public.rorisk_robux_withdrawals(status, created_at desc);
create index if not exists rorisk_robux_withdrawals_user_idx
  on public.rorisk_robux_withdrawals(user_uuid, created_at desc);

alter table public.rorisk_robux_withdrawals enable row level security;
revoke all on table public.rorisk_robux_withdrawals from public, anon, authenticated;
grant select, insert, update on table public.rorisk_robux_withdrawals to service_role;

comment on table public.rorisk_robux_withdrawals is
  'Robux payout queue. RoCoins are deducted on request and refunded when a request is canceled.';

create or replace function public.reserve_rorisk_robux_withdrawal(
  p_uuid uuid,
  p_user_uuid uuid,
  p_rocoins bigint,
  p_robux bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.rorisk_users%rowtype;
  v_withdrawal public.rorisk_robux_withdrawals%rowtype;
begin
  select * into v_user from public.rorisk_users where uuid = p_user_uuid for update;
  if not found then raise exception 'Please sign in to perform this action.'; end if;
  if v_user.roblox_id is null then
    raise exception 'Link and verify your Roblox account before withdrawing Robux.';
  end if;
  if coalesce(p_rocoins, 0) < 14 then
    raise exception 'The minimum Robux withdrawal is 14 RoCoins.';
  end if;
  if coalesce(p_robux, 0) < 7 then
    raise exception 'The minimum Robux withdrawal is 7 R$.';
  end if;
  if coalesce(v_user.rocoins, 0) < p_rocoins then
    raise exception 'Insufficient balance.';
  end if;

  update public.rorisk_users
  set rocoins = rocoins - p_rocoins
  where uuid = p_user_uuid
  returning * into v_user;

  insert into public.rorisk_robux_withdrawals (uuid, user_uuid, roblox_id, rocoins, robux, robux_after_tax)
  values (p_uuid, p_user_uuid, v_user.roblox_id, p_rocoins, p_robux, floor(p_robux * 0.7))
  returning * into v_withdrawal;

  return jsonb_build_object('withdrawal', to_jsonb(v_withdrawal), 'user', to_jsonb(v_user));
end;
$$;

create or replace function public.finalize_rorisk_robux_withdrawal(
  p_uuid uuid,
  p_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal public.rorisk_robux_withdrawals%rowtype;
  v_user public.rorisk_users%rowtype;
  v_status text := lower(coalesce(p_status, ''));
begin
  if v_status not in ('completed', 'canceled') then
    raise exception 'That outcome is not recognised.';
  end if;

  select * into v_withdrawal from public.rorisk_robux_withdrawals where uuid = p_uuid for update;
  if not found then raise exception 'Withdrawal record not found.'; end if;
  if v_withdrawal.status <> 'pending' then raise exception 'This withdrawal is already settled.'; end if;

  update public.rorisk_robux_withdrawals
  set status = v_status,
      note = coalesce(nullif(p_note, ''), note),
      updated_at = now(),
      completed_at = now()
  where uuid = v_withdrawal.uuid
  returning * into v_withdrawal;

  if v_status = 'canceled' and not v_withdrawal.refunded then
    update public.rorisk_robux_withdrawals
    set refunded = true, updated_at = now()
    where uuid = v_withdrawal.uuid and refunded = false
    returning * into v_withdrawal;

    update public.rorisk_users
    set rocoins = coalesce(rocoins, 0) + v_withdrawal.rocoins
    where uuid = v_withdrawal.user_uuid
    returning * into v_user;
  end if;

  return jsonb_build_object('withdrawal', to_jsonb(v_withdrawal), 'user', to_jsonb(v_user));
end;
$$;

revoke all on function public.reserve_rorisk_robux_withdrawal(uuid, uuid, bigint, bigint),
  public.finalize_rorisk_robux_withdrawal(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_rorisk_robux_withdrawal(uuid, uuid, bigint, bigint),
  public.finalize_rorisk_robux_withdrawal(uuid, text, text)
  to service_role;
