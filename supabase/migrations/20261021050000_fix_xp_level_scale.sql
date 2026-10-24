-- Fix the XP scale: rorisk_level_for_xp compared XP / 1000 against the
-- per-level thresholds, which made levelling 1000x slower than the published
-- XP Breakdown table (level 20 at 50,000 XP, level 40 at 740,000 XP, ...).
-- Thresholds are cumulative raw XP, so compare them directly.

create or replace function public.rorisk_level_for_xp(p_xp bigint)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  thresholds numeric[] := array[
    0, 0.1, 100, 250, 500, 800, 1200, 1900, 3000, 4500, 6200, 8300,
    10800, 13800, 17300, 21300, 25800, 30900, 36600, 42900, 50000, 58000,
    67000, 77000, 87500, 99000, 111500, 125000, 139500, 156000, 175000,
    197000, 223000, 255000, 293000, 339000, 394000, 460000, 537000, 629000,
    740000, 878000, 1036000, 1214000, 1413000, 1634000, 1879000, 2149000,
    2445000, 2770000, 3127000, 3513000, 3934000, 4389000, 4882000,
    5412000, 5983000, 6596000, 7253000, 7956000, 8700000, 9500000,
    10350000, 11260000, 12220000, 13240000, 14320000, 15460000, 16660000,
    17930000, 19270000, 20670000, 22150000, 23700000, 25340000, 27050000,
    28840000, 30720000, 32680000, 34730000, 37000000, 40000000, 43000000,
    47000000, 51000000, 56000000, 61000000, 67000000, 73000000, 80000000,
    87000000, 96000000, 106000000, 118000000, 133000000, 150000000,
    170000000, 195000000, 225000000, 260000000, 300000000, 350000000,
    410000000, 480000000, 560000000, 650000000, 750000000, 850000000,
    960000000, 1080000000, 1200000000, 1335000000, 1485000000, 1655000000,
    1850000000, 2070000000, 2340000000, 2655000000, 3030000000, 3475000000,
    4200000000, 5000000000, 6000000000, 7200000000, 8500000000, 10000000000,
    11700000000, 13500000000, 15500000000, 18000000000
  ];
  v_xp numeric := greatest(0, coalesce(p_xp, 0));
  level integer := 0;
  position integer;
begin
  for position in 2 .. array_length(thresholds, 1) loop
    exit when thresholds[position] > v_xp;
    level := position - 1;
  end loop;
  return level;
end;
$$;

-- Backfill stored levels so leaderboards, race podium and cached sessions agree
-- with the corrected scale.
update public.rorisk_users
set level = public.rorisk_level_for_xp(xp)
where level is distinct from public.rorisk_level_for_xp(xp);

revoke all on function public.rorisk_level_for_xp(bigint) from public, anon, authenticated;
grant execute on function public.rorisk_level_for_xp(bigint) to service_role;
