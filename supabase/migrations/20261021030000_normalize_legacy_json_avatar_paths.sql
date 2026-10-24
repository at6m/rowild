-- X-Roulette stores each bet (including its avatar) inside a jsonb array,
-- so the column-level cleanup in 20261021010000 does not reach it.
-- Match the quoted JSON value: '/assets/users/default-avatar.png' also ends with
-- '/default-avatar.png', so a bare substring replace would corrupt migrated rows.
do $$
declare
  target record;
begin
  for target in
    select table_schema, table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and data_type in ('json', 'jsonb')
  loop
    execute format(
      'update %I.%I set %I = replace(%I::text, %L, %L)::%s where %I::text like %L',
      target.table_schema,
      target.table_name,
      target.column_name,
      target.column_name,
      '"/default-avatar.png"',
      '"/assets/users/default-avatar.png"',
      case target.data_type when 'jsonb' then 'jsonb' else 'json' end,
      target.column_name,
      '%"/default-avatar.png"%'
    );
  end loop;
end;
$$;
