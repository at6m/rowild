-- Extend the race that is running right now by one week, and only that race.
-- The weekly cycle stays at 14 days (20160 minutes): the functions below are
-- restated at their original values so this file also undoes any earlier draft
-- that changed the length of future races.

comment on table public.rorisk_races is
  'Weekly race cycles. Each race runs for 20160 minutes (14 days); a new one starts when the previous ends.';

create or replace function public.ensure_rorisk_race()
returns public.rorisk_races
language plpgsql
security definer
set search_path = public
as $$
declare
  v_race public.rorisk_races%rowtype;
  v_expired public.rorisk_races%rowtype;
begin
  select * into v_race
  from public.rorisk_races
  where status = 'active'
  order by starts_at desc
  limit 1;

  if found and v_race.ends_at > now() then
    return v_race;
  end if;

  -- Only cycle creation needs serialising; the common path above takes no lock.
  perform pg_advisory_xact_lock(918273645);

  select * into v_race
  from public.rorisk_races
  where status = 'active'
  order by starts_at desc
  limit 1;

  if found and v_race.ends_at > now() then
    return v_race;
  end if;

  for v_expired in
    select * from public.rorisk_races
    where status = 'active' and ends_at <= now()
    order by starts_at
    for update
  loop
    with ranked as (
      select user_uuid,
             row_number() over (order by points desc, updated_at asc, user_uuid) as place
      from public.rorisk_race_entries
      where race_id = v_expired.id and points > 0
    )
    update public.rorisk_race_entries as entry
    set prize = case ranked.place
        when 1 then floor(v_expired.prize_pool * 0.5)
        when 2 then floor(v_expired.prize_pool * 0.3)
        when 3 then floor(v_expired.prize_pool * 0.2)
        else 0
      end
    from ranked
    where entry.race_id = v_expired.id
      and entry.user_uuid = ranked.user_uuid
      and ranked.place <= 3;

    update public.rorisk_races set status = 'completed' where id = v_expired.id;
  end loop;

  insert into public.rorisk_races (starts_at, ends_at)
  values (now(), now() + interval '20160 minutes')
  returning * into v_race;

  return v_race;
end;
$$;

create or replace function public.rorisk_race_state(p_user_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_race public.rorisk_races%rowtype;
  v_leaderboard jsonb;
  v_me jsonb;
  v_claimable bigint;
  v_won bigint;
begin
  v_race := public.ensure_rorisk_race();

  select coalesce(jsonb_agg(jsonb_build_object(
      'uuid', entry.user_uuid,
      'username', users.username,
      'avatar', users.avatar_headshot,
      'level', users.level,
      'rank', users.rank,
      'points', entry.points,
      'prize', entry.prize
    ) order by entry.points desc, entry.updated_at asc), '[]'::jsonb)
  into v_leaderboard
  from (
    select * from public.rorisk_race_entries
    where race_id = v_race.id
    order by points desc, updated_at asc
    limit 25
  ) as entry
  join public.rorisk_users as users on users.uuid = entry.user_uuid;

  if p_user_uuid is not null then
    select jsonb_build_object(
      'points', entry.points,
      'prize', entry.prize,
      'place', (
        select count(*) + 1
        from public.rorisk_race_entries as other
        where other.race_id = v_race.id
          and (other.points > entry.points or (other.points = entry.points and other.updated_at < entry.updated_at))
      )
    )
    into v_me
    from public.rorisk_race_entries as entry
    where entry.race_id = v_race.id and entry.user_uuid = p_user_uuid;
  end if;

  select count(*)
  into v_won
  from public.rorisk_race_entries as entry
  join public.rorisk_races as race on race.id = entry.race_id
  where entry.user_uuid = p_user_uuid
    and race.status = 'completed'
    and entry.prize > 0;

  select coalesce(sum(entry.prize), 0)
  into v_claimable
  from public.rorisk_race_entries as entry
  join public.rorisk_races as race on race.id = entry.race_id
  where entry.user_uuid = p_user_uuid
    and race.status = 'completed'
    and entry.prize > 0
    and entry.claimed = false;

  return jsonb_build_object(
    'race', jsonb_build_object(
      'id', v_race.id,
      'startsAt', v_race.starts_at,
      'endsAt', v_race.ends_at,
      'prizePool', v_race.prize_pool
    ),
    'serverTime', now(),
    'leaderboard', v_leaderboard,
    'me', v_me,
    'won', coalesce(v_won, 0),
    'claimable', v_claimable,
    'durationMinutes', 20160
  );
end;
$$;

-- One-off: the race in progress gains seven days. Races that already ended are
-- left alone, so an expired cycle is never resurrected. Every later race is
-- created by ensure_rorisk_race() at its usual 14 days.
update public.rorisk_races
set ends_at = ends_at + interval '7 days'
where status = 'active'
  and ends_at > now();
