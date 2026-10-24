-- Default rain pool amount is 20 Coins (previously 200).

alter table public.rorisk_rains alter column coin_amount set default 20;

-- Re-price the currently active pool if nobody has joined or tipped it yet.
update public.rorisk_rains
set coin_amount = 20, updated_at = now()
where status = 'created'
  and jsonb_array_length(entries) = 0
  and jsonb_array_length(tips) = 0
  and coin_amount <> 20;

-- New pools are created at 20 Coins by the atomic get-or-create function.
create or replace function public.rorisk_get_or_create_active_rain()
returns setof public.rorisk_rains
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rain public.rorisk_rains;
begin
  perform pg_advisory_xact_lock(hashtext('rorisk-single-active-rain'));

  select * into v_rain
  from public.rorisk_rains
  where status in ('created', 'running')
  order by
    coin_amount desc,
    jsonb_array_length(entries) desc,
    ends_at asc,
    created_at asc,
    uuid asc
  limit 1
  for update;

  if v_rain.uuid is not null then
    if v_rain.starts_at is distinct from v_rain.created_at + interval '30 minutes'
      or v_rain.ends_at is distinct from v_rain.created_at + interval '32 minutes'
      or v_rain.join_ends_at is distinct from v_rain.created_at + interval '32 minutes' then
      update public.rorisk_rains
      set
        starts_at = created_at + interval '30 minutes',
        ends_at = created_at + interval '32 minutes',
        join_ends_at = created_at + interval '32 minutes',
        updated_at = now()
      where uuid = v_rain.uuid
      returning * into v_rain;
    end if;

    update public.rorisk_rains
    set status = 'completed', updated_at = now()
    where uuid <> v_rain.uuid
      and status in ('created', 'running')
      and jsonb_array_length(entries) = 0
      and jsonb_array_length(tips) = 0;

    return next v_rain;
    return;
  end if;

  insert into public.rorisk_rains (
    status,
    coin_amount,
    entries,
    tips,
    starts_at,
    ends_at,
    join_ends_at
  ) values (
    'created',
    20,
    '[]'::jsonb,
    '[]'::jsonb,
    now() + interval '30 minutes',
    now() + interval '32 minutes',
    now() + interval '32 minutes'
  )
  returning * into v_rain;

  return next v_rain;
end;
$$;
