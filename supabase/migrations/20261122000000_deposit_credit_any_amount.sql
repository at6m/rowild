-- Crypto deposits accept any amount.
--
-- The cashier no longer asks the player for an amount: it shows an address and
-- credits whatever arrives at the site rate (100 Coins = $1.00). The provider
-- still needs an invoice amount, but it is only a reference, so the credit is no
-- longer capped at it: a $25 send against a $10 reference credits 2,500 Coins
-- and a $1 send credits 100. Replays, stale polls and top-ups stay idempotent
-- because the target is recomputed from the monotonic received amount and only
-- the difference is added to the balance.

create or replace function public.finalize_rorisk_crypto_deposit(
  p_order_uuid uuid,
  p_track_id text,
  p_status text,
  p_payload jsonb,
  p_received_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit public.rorisk_crypto_deposits%rowtype;
  v_user public.rorisk_users%rowtype;
  v_status text := lower(coalesce(p_status, ''));
  v_received numeric(36, 18);
  v_expected numeric(36, 18);
  v_target bigint;
  v_delta bigint;
begin
  select * into v_deposit from public.rorisk_crypto_deposits
  where (p_order_uuid is not null and uuid = p_order_uuid)
     or (coalesce(p_track_id, '') <> '' and track_id = p_track_id)
  order by case when p_order_uuid is not null and uuid = p_order_uuid then 0 else 1 end
  limit 1
  for update;
  if not found then raise exception 'Payment record not found.'; end if;

  -- Monotonic: a stale poll that reports less than we already know never lowers it.
  v_received := greatest(
    coalesce(v_deposit.received_amount, 0),
    greatest(0, coalesce(p_received_amount, 0))
  );
  v_expected := coalesce(v_deposit.pay_amount, 0);

  if v_status in ('failed', 'refunded') then
    -- The money went back: nothing new is owed.
    v_target := coalesce(v_deposit.credited_coins, 0);
  elsif v_expected > 0 then
    -- Uncapped: every coin that arrived is worth its share of the reference.
    v_target := greatest(
      coalesce(v_deposit.credited_coins, 0),
      floor(v_deposit.coin_amount::numeric * (v_received / v_expected))::bigint
    );
  else
    v_target := coalesce(v_deposit.credited_coins, 0);
  end if;

  v_delta := greatest(0, v_target - coalesce(v_deposit.credited_coins, 0));

  update public.rorisk_crypto_deposits
  set track_id = coalesce(track_id, nullif(p_track_id, '')),
      status = v_status,
      provider_payload = coalesce(p_payload, '{}'::jsonb),
      received_amount = v_received,
      credited_coins = v_target,
      last_payment_status = nullif(v_status, ''),
      credited = v_target >= coin_amount,
      paid_at = case when v_delta > 0 and paid_at is null then now() else paid_at end,
      updated_at = now()
  where uuid = v_deposit.uuid
  returning * into v_deposit;

  if v_delta > 0 then
    update public.rorisk_users
    set coins = coalesce(coins, 0) + v_delta,
        total_deposited_coins = total_deposited_coins + v_delta
    where uuid = v_deposit.user_uuid
    returning * into v_user;
  end if;

  return jsonb_build_object(
    'deposit', to_jsonb(v_deposit),
    'user', to_jsonb(v_user),
    'credited_coins', v_delta
  );
end;
$$;

revoke all on function public.finalize_rorisk_crypto_deposit(uuid, text, text, jsonb, numeric)
  from public, anon, authenticated;
grant execute on function public.finalize_rorisk_crypto_deposit(uuid, text, text, jsonb, numeric)
  to service_role;
