create table if not exists public.pdv_data (
  id text primary key check (id = 'main-store'),
  data jsonb not null default '{"products":[],"customers":[],"sales":[],"serviceOrders":[],"nextSaleNumber":1,"nextServiceOrderNumber":1}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.pdv_data
  add column if not exists version bigint not null default 1;

alter table public.pdv_data enable row level security;

revoke all on table public.pdv_data from anon, authenticated;
grant select, insert, update on table public.pdv_data to authenticated;

drop policy if exists "Authenticated users can read store data" on public.pdv_data;
create policy "Authenticated users can read store data"
  on public.pdv_data for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can create store data" on public.pdv_data;
create policy "Authenticated users can create store data"
  on public.pdv_data for insert to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can update store data" on public.pdv_data;
create policy "Authenticated users can update store data"
  on public.pdv_data for update to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create or replace function public.set_pdv_data_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pdv_data_updated_at on public.pdv_data;
create trigger set_pdv_data_updated_at
  before update on public.pdv_data
  for each row execute function public.set_pdv_data_updated_at();
