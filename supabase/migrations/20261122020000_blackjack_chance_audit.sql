-- Blackjack was the one game whose chance override was used but never written
-- to the game row. Record it the same way the other RPCs do so the admin
-- overview and hand history can tell a forced round from a natural one.

create or replace function public.start_rorisk_blackjack(
  p_user_uuid uuid,
  p_amount bigint,
  p_currency text,
  p_state text,
  p_active_hand text,
  p_dealer_cards jsonb,
  p_player_cards jsonb,
  p_deck jsonb,
  p_deck_position integer,
  p_outcomes jsonb,
  p_payout bigint,
  p_client_seed text,
  p_server_seed text,
  p_server_seed_hash text,
  p_nonce bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.rorisk_users%rowtype;
  v_game public.rorisk_blackjack_games%rowtype;
  v_rtp numeric;
  v_payout bigint;
  v_chance numeric;
begin
  if p_currency not in ('coins', 'rocoins') then raise exception 'The selected currency is invalid.'; end if;
  if p_amount < 50 or p_amount > 500000 then raise exception 'Your entered bet amount is invalid.'; end if;
  if p_state not in ('insurance', 'playing', 'completed') then raise exception 'The blackjack state is invalid.'; end if;
  if jsonb_typeof(p_deck) <> 'array' or jsonb_array_length(p_deck) <> 52 then raise exception 'The blackjack deck is invalid.'; end if;
  if encode(digest(p_server_seed, 'sha256'), 'hex') <> p_server_seed_hash then raise exception 'The blackjack seed is invalid.'; end if;

  select * into v_user from public.rorisk_users where uuid = p_user_uuid for update;
  if not found then raise exception 'Please sign in to perform this action.'; end if;
  if exists (select 1 from public.rorisk_blackjack_games where user_uuid = p_user_uuid and state <> 'completed') then
    raise exception 'You already have a running blackjack game.';
  end if;
  if (case when p_currency = 'coins' then coalesce(v_user.coins, 0) else coalesce(v_user.rocoins, 0) end) < p_amount then
    raise exception 'Insufficient balance.';
  end if;

  v_rtp := public.rorisk_rtp_effective(p_user_uuid, 'blackjack');
  v_chance := public.rorisk_chance_effective(p_user_uuid, 'blackjack');
  v_payout := public.rorisk_scale_payout(p_payout, v_rtp, 99.5);

  if p_currency = 'coins' then
    update public.rorisk_users set coins = coalesce(coins, 0) - p_amount + v_payout where uuid = p_user_uuid returning * into v_user;
  else
    update public.rorisk_users set rocoins = coalesce(rocoins, 0) - p_amount + v_payout where uuid = p_user_uuid returning * into v_user;
  end if;

  insert into public.rorisk_blackjack_games (
    user_uuid, roblox_id, username, avatar_headshot, currency, bet_amount, wager_amount, payout_amount,
    multiplier, state, active_hand, dealer_cards, player_cards, deck, deck_position, outcomes, won,
    client_seed, server_seed_hash, server_seed, nonce, completed_at, rtp_percent, chance_percent
  ) values (
    v_user.uuid, v_user.roblox_id, v_user.username, v_user.avatar_headshot, p_currency, p_amount, p_amount, v_payout,
    case when p_amount > 0 then v_payout::numeric / p_amount else 0 end, p_state, p_active_hand,
    p_dealer_cards, p_player_cards, p_deck, p_deck_position, coalesce(p_outcomes, '{}'::jsonb), v_payout >= p_amount and v_payout > 0,
    left(coalesce(p_client_seed, p_user_uuid::text), 128), p_server_seed_hash, p_server_seed, p_nonce,
    case when p_state = 'completed' then now() else null end, v_rtp, v_chance
  ) returning * into v_game;

  return jsonb_build_object('game', to_jsonb(v_game), 'user', to_jsonb(v_user));
end;
$$;

revoke all on function public.start_rorisk_blackjack(uuid, bigint, text, text, text, jsonb, jsonb, jsonb, integer, jsonb, bigint, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.start_rorisk_blackjack(uuid, bigint, text, text, text, jsonb, jsonb, jsonb, integer, jsonb, bigint, text, text, text, bigint) to service_role;
