-- Per-player win chance (test tool).
--
-- 50% is the game's own RNG and the inert default: no row, a null value or an
-- explicit 50 all leave the outcome untouched. Below 50 turns that fraction of
-- the player's natural wins into losses (0 = always lose); above 50 turns that
-- fraction of natural losses into wins (100 = always win). RTP stays separate:
-- chance picks the outcome, RTP scales whatever payout follows.

create table if not exists public.rorisk_chance_settings (
  user_uuid uuid not null references public.rorisk_users(uuid) on delete cascade,
  game text not null default 'all' check (game ~ '^[a-z0-9_]{1,32}$'),
  chance_percent numeric(6, 2) check (chance_percent is null or (chance_percent >= 0 and chance_percent <= 100)),
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_uuid, game)
);

create index if not exists rorisk_chance_settings_user_idx on public.rorisk_chance_settings (user_uuid);

alter table public.rorisk_chance_settings enable row level security;
revoke all on table public.rorisk_chance_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.rorisk_chance_settings to service_role;

create or replace function public.touch_rorisk_chance_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rorisk_chance_settings_touch on public.rorisk_chance_settings;
create trigger rorisk_chance_settings_touch
before insert or update on public.rorisk_chance_settings
for each row execute function public.touch_rorisk_chance_settings();

revoke all on function public.touch_rorisk_chance_settings() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rorisk_chance_settings'
    ) then
      execute 'alter publication supabase_realtime add table public.rorisk_chance_settings';
    end if;
  end if;
exception when others then
  null;
end;
$$;

create or replace function public.rorisk_chance_effective(p_user_uuid uuid, p_game text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_percent numeric;
  v_found boolean := false;
begin
  if p_user_uuid is null then return null; end if;
  select settings.chance_percent into v_percent
  from public.rorisk_chance_settings as settings
  where settings.user_uuid = p_user_uuid and settings.game = p_game
  limit 1;
  v_found := found;
  if not v_found then
    select settings.chance_percent into v_percent
    from public.rorisk_chance_settings as settings
    where settings.user_uuid = p_user_uuid and settings.game = 'all'
    limit 1;
    v_found := found;
  end if;
  if not coalesce(v_found, false) or v_percent is null then return null; end if;
  return least(100, greatest(0, v_percent));
end;
$$;

-- `p_ticket` is a uniform 0-1 draw from the round's own seed material.
create or replace function public.rorisk_chance_forced(p_natural_win boolean, p_chance numeric, p_ticket numeric)
returns boolean
language sql
immutable
as $$
  select case
    when p_natural_win is null then null
    when p_chance is null or p_chance = 50 then p_natural_win
    when p_chance <= 0 then false
    when p_chance >= 100 then true
    when p_chance < 50 then p_natural_win and coalesce(p_ticket, 0) >= (1 - p_chance / 50)
    else p_natural_win or coalesce(p_ticket, 0) < ((p_chance - 50) / 50)
  end
$$;

revoke all on function public.rorisk_chance_effective(uuid, text) from public, anon, authenticated;
revoke all on function public.rorisk_chance_forced(boolean, numeric, numeric) from public, anon, authenticated;
grant execute on function public.rorisk_chance_effective(uuid, text) to service_role;
grant execute on function public.rorisk_chance_forced(boolean, numeric, numeric) to service_role;

alter table public.rorisk_dice_games add column if not exists chance_percent numeric(6, 2);
alter table public.rorisk_mines_games add column if not exists chance_percent numeric(6, 2);
alter table public.rorisk_blackjack_games add column if not exists chance_percent numeric(6, 2);
alter table public.rorisk_coinflip_games add column if not exists chance_percent numeric(6, 2);
alter table public.rorisk_case_openings add column if not exists chance_percent numeric(6, 2);
alter table public.rorisk_upgrader_games add column if not exists chance_percent numeric(6, 2);

create or replace function public.play_rorisk_dice(
  p_user_uuid uuid,
  p_amount bigint,
  p_currency text,
  p_mode text,
  p_target_low integer,
  p_target_high integer,
  p_client_seed text,
  p_server_seed text,
  p_server_seed_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.rorisk_users%rowtype;
  v_game public.rorisk_dice_games%rowtype;
  v_nonce bigint;
  v_hash text;
  v_roll integer;
  v_win_tickets integer;
  v_chance numeric;
  v_multiplier numeric;
  v_won boolean;
  v_payout bigint;
  v_balance bigint;
  v_rtp numeric;
  v_luck numeric;
  v_ticket numeric;
  v_natural_won boolean;
begin
  if p_currency not in ('coins', 'rocoins') then raise exception 'The selected currency is invalid.'; end if;
  if p_mode not in ('under', 'over', 'inside', 'outside') then raise exception 'The selected range type is invalid.'; end if;
  if p_amount < 50 then raise exception 'Minimum bet is 50 Coins.'; end if;
  if p_amount > 500000 then raise exception 'Maximum bet is 500,000 Coins.'; end if;
  if p_target_low not between 0 and 9999 or p_target_high not between 0 and 9999 then raise exception 'The selected roll range is invalid.'; end if;
  if encode(digest(p_server_seed, 'sha256'), 'hex') <> p_server_seed_hash then raise exception 'The dice seed is invalid.'; end if;

  v_win_tickets := case p_mode when 'under' then p_target_low when 'over' then 9999 - p_target_low when 'inside' then p_target_high - p_target_low + 1 else p_target_low + (9999 - p_target_high) end;
  if v_win_tickets not between 100 and 9300 then raise exception 'The selected win chance is invalid.'; end if;
  if p_mode in ('inside', 'outside') and p_target_high <= p_target_low then raise exception 'The selected roll range is invalid.'; end if;

  select * into v_user from public.rorisk_users where uuid = p_user_uuid for update;
  if not found then raise exception 'Please sign in to perform this action.'; end if;
  v_balance := case when p_currency = 'coins' then coalesce(v_user.coins, 0) else coalesce(v_user.rocoins, 0) end;
  if v_balance < p_amount then raise exception 'Insufficient balance.'; end if;

  select coalesce(max(nonce) + 1, 0) into v_nonce from public.rorisk_dice_games where user_uuid = p_user_uuid;
  v_hash := encode(digest(p_server_seed || ':' || p_client_seed || ':' || v_nonce::text, 'sha256'), 'hex');
  v_roll := floor(((('x' || substr(v_hash, 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric) * 10000)::integer;
  v_chance := round((v_win_tickets::numeric / 100), 4);
  v_multiplier := floor((0.95::numeric * 10000 / v_win_tickets) * 10000) / 10000;
  v_won := case p_mode when 'under' then v_roll < p_target_low when 'over' then v_roll > p_target_low when 'inside' then v_roll between p_target_low and p_target_high else v_roll < p_target_low or v_roll > p_target_high end;

  -- Win chance (50 = untouched). A forced flip also rewrites the displayed roll
  -- so the number the player sees agrees with the outcome.
  v_luck := public.rorisk_chance_effective(p_user_uuid, 'dice');
  if v_luck is not null and v_luck <> 50 then
    v_natural_won := v_won;
    v_ticket := (('x' || substr(encode(digest(v_hash || ':chance', 'sha256'), 'hex'), 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric;
    v_won := public.rorisk_chance_forced(v_natural_won, v_luck, v_ticket);
    if v_won is distinct from v_natural_won then
      v_roll := case
        when v_won then case p_mode
          when 'under' then least(p_target_low - 1, floor(v_ticket * p_target_low)::integer)
          when 'over' then greatest(p_target_low + 1, 9999 - floor(v_ticket * (9999 - p_target_low))::integer)
          when 'inside' then least(p_target_high, p_target_low + floor(v_ticket * (p_target_high - p_target_low + 1))::integer)
          else case when v_ticket < 0.5
            then floor(v_ticket * 2 * p_target_low)::integer
            else least(9999, p_target_high + 1 + floor((v_ticket - 0.5) * 2 * (9999 - p_target_high))::integer) end
        end
        else case p_mode
          when 'under' then least(9999, p_target_low + floor(v_ticket * (9999 - p_target_low))::integer)
          when 'over' then least(p_target_low, floor(v_ticket * (p_target_low + 1))::integer)
          when 'inside' then case when v_ticket < 0.5
            then floor(v_ticket * 2 * p_target_low)::integer
            else least(9999, p_target_high + 1 + floor((v_ticket - 0.5) * 2 * (9999 - p_target_high))::integer) end
          else least(p_target_high, p_target_low + floor(v_ticket * (p_target_high - p_target_low + 1))::integer)
        end
      end;
      v_roll := greatest(0, least(9999, v_roll));
    end if;
  end if;

  v_payout := case when v_won then floor(p_amount * v_multiplier)::bigint else 0 end;
  v_rtp := public.rorisk_rtp_effective(p_user_uuid, 'dice');
  v_payout := public.rorisk_scale_payout(v_payout, v_rtp, 95);

  if p_currency = 'coins' then
    update public.rorisk_users set coins = coins - p_amount + v_payout where uuid = p_user_uuid returning * into v_user;
  else
    update public.rorisk_users set rocoins = rocoins - p_amount + v_payout where uuid = p_user_uuid returning * into v_user;
  end if;
  insert into public.rorisk_dice_games (user_uuid, roblox_id, username, avatar_headshot, currency, bet_amount, mode, target_low, target_high, roll, win_chance, multiplier, won, payout_amount, client_seed, server_seed_hash, server_seed, nonce, rtp_percent, chance_percent)
  values (v_user.uuid, v_user.roblox_id, v_user.username, v_user.avatar_headshot, p_currency, p_amount, p_mode, p_target_low, p_target_high, v_roll, v_chance, v_multiplier, v_won, v_payout, p_client_seed, p_server_seed_hash, p_server_seed, v_nonce, v_rtp, v_luck)
  returning * into v_game;
  return jsonb_build_object('game', to_jsonb(v_game), 'user', to_jsonb(v_user));
end;
$$;


create or replace function public.reveal_rorisk_mines(
  p_game_uuid uuid,
  p_user_uuid uuid,
  p_tile integer
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.rorisk_users%rowtype;
  v_game public.rorisk_mines_games%rowtype;
  v_is_mine boolean;
  v_reveals integer;
  v_multiplier numeric;
  v_payout bigint := 0;
  v_luck numeric;
  v_ticket numeric;
  v_natural_mine boolean;
begin
  if p_tile not between 0 and 24 then raise exception 'The selected tile is invalid.'; end if;
  select * into v_game from public.rorisk_mines_games where uuid = p_game_uuid for update;
  if not found or v_game.user_uuid <> p_user_uuid then raise exception 'You have no running mines game at the moment.'; end if;
  if v_game.state not in ('created', 'running') then raise exception 'You have no running mines game at the moment.'; end if;
  if exists (select 1 from jsonb_array_elements(v_game.revealed) as element(value) where (value ->> 'tile')::integer = p_tile) then
    raise exception 'This tile has already been revealed.';
  end if;
  v_is_mine := coalesce(v_game.deck ->> p_tile, 'coin') = 'mine';

  -- Win chance (50 = untouched): a mine can surface as a coin or the other way
  -- round, and the stored deck is patched so the finished board stays coherent.
  v_luck := public.rorisk_chance_effective(p_user_uuid, 'mines');
  if v_luck is not null and v_luck <> 50 then
    v_natural_mine := v_is_mine;
    v_ticket := (('x' || substr(encode(digest(v_game.server_seed || ':' || p_tile::text || ':chance', 'sha256'), 'hex'), 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric;
    v_is_mine := not public.rorisk_chance_forced(not v_natural_mine, v_luck, v_ticket);
    if v_is_mine is distinct from v_natural_mine then
      update public.rorisk_mines_games
      set deck = jsonb_set(deck, array[p_tile::text], to_jsonb(case when v_is_mine then 'mine' else 'coin' end), false),
          chance_percent = coalesce(chance_percent, v_luck),
          updated_at = now()
      where uuid = p_game_uuid
      returning * into v_game;
    end if;
  end if;

  if v_is_mine then
    update public.rorisk_mines_games
    set revealed = revealed || jsonb_build_array(jsonb_build_object('tile', p_tile, 'value', 'mine')), state = 'completed', won = false,
        payout_amount = 0, completed_at = now(), updated_at = now()
    where uuid = p_game_uuid returning * into v_game;
  else
    v_reveals := jsonb_array_length(v_game.revealed) + 1;
    v_multiplier := public.rorisk_mines_multiplier(v_reveals, v_game.mines_count::integer);
    if v_reveals = 25 - v_game.mines_count then
      v_payout := public.rorisk_scale_payout(floor(v_game.bet_amount * v_multiplier)::bigint, v_game.rtp_percent, 90);
      if v_game.currency = 'coins' then
        update public.rorisk_users set coins = coalesce(coins, 0) + v_payout where uuid = p_user_uuid returning * into v_user;
      else
        update public.rorisk_users set rocoins = coalesce(rocoins, 0) + v_payout where uuid = p_user_uuid returning * into v_user;
      end if;
      update public.rorisk_mines_games
      set revealed = revealed || jsonb_build_array(jsonb_build_object('tile', p_tile, 'value', 'coin')), state = 'completed', multiplier = v_multiplier,
          won = true, payout_amount = v_payout, completed_at = now(), updated_at = now()
      where uuid = p_game_uuid returning * into v_game;
    else
      update public.rorisk_mines_games
      set revealed = revealed || jsonb_build_array(jsonb_build_object('tile', p_tile, 'value', 'coin')), state = 'running', multiplier = v_multiplier, updated_at = now()
      where uuid = p_game_uuid returning * into v_game;
    end if;
  end if;

  if v_user.uuid is null then select * into v_user from public.rorisk_users where uuid = p_user_uuid; end if;
  return jsonb_build_object('game', case when v_game.state = 'completed' then to_jsonb(v_game) else to_jsonb(v_game) - 'deck' - 'server_seed' end, 'user', to_jsonb(v_user), 'mine', v_is_mine);
end;
$$;


create or replace function public.join_rorisk_coinflip(
  p_game_uuid uuid,
  p_user_uuid uuid,
  p_bot boolean,
  p_eos_block_id text,
  p_eos_block_number bigint,
  p_ticket integer
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.rorisk_users%rowtype;
  v_creator public.rorisk_users%rowtype;
  v_winner public.rorisk_users%rowtype;
  v_game public.rorisk_coinflip_games%rowtype;
  v_join_coin text;
  v_winning_coin text;
  v_winner_uuid uuid;
  v_payout bigint;
  v_balance bigint;
  v_rtp numeric;
  v_creator_chance numeric;
  v_joiner_chance numeric;
  v_creator_bias numeric;
  v_joiner_bias numeric;
  v_creator_won boolean;
  v_ticket numeric;
begin
  select * into v_game from public.rorisk_coinflip_games where uuid = p_game_uuid for update;
  if not found then raise exception 'This coinflip game could not be found.'; end if;
  if v_game.state <> 'created' or v_game.opponent_uuid is not null or v_game.opponent_is_bot then
    if p_bot then raise exception 'This game is no longer available.';
    else raise exception 'This game is no longer available for joining.';
    end if;
  end if;
  if encode(digest(v_game.server_seed, 'sha256'), 'hex') <> v_game.server_seed_hash then raise exception 'The coinflip seed is invalid.'; end if;
  if p_eos_block_id !~ '^[a-f0-9]{64}$' or p_eos_block_number < 1 or p_ticket not between 0 and 999999 then raise exception 'The EOS fairness data is invalid.'; end if;
  v_join_coin := case when v_game.creator_coin = 'blue' then 'orange' else 'blue' end;

  select * into v_creator from public.rorisk_users where uuid = v_game.creator_uuid for update;
  if p_bot then
    if p_user_uuid <> v_game.creator_uuid then raise exception 'Only the game creator can call the bot.'; end if;
    v_user := v_creator;
  else
    if p_user_uuid = v_game.creator_uuid then raise exception 'You cannot join your own coinflip game.'; end if;
    select * into v_user from public.rorisk_users where uuid = p_user_uuid for update;
    if not found then raise exception 'Please sign in to perform this action.'; end if;
    v_balance := case when v_game.currency = 'coins' then coalesce(v_user.coins, 0) else coalesce(v_user.rocoins, 0) end;
    if v_balance < v_game.amount then raise exception 'Insufficient balance.'; end if;
    if v_game.currency = 'coins' then
      update public.rorisk_users set coins = coalesce(coins, 0) - v_game.amount where uuid = p_user_uuid returning * into v_user;
    else
      update public.rorisk_users set rocoins = coalesce(rocoins, 0) - v_game.amount where uuid = p_user_uuid returning * into v_user;
    end if;
  end if;

  v_winning_coin := case when p_ticket < 500000 then 'blue' else 'orange' end;

  -- Win chance: the value furthest from 50 decides the coin, so two adjusted
  -- players cannot both be forced and the creator wins ties.
  v_creator_chance := public.rorisk_chance_effective(v_game.creator_uuid, 'coinflip');
  v_joiner_chance := case when p_bot then null else public.rorisk_chance_effective(p_user_uuid, 'coinflip') end;
  v_creator_bias := abs(coalesce(v_creator_chance, 50) - 50);
  v_joiner_bias := abs(coalesce(v_joiner_chance, 50) - 50);
  if coalesce(v_creator_bias, 0) > 0 or coalesce(v_joiner_bias, 0) > 0 then
    v_creator_won := v_winning_coin = v_game.creator_coin;
    v_ticket := (('x' || substr(encode(digest(v_game.server_seed || ':' || p_ticket::text || ':chance', 'sha256'), 'hex'), 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric;
    if not p_bot and coalesce(v_joiner_bias, 0) > coalesce(v_creator_bias, 0) then
      v_creator_won := not public.rorisk_chance_forced(not v_creator_won, v_joiner_chance, v_ticket);
    else
      v_creator_won := public.rorisk_chance_forced(v_creator_won, v_creator_chance, v_ticket);
    end if;
    v_winning_coin := case when v_creator_won then v_game.creator_coin else v_join_coin end;
  end if;

  if v_winning_coin = v_game.creator_coin then v_winner_uuid := v_game.creator_uuid;
  elsif not p_bot then v_winner_uuid := p_user_uuid;
  else v_winner_uuid := null;
  end if;
  v_payout := floor(v_game.amount * 1.95)::bigint;
  v_rtp := public.rorisk_rtp_effective(v_winner_uuid, 'coinflip');
  v_payout := public.rorisk_scale_payout(v_payout, v_rtp, 97.5);

  if v_winner_uuid is not null then
    if v_game.currency = 'coins' then
      update public.rorisk_users set coins = coalesce(coins, 0) + v_payout where uuid = v_winner_uuid returning * into v_winner;
    else
      update public.rorisk_users set rocoins = coalesce(rocoins, 0) + v_payout where uuid = v_winner_uuid returning * into v_winner;
    end if;
  end if;

  update public.rorisk_coinflip_games
  set opponent_uuid = case when p_bot then null else v_user.uuid end,
      opponent_roblox_id = case when p_bot then null else v_user.roblox_id end,
      opponent_username = case when p_bot then 'Risk Bot' else v_user.username end,
      opponent_avatar_headshot = case when p_bot then '/api/casino-images/coinflip/bot.png' else v_user.avatar_headshot end,
      opponent_coin = v_join_coin,
      opponent_is_bot = p_bot,
      opponent_joined_at = now(),
      state = 'completed',
      winning_coin = v_winning_coin,
      winner_uuid = v_winner_uuid,
      winner_roblox_id = case when v_winner_uuid is null then null else v_winner.roblox_id end,
      winner_username = case when v_winner_uuid is null then 'Risk Bot' else v_winner.username end,
      winner_avatar_headshot = case when v_winner_uuid is null then '/api/casino-images/coinflip/bot.png' else v_winner.avatar_headshot end,
      winner_is_bot = v_winner_uuid is null,
      eos_block_id = p_eos_block_id,
      eos_block_number = p_eos_block_number,
      ticket = p_ticket,
      payout_amount = case when v_winner_uuid is null then 0 else v_payout end,
      rtp_percent = case when v_winner_uuid is null then null else v_rtp end,
      chance_percent = case when p_bot or coalesce(v_creator_bias, 0) >= coalesce(v_joiner_bias, 0) then v_creator_chance else v_joiner_chance end,
      started_at = now(),
      completed_at = now() + interval '5.5 seconds',
      updated_at = now()
  where uuid = p_game_uuid returning * into v_game;

  select * into v_user from public.rorisk_users where uuid = p_user_uuid;
  return jsonb_build_object('game', to_jsonb(v_game), 'user', to_jsonb(v_user));
end;
$$;


create or replace function public.open_rorisk_case(
  p_user_uuid uuid,
  p_case_id text,
  p_case_count integer,
  p_currency text,
  p_client_seed text,
  p_server_seed text,
  p_server_seed_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_case public.rorisk_cases%rowtype;
  v_user public.rorisk_users%rowtype;
  v_opening public.rorisk_case_openings%rowtype;
  v_items jsonb;
  v_item jsonb;
  v_selected jsonb;
  v_public_item jsonb;
  v_outcomes jsonb := '[]'::jsonb;
  v_hash text;
  v_roll numeric;
  v_cumulative numeric;
  v_chance numeric;
  v_nonce bigint;
  v_wager bigint;
  v_unit_wager bigint;
  v_payout bigint := 0;
  v_item_price bigint;
  v_index integer;
  v_case_ev numeric;
  v_default_rtp numeric;
  v_rtp numeric;
  v_luck numeric;
  v_ticket numeric;
  v_natural_win boolean;
  v_alt jsonb;
  v_alt_price bigint;
  v_alt_index integer;
  v_best_index integer := 0;
  v_best_value bigint := -1;
  v_worst_index integer := 0;
  v_worst_value bigint := null;
begin
  if p_case_count not between 1 and 4 then raise exception 'Select between 1 and 4 cases.'; end if;
  if p_currency not in ('coins', 'rocoins') then raise exception 'The selected currency is invalid.'; end if;
  if encode(digest(p_server_seed, 'sha256'), 'hex') <> p_server_seed_hash then raise exception 'The case seed is invalid.'; end if;

  select * into v_user from public.rorisk_users where uuid = p_user_uuid for update;
  if not found then raise exception 'Please sign in to perform this action.'; end if;
  select * into v_case from public.rorisk_cases where case_id = p_case_id and active = true;
  if not found then raise exception 'This case could not be found.'; end if;

  v_items := v_case.items;
  if jsonb_array_length(v_items) = 0 then raise exception 'This case has no available items.'; end if;
  v_unit_wager := case when p_currency = 'coins' then v_case.coin_amount else v_case.rocoin_amount end;
  v_wager := v_unit_wager * p_case_count;
  if (case when p_currency = 'coins' then coalesce(v_user.coins, 0) else coalesce(v_user.rocoins, 0) end) < v_wager then raise exception 'Insufficient balance.'; end if;

  -- The case's own RTP comes from its item table, so "default" stays exact even
  -- when an operator edits the case contents.
  select coalesce(sum(
    (coalesce(nullif(replace(value->>'chance', '%', ''), '')::numeric, 0) / 100) *
    greatest(0, case when p_currency = 'coins'
      then coalesce(nullif(value->>'coinPrice', '')::bigint, floor(coalesce(nullif(value->>'price', '')::bigint, 0)::numeric / 5)::bigint)
      else coalesce(nullif(value->>'rocoinPrice', '')::bigint, nullif(value->>'price', '')::bigint, 0)
    end)
  ), 0) into v_case_ev
  from jsonb_array_elements(v_items) as item(value);
  v_default_rtp := case when v_unit_wager > 0 then v_case_ev / v_unit_wager * 100 else 97 end;
  v_rtp := public.rorisk_rtp_effective(p_user_uuid, 'cases');

  select coalesce(max(nonce + case_count), 0) into v_nonce from public.rorisk_case_openings where user_uuid = p_user_uuid;
  for v_index in 0..p_case_count - 1 loop
    v_hash := encode(digest(p_server_seed || ':' || p_client_seed || ':' || (v_nonce + v_index)::text, 'sha256'), 'hex');
    v_roll := ((('x' || substr(v_hash, 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric) * 100;
    v_cumulative := 0;
    v_selected := null;
    for v_item in select value from jsonb_array_elements(v_items) loop
      v_chance := coalesce(nullif(replace(v_item->>'chance', '%', ''), '')::numeric, 0);
      v_cumulative := v_cumulative + v_chance;
      if v_roll <= v_cumulative then v_selected := v_item; exit; end if;
    end loop;
    if v_selected is null then v_selected := v_items->(jsonb_array_length(v_items) - 1); end if;
    v_item_price := greatest(0, case when p_currency = 'coins'
      then coalesce(nullif(v_selected->>'coinPrice', '')::bigint, floor(coalesce(nullif(v_selected->>'price', '')::bigint, 0)::numeric / 5)::bigint)
      else coalesce(nullif(v_selected->>'rocoinPrice', '')::bigint, nullif(v_selected->>'price', '')::bigint, 0)
    end);
    -- Win chance (50 = untouched): "win" means the item is worth at least the
    -- case price, and a forced flip swaps in the best or cheapest item.
    v_luck := public.rorisk_chance_effective(p_user_uuid, 'cases');
    if v_luck is not null and v_luck <> 50 then
      v_natural_win := v_item_price >= v_unit_wager;
      v_ticket := (('x' || substr(encode(digest(v_hash || ':chance', 'sha256'), 'hex'), 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric;
      if public.rorisk_chance_forced(v_natural_win, v_luck, v_ticket) is distinct from v_natural_win then
        v_best_index := 0;
        v_best_value := -1;
        v_worst_index := 0;
        v_worst_value := null;
        v_alt_index := 0;
        for v_alt in select value from jsonb_array_elements(v_items) loop
          v_alt_price := greatest(0, case when p_currency = 'coins'
            then coalesce(nullif(v_alt->>'coinPrice', '')::bigint, floor(coalesce(nullif(v_alt->>'price', '')::bigint, 0)::numeric / 5)::bigint)
            else coalesce(nullif(v_alt->>'rocoinPrice', '')::bigint, nullif(v_alt->>'price', '')::bigint, 0)
          end);
          if v_alt_price > v_best_value then v_best_value := v_alt_price; v_best_index := v_alt_index; end if;
          if v_worst_value is null or v_alt_price < v_worst_value then v_worst_value := v_alt_price; v_worst_index := v_alt_index; end if;
          v_alt_index := v_alt_index + 1;
        end loop;
        v_selected := v_items->(case when v_natural_win then v_worst_index else v_best_index end);
        v_item_price := greatest(0, case when p_currency = 'coins'
          then coalesce(nullif(v_selected->>'coinPrice', '')::bigint, floor(coalesce(nullif(v_selected->>'price', '')::bigint, 0)::numeric / 5)::bigint)
          else coalesce(nullif(v_selected->>'rocoinPrice', '')::bigint, nullif(v_selected->>'price', '')::bigint, 0)
        end);
      end if;
    end if;

    v_public_item := v_selected || jsonb_build_object('price', v_item_price, 'coinPrice', coalesce(nullif(v_selected->>'coinPrice', '')::bigint, floor(v_item_price::numeric / case when p_currency = 'coins' then 1 else 5 end)::bigint), 'rocoinPrice', coalesce(nullif(v_selected->>'rocoinPrice', '')::bigint, v_item_price * case when p_currency = 'coins' then 5 else 1 end));
    v_payout := v_payout + v_item_price;
    v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object('outcome', round(v_roll, 6), 'item', v_public_item));
  end loop;

  v_payout := public.rorisk_scale_payout(v_payout, v_rtp, v_default_rtp);

  if p_currency = 'coins' then
    update public.rorisk_users set coins = coalesce(coins, 0) - v_wager + v_payout where uuid = p_user_uuid returning * into v_user;
  else
    update public.rorisk_users set rocoins = coalesce(rocoins, 0) - v_wager + v_payout where uuid = p_user_uuid returning * into v_user;
  end if;
  insert into public.rorisk_case_openings (
    user_uuid, roblox_id, username, avatar_headshot, case_uuid, case_id, case_name, currency, case_count, wager_amount,
    payout_amount, outcomes, client_seed, server_seed_hash, server_seed, nonce, status, completed_at, rtp_percent, chance_percent
  ) values (
    p_user_uuid, v_user.roblox_id, v_user.username, v_user.avatar_headshot, v_case.uuid, v_case.case_id, v_case.name, p_currency, p_case_count, v_wager,
    v_payout, v_outcomes, p_client_seed, p_server_seed_hash, p_server_seed, v_nonce, 'completed', now(), v_rtp, v_luck
  ) returning * into v_opening;
  return jsonb_build_object('opening', to_jsonb(v_opening), 'user', to_jsonb(v_user));
end;
$$;


create or replace function public.play_rorisk_upgrader(
  p_user_uuid uuid,
  p_amount bigint,
  p_currency text,
  p_target_asset_id bigint,
  p_target_name text,
  p_target_image text,
  p_target_value bigint,
  p_mode text,
  p_range_start integer,
  p_client_seed text,
  p_server_seed text,
  p_server_seed_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.rorisk_users%rowtype;
  v_game public.rorisk_upgrader_games%rowtype;
  v_balance bigint;
  v_multiplier_bps integer;
  v_threshold integer;
  v_nonce bigint;
  v_hash text;
  v_outcome integer;
  v_offset integer;
  v_won boolean;
  v_payout bigint;
  v_rtp numeric;
  v_luck numeric;
  v_ticket numeric;
begin
  if p_currency not in ('coins', 'rocoins') then raise exception 'The selected currency is invalid.'; end if;
  if p_mode not in ('under', 'over') then raise exception 'The selected game mode is invalid.'; end if;
  if p_amount < 50 then raise exception 'You can only bet a min amount of 50 Coins per game.'; end if;
  if p_amount > 500000 then raise exception 'You can only bet a max amount of 500,000 Coins per game.'; end if;
  if p_target_asset_id < 1 or p_target_value < 1 or length(trim(coalesce(p_target_name, ''))) < 1 then raise exception 'The selected item is invalid.'; end if;
  if p_range_start not between 0 and 99999 then raise exception 'The selected ticket range is invalid.'; end if;
  if encode(digest(p_server_seed, 'sha256'), 'hex') <> p_server_seed_hash then raise exception 'The upgrader seed is invalid.'; end if;

  v_multiplier_bps := floor(p_target_value::numeric / p_amount::numeric * 100)::integer;
  if v_multiplier_bps not between 101 and 10000 then raise exception 'Payout must be 1.01x - 100x your bet. Bet more or pick a lower-value item.'; end if;
  v_threshold := floor(9000000::numeric / v_multiplier_bps)::integer;
  if v_threshold not between 1 and 99999 then raise exception 'The selected win chance is invalid.'; end if;

  select * into v_user from public.rorisk_users where uuid = p_user_uuid for update;
  if not found then raise exception 'Please sign in to perform this action.'; end if;
  v_balance := case when p_currency = 'coins' then coalesce(v_user.coins, 0) else coalesce(v_user.rocoins, 0) end;
  if v_balance < p_amount then raise exception 'Insufficient balance.'; end if;

  select coalesce(max(nonce) + 1, 0) into v_nonce from public.rorisk_upgrader_games where user_uuid = p_user_uuid;
  v_hash := encode(digest(p_server_seed || ':' || left(coalesce(p_client_seed, p_user_uuid::text), 128) || ':' || v_nonce::text, 'sha256'), 'hex');
  v_outcome := floor(((('x' || substr(v_hash, 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric) * 100000)::integer;
  v_offset := ((v_outcome - p_range_start) % 100000 + 100000) % 100000;
  v_won := v_offset < v_threshold;

  -- Win chance (50 = untouched): a forced flip moves the outcome inside or
  -- outside the win threshold and keeps the shown result consistent.
  v_luck := public.rorisk_chance_effective(p_user_uuid, 'upgrader');
  if v_luck is not null and v_luck <> 50 then
    v_ticket := (('x' || substr(encode(digest(v_hash || ':chance', 'sha256'), 'hex'), 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric;
    if public.rorisk_chance_forced(v_won, v_luck, v_ticket) is distinct from v_won then
      v_won := not v_won;
      v_offset := case when v_won
        then least(v_threshold - 1, floor(v_ticket * v_threshold)::integer)
        else v_threshold + floor(v_ticket * (100000 - v_threshold))::integer end;
      v_offset := greatest(0, least(99999, v_offset));
      v_outcome := ((p_range_start + v_offset) % 100000 + 100000) % 100000;
    end if;
  end if;
  v_payout := case when v_won then p_target_value else 0 end;
  v_rtp := public.rorisk_rtp_effective(p_user_uuid, 'upgrader');
  v_payout := public.rorisk_scale_payout(v_payout, v_rtp, 90);

  if p_currency = 'coins' then
    update public.rorisk_users set coins = coalesce(coins, 0) - p_amount + v_payout where uuid = p_user_uuid returning * into v_user;
  else
    update public.rorisk_users set rocoins = coalesce(rocoins, 0) - p_amount + v_payout where uuid = p_user_uuid returning * into v_user;
  end if;

  insert into public.rorisk_upgrader_games (
    user_uuid, roblox_id, username, avatar_headshot, currency, bet_amount, target_asset_id, target_name,
    target_image, target_value, multiplier_bps, mode, range_start, win_threshold, outcome, won, payout_amount,
    client_seed, server_seed_hash, server_seed, nonce, rtp_percent, chance_percent
  ) values (
    v_user.uuid, v_user.roblox_id, v_user.username, v_user.avatar_headshot, p_currency, p_amount, p_target_asset_id,
    left(p_target_name, 200), left(p_target_image, 500), p_target_value, v_multiplier_bps, p_mode, p_range_start,
    v_threshold, v_outcome, v_won, v_payout, left(coalesce(p_client_seed, p_user_uuid::text), 128),
    p_server_seed_hash, p_server_seed, v_nonce, v_rtp, v_luck
  ) returning * into v_game;

  return jsonb_build_object('game', to_jsonb(v_game), 'user', to_jsonb(v_user));
end;
$$;


create or replace function public.place_rorisk_roulette_bet(
  p_game_uuid uuid,
  p_user_uuid uuid,
  p_amount bigint,
  p_currency text,
  p_target_multiplier_bps integer
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game public.rorisk_roulette_games%rowtype;
  v_user public.rorisk_users%rowtype;
  v_balance bigint;
  v_bet jsonb;
  v_rtp numeric;
begin
  if p_currency not in ('coins', 'rocoins') then raise exception 'The selected currency is invalid.'; end if;
  if p_amount < 1 or p_amount > 500000 then raise exception 'Your entered bet amount is invalid.'; end if;
  if p_target_multiplier_bps < 101 then raise exception 'Your entered multiplier is invalid.'; end if;

  select * into v_game from public.rorisk_roulette_games where uuid = p_game_uuid for update;
  if not found or v_game.state <> 'BETTING_OPEN' or clock_timestamp() >= v_game.betting_closes_at then
    raise exception 'Betting is closed for this round.';
  end if;
  select * into v_user from public.rorisk_users where uuid = p_user_uuid for update;
  if not found then raise exception 'Please sign in to perform this action.'; end if;
  v_balance := case when p_currency = 'coins' then coalesce(v_user.coins, 0) else coalesce(v_user.rocoins, 0) end;
  if v_balance < p_amount then raise exception 'Insufficient balance.'; end if;

  if p_currency = 'coins' then
    update public.rorisk_users set coins = coalesce(coins, 0) - p_amount where uuid = p_user_uuid returning * into v_user;
  else
    update public.rorisk_users set rocoins = coalesce(rocoins, 0) - p_amount where uuid = p_user_uuid returning * into v_user;
  end if;

  v_rtp := public.rorisk_rtp_effective(p_user_uuid, 'xroulette');
  v_bet := jsonb_build_object(
    'uuid', gen_random_uuid(), 'user_uuid', v_user.uuid, 'roblox_id', v_user.roblox_id,
    'username', v_user.username, 'roblox_avatar_headshot', v_user.avatar_headshot,
    'level', coalesce(v_user.level, 0), 'rank', coalesce(v_user.rank, 'user'),
    'currency', p_currency, 'amount', p_amount, 'target_multiplier_bps', p_target_multiplier_bps,
    'rtp_percent', v_rtp,
    'chance_percent', public.rorisk_chance_effective(p_user_uuid, 'xroulette'),
    'placed_at', clock_timestamp()
  );
  update public.rorisk_roulette_games
  set bets = jsonb_build_array(v_bet) || bets, bet_count = bet_count + 1,
      wagered_amount = wagered_amount + p_amount, updated_at = clock_timestamp()
  where uuid = v_game.uuid returning * into v_game;

  return jsonb_build_object('game', to_jsonb(v_game), 'bet', v_bet, 'user', to_jsonb(v_user));
end;
$$;


create or replace function public.sync_rorisk_roulette(
  p_reel jsonb,
  p_winning_index integer,
  p_result_name text,
  p_result_image text,
  p_result_multiplier_bps integer,
  p_server_seed text,
  p_server_seed_hash text,
  p_ticket integer
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game public.rorisk_roulette_games%rowtype;
  v_bet jsonb;
  v_settled_bets jsonb := '[]'::jsonb;
  v_payout bigint;
  v_paid bigint := 0;
  v_now timestamptz := clock_timestamp();
  v_rtp numeric;
  v_luck numeric;
  v_ticket numeric;
  v_forced_win boolean;
begin
  perform pg_advisory_xact_lock(hashtext('rorisk_roulette_round'));
  select * into v_game from public.rorisk_roulette_games order by created_at desc limit 1 for update;

  if found and v_game.state <> 'COMPLETE' and v_now >= v_game.settling_ends_at then
    for v_bet in select value from jsonb_array_elements(v_game.bets) loop
      v_payout := case when v_game.result_multiplier_bps >= (v_bet ->> 'target_multiplier_bps')::integer
        then floor((v_bet ->> 'amount')::numeric * (v_bet ->> 'target_multiplier_bps')::integer / 100)::bigint else 0 end;
      -- Win chance is per bet: the reel is shared by the round, so only this
      -- player's payout is forced, not the wheel everyone else sees.
      v_luck := nullif(v_bet ->> 'chance_percent', '')::numeric;
      if v_luck is not null and v_luck <> 50 then
        v_ticket := (('x' || substr(encode(digest(v_game.server_seed || ':' || coalesce(v_bet ->> 'uuid', '') || ':chance', 'sha256'), 'hex'), 1, 13))::bit(52)::bigint)::numeric / 4503599627370496::numeric;
        v_forced_win := public.rorisk_chance_forced(v_payout > 0, v_luck, v_ticket);
        if v_forced_win and v_payout = 0 then
          v_payout := floor((v_bet ->> 'amount')::numeric * (v_bet ->> 'target_multiplier_bps')::integer / 100)::bigint;
        elsif not v_forced_win and v_payout > 0 then
          v_payout := 0;
        end if;
      end if;
      v_rtp := nullif(v_bet ->> 'rtp_percent', '')::numeric;
      v_payout := public.rorisk_scale_payout(v_payout, v_rtp, 97);
      if v_payout > 0 then
        if v_bet ->> 'currency' = 'coins' then
          update public.rorisk_users set coins = coalesce(coins, 0) + v_payout where uuid = (v_bet ->> 'user_uuid')::uuid;
        else
          update public.rorisk_users set rocoins = coalesce(rocoins, 0) + v_payout where uuid = (v_bet ->> 'user_uuid')::uuid;
        end if;
      end if;
      v_paid := v_paid + v_payout;
      v_settled_bets := v_settled_bets || jsonb_build_array(v_bet || jsonb_build_object(
        'won', v_payout > 0,
        'payout_amount', v_payout,
        'payout_multiplier_bps', case when (v_bet ->> 'amount')::numeric > 0 then floor(v_payout * 100 / (v_bet ->> 'amount')::numeric)::integer else 0 end
      ));
    end loop;
    update public.rorisk_roulette_games
    set state = 'COMPLETE', bets = v_settled_bets, paid_amount = v_paid, completed_at = v_now, updated_at = v_now
    where uuid = v_game.uuid returning * into v_game;
  elsif found and v_game.state <> 'COMPLETE' then
    update public.rorisk_roulette_games
    set state = case
      when v_now < betting_closes_at then 'BETTING_OPEN'
      when v_now < rolling_started_at then 'BETTING_LOCKED'
      when v_now < rolling_ends_at then 'ROLLING'
      else 'SETTLING'
    end,
    updated_at = case when state is distinct from case
      when v_now < betting_closes_at then 'BETTING_OPEN'
      when v_now < rolling_started_at then 'BETTING_LOCKED'
      when v_now < rolling_ends_at then 'ROLLING'
      else 'SETTLING' end then v_now else updated_at end
    where uuid = v_game.uuid returning * into v_game;
  end if;

  if v_game.uuid is null or (v_game.state = 'COMPLETE' and v_game.completed_at <= v_now - interval '2 seconds') then
    if jsonb_typeof(p_reel) <> 'array' or jsonb_array_length(p_reel) < 24 then raise exception 'The roulette reel is invalid.'; end if;
    if p_winning_index < 0 or p_winning_index >= jsonb_array_length(p_reel) then raise exception 'The roulette winner is invalid.'; end if;
    if p_result_multiplier_bps < 100 or p_ticket not between 0 and 999999 then raise exception 'The roulette result is invalid.'; end if;
    if encode(digest(p_server_seed, 'sha256'), 'hex') <> p_server_seed_hash then raise exception 'The roulette seed is invalid.'; end if;
    insert into public.rorisk_roulette_games (
      reel, winning_index, result_name, result_image, result_multiplier_bps, server_seed, server_seed_hash, ticket,
      betting_opens_at, betting_closes_at, rolling_started_at, rolling_ends_at, settling_ends_at
    ) values (
      p_reel, p_winning_index, left(p_result_name, 100), left(p_result_image, 500), p_result_multiplier_bps,
      p_server_seed, p_server_seed_hash, p_ticket, v_now, v_now + interval '15 seconds',
      v_now + interval '17 seconds', v_now + interval '22 seconds', v_now + interval '24 seconds'
    ) returning * into v_game;
  end if;

  return to_jsonb(v_game);
end;
$$;


revoke all on function public.play_rorisk_dice(uuid, bigint, text, text, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.play_rorisk_dice(uuid, bigint, text, text, integer, integer, text, text, text) to service_role;

revoke all on function public.reveal_rorisk_mines(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reveal_rorisk_mines(uuid, uuid, integer) to service_role;

revoke all on function public.join_rorisk_coinflip(uuid, uuid, boolean, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.join_rorisk_coinflip(uuid, uuid, boolean, text, bigint, integer) to service_role;

revoke all on function public.open_rorisk_case(uuid, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.open_rorisk_case(uuid, text, integer, text, text, text, text) to service_role;

revoke all on function public.play_rorisk_upgrader(uuid, bigint, text, bigint, text, text, bigint, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.play_rorisk_upgrader(uuid, bigint, text, bigint, text, text, bigint, text, integer, text, text, text) to service_role;

revoke all on function public.place_rorisk_roulette_bet(uuid, uuid, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.place_rorisk_roulette_bet(uuid, uuid, bigint, text, integer) to service_role;

revoke all on function public.sync_rorisk_roulette(jsonb, integer, text, text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.sync_rorisk_roulette(jsonb, integer, text, text, integer, text, text, integer) to service_role;
