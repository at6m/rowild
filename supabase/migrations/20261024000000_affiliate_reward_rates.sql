-- Affiliate reward rates: 2% of a referred user's deposits and 0.4% of their wagers.
-- Wager rewards were previously never credited: nothing wrote to rorisk_affiliates
-- when a referred player placed a bet. apply_rorisk_wager() is the single choke point
-- every game (and the battles/blackjack triggers) funnels through, so the credit lives there.

alter table public.rorisk_affiliates
  add column if not exists wager_earnings numeric(18, 6) not null default 0;

comment on column public.rorisk_affiliates.wager_earnings is
  'Fractional wager-reward accumulator. Whole coins are moved into total_earnings/available_earnings on every wager so small bets are not rounded away.';

create or replace function public.credit_rorisk_affiliate_wager(
  p_user_uuid uuid,
  p_currency text,
  p_wager bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text := case when lower(coalesce(p_currency, 'coins')) = 'rocoins' then 'rocoins' else 'coins' end;
  v_referrer uuid;
  v_accumulated numeric;
  v_whole_before numeric;
  v_reward bigint;
begin
  if p_user_uuid is null or coalesce(p_wager, 0) <= 0 then
    return;
  end if;

  if v_currency = 'coins' then
    update public.rorisk_affiliates
    set total_wagered = total_wagered + p_wager,
        updated_at = now()
    where user_uuid = p_user_uuid;
  else
    update public.rorisk_affiliates
    set total_wagered_rocoins = total_wagered_rocoins + p_wager,
        updated_at = now()
    where user_uuid = p_user_uuid;
  end if;

  select referrer_user_uuid into v_referrer
  from public.rorisk_affiliates
  where user_uuid = p_user_uuid;

  if v_referrer is null then
    return;
  end if;

  insert into public.rorisk_affiliates (user_uuid)
  values (v_referrer)
  on conflict (user_uuid) do nothing;

  select coalesce(wager_earnings, 0) into v_accumulated
  from public.rorisk_affiliates
  where user_uuid = v_referrer
  for update;

  v_whole_before := floor(coalesce(v_accumulated, 0));
  v_accumulated := coalesce(v_accumulated, 0) + (p_wager::numeric * 0.004);
  v_reward := greatest(0, (floor(v_accumulated) - v_whole_before)::bigint);

  update public.rorisk_affiliates
  set wager_earnings = v_accumulated,
      total_earnings = total_earnings + v_reward,
      available_earnings = available_earnings + v_reward,
      updated_at = now()
  where user_uuid = v_referrer;
end;
$$;

create or replace function public.apply_rorisk_wager(
  p_user_uuid uuid,
  p_currency text,
  p_wager bigint,
  p_payout bigint,
  p_rate integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp bigint;
  v_points bigint;
  v_race public.rorisk_races%rowtype;
  v_currency text := case when p_currency = 'coins' then 'coins' else 'rocoins' end;
begin
  if p_user_uuid is null or coalesce(p_wager, 0) <= 0 then
    return;
  end if;
  if not exists (select 1 from public.rorisk_users where uuid = p_user_uuid) then
    return;
  end if;

  v_xp := greatest(1, floor(p_wager::numeric * greatest(0, coalesce(p_rate, 0))));
  v_points := greatest(1, floor((case when v_currency = 'coins' then p_wager * 5 else p_wager end)::numeric / 1000));

  if v_currency = 'coins' then
    update public.rorisk_users
    set total_bets = total_bets + 1,
        total_wagered_coins = total_wagered_coins + p_wager,
        total_won_coins = total_won_coins + greatest(0, coalesce(p_payout, 0)),
        xp = xp + v_xp,
        level = public.rorisk_level_for_xp(xp + v_xp)
    where uuid = p_user_uuid;
  else
    update public.rorisk_users
    set total_bets = total_bets + 1,
        total_wagered_rocoins = total_wagered_rocoins + p_wager,
        total_won_rocoins = total_won_rocoins + greatest(0, coalesce(p_payout, 0)),
        xp = xp + v_xp,
        level = public.rorisk_level_for_xp(xp + v_xp)
    where uuid = p_user_uuid;
  end if;

  perform public.credit_rorisk_affiliate_wager(p_user_uuid, v_currency, p_wager);

  v_race := public.ensure_rorisk_race();
  insert into public.rorisk_race_entries (race_id, user_uuid, points)
  values (v_race.id, p_user_uuid, v_points)
  on conflict (race_id, user_uuid) do update
  set points = public.rorisk_race_entries.points + excluded.points,
      updated_at = now();
end;
$$;

create or replace function public.credit_rorisk_affiliate_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_earnings bigint;
begin
  if new.credited is not true or (tg_op = 'UPDATE' and old.credited is true) then
    return new;
  end if;
  insert into public.rorisk_affiliates (user_uuid, total_deposited)
  values (new.user_uuid, new.coin_amount)
  on conflict (user_uuid) do update
  set total_deposited = rorisk_affiliates.total_deposited + excluded.total_deposited,
      updated_at = now();
  select referrer_user_uuid into v_referrer from public.rorisk_affiliates where user_uuid = new.user_uuid;
  if v_referrer is not null then
    v_earnings := greatest(0, floor(new.coin_amount * 0.02));
    insert into public.rorisk_affiliates (user_uuid, total_earnings, available_earnings)
    values (v_referrer, v_earnings, v_earnings)
    on conflict (user_uuid) do update
    set total_earnings = rorisk_affiliates.total_earnings + excluded.total_earnings,
        available_earnings = rorisk_affiliates.available_earnings + excluded.available_earnings,
        updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.credit_rorisk_affiliate_wager(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.credit_rorisk_affiliate_wager(uuid, text, bigint) to service_role;

revoke all on function public.credit_rorisk_affiliate_deposit() from public, anon, authenticated;
