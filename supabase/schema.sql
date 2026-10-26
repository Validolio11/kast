-- Kast: схема синхронізації. Виконайте в Supabase → SQL Editor один раз.
-- Усі сутності (задачі, нотатки, дні) лежать в одній таблиці як JSON:
-- один запит на pull, одна підписка Realtime, без міграцій при зміні полів.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  kind       text        not null check (kind in ('task', 'note', 'day')),
  id         text        not null,
  data       jsonb       not null,
  updated_at bigint      not null,           -- час зміни на клієнті (мс), для last-write-wins
  deleted    boolean     not null default false,
  server_ts  timestamptz not null default now(), -- курсор для pull
  primary key (user_id, kind, id)
);

create index if not exists records_pull_idx on public.records (user_id, server_ts);

alter table public.records enable row level security;

grant usage on schema public to authenticated;
revoke all on public.records from anon, authenticated;
grant select, insert, update, delete on public.records to authenticated;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Старіший запис ніколи не перезаписує новіший (LWW на сервері) і оновлює курсор.
create or replace function public.records_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- Realtime: інші пристрої дізнаються про зміни миттєво
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;
