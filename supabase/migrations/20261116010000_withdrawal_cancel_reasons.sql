-- Admins must say why a withdrawal was canceled, and players must be able to see
-- that reason in their transaction history.

alter table public.rorisk_crypto_withdrawals
  add column if not exists cancel_reason text;
alter table public.rorisk_robux_withdrawals
  add column if not exists cancel_reason text;

drop function if exists public.finalize_rorisk_crypto_withdrawal(uuid, text, text, jsonb);

create or replace function public.finalize_rorisk_crypto_withdrawal(
  p_uuid uuid,
  p_track_id text,
  p_status text,
  p_payload jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal public.rorisk_crypto_withdrawals%rowtype;
  v_user public.rorisk_users%rowtype;
  v_status text := lower(coalesce(p_status, ''));
begin
  select * into v_withdrawal from public.rorisk_crypto_withdrawals
  where (p_uuid is not null and uuid = p_uuid)
     or (coalesce(p_track_id, '') <> '' and track_id = p_track_id)
  order by case when p_uuid is not null and uuid = p_uuid then 0 else 1 end
  limit 1
  for update;
  if not found then raise exception 'Withdrawal record not found.'; end if;

  update public.rorisk_crypto_withdrawals
  set track_id = coalesce(track_id, nullif(p_track_id, '')),
      status = v_status,
      provider_payload = coalesce(p_payload, '{}'::jsonb),
      cancel_reason = case
        when v_status in ('failed', 'rejected') then coalesce(nullif(p_reason, ''), cancel_reason)
        else cancel_reason
      end,
      updated_at = now(),
      completed_at = case when v_status in ('confirmed', 'complete', 'failed', 'rejected') then now() else completed_at end
  where uuid = v_withdrawal.uuid
  returning * into v_withdrawal;

  if v_status in ('failed', 'rejected') and not v_withdrawal.refunded then
    update public.rorisk_crypto_withdrawals
    set refunded = true, updated_at = now()
    where uuid = v_withdrawal.uuid and refunded = false
    returning * into v_withdrawal;

    if found then
      update public.rorisk_users
      set coins = coalesce(coins, 0) + v_withdrawal.coin_amount,
          total_withdrawn_coins = greatest(0, total_withdrawn_coins - v_withdrawal.coin_amount)
      where uuid = v_withdrawal.user_uuid
      returning * into v_user;
    end if;
  end if;

  return jsonb_build_object('withdrawal', to_jsonb(v_withdrawal), 'user', to_jsonb(v_user));
end;
$$;

drop function if exists public.finalize_rorisk_robux_withdrawal(uuid, text, text);

create or replace function public.finalize_rorisk_robux_withdrawal(
  p_uuid uuid,
  p_status text,
  p_note text,
  p_reason text default null
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
      cancel_reason = case
        when v_status = 'canceled' then coalesce(nullif(p_reason, ''), nullif(p_note, ''), cancel_reason)
        else cancel_reason
      end,
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

revoke all on function public.finalize_rorisk_crypto_withdrawal(uuid, text, text, jsonb, text),
  public.finalize_rorisk_robux_withdrawal(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_rorisk_crypto_withdrawal(uuid, text, text, jsonb, text),
  public.finalize_rorisk_robux_withdrawal(uuid, text, text, text)
  to service_role;
