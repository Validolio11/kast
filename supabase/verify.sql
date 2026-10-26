-- Kast: rollback-only smoke test. Run as postgres in Supabase SQL Editor.
-- Creates two random temporary test identities; existing user rows are untouched.
-- Run the entire file. If the editor stops on an assertion error, run ROLLBACK.
begin;

do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
begin
  perform set_config('kast.verify_user_a', user_a::text, true);
  perform set_config('kast.verify_user_b', user_b::text, true);
  insert into auth.users (id, email, aud, role)
  values
    (user_a, 'kast-smoke-' || user_a || '@example.invalid', 'authenticated', 'authenticated'),
    (user_b, 'kast-smoke-' || user_b || '@example.invalid', 'authenticated', 'authenticated');
  insert into public.records (user_id, kind, id, data, updated_at)
  values (user_b, 'note', 'kast-smoke-b', '{"body":"other user"}', 10);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('kast.verify_user_a'), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('kast.verify_user_a'), 'role', 'authenticated'
)::text, true);

do $$
declare
  user_a uuid := current_setting('kast.verify_user_a')::uuid;
  user_b uuid := current_setting('kast.verify_user_b')::uuid;
  changed integer;
  rejected boolean;
begin
  if auth.uid() is distinct from user_a then
    raise exception 'FAIL: test JWT did not select user A';
  end if;

  insert into public.records (user_id, kind, id, data, updated_at)
  values (user_a, 'note', 'kast-smoke-a', '{"body":"initial"}', 20);
  if not exists (select 1 from public.records where user_id = user_a and id = 'kast-smoke-a') then
    raise exception 'FAIL: owner cannot read own insert';
  end if;
  if exists (select 1 from public.records where user_id = user_b and id = 'kast-smoke-b') then
    raise exception 'FAIL: cross-user SELECT exposed another record';
  end if;

  rejected := false;
  begin
    insert into public.records (user_id, kind, id, data, updated_at)
    values (user_b, 'note', 'kast-smoke-forged', '{}', 20);
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: cross-user INSERT succeeded'; end if;

  update public.records set data = '{"body":"forged"}', updated_at = 30
  where user_id = user_b and id = 'kast-smoke-b';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: cross-user UPDATE succeeded'; end if;

  delete from public.records where user_id = user_b and id = 'kast-smoke-b';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: cross-user DELETE succeeded'; end if;

  rejected := false;
  begin
    update public.records set user_id = user_b
    where user_id = user_a and id = 'kast-smoke-a';
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: owner reassignment bypassed WITH CHECK'; end if;

  insert into public.records (user_id, kind, id, data, updated_at)
  values (user_a, 'note', 'kast-smoke-a', '{"body":"stale"}', 10)
  on conflict (user_id, kind, id) do update
    set data = excluded.data, updated_at = excluded.updated_at;
  if not exists (
    select 1 from public.records
    where user_id = user_a and id = 'kast-smoke-a'
      and updated_at = 20 and data->>'body' = 'initial'
  ) then raise exception 'FAIL: stale upsert replaced a newer record'; end if;

  insert into public.records (user_id, kind, id, data, updated_at)
  values (user_a, 'note', 'kast-smoke-a', '{"body":"newer"}', 30)
  on conflict (user_id, kind, id) do update
    set data = excluded.data, updated_at = excluded.updated_at;
  if not exists (
    select 1 from public.records
    where user_id = user_a and id = 'kast-smoke-a'
      and updated_at = 30 and data->>'body' = 'newer'
  ) then raise exception 'FAIL: newer upsert did not update the record'; end if;

  delete from public.records where user_id = user_a and id = 'kast-smoke-a';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: owner cannot delete own record'; end if;
end $$;

rollback;
select 'PASS: owner CRUD, cross-user SELECT/INSERT/UPDATE/DELETE, ownership check, stale/newer upsert; all test data rolled back' as result;
