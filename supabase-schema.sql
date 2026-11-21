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

-- No Supabase Dashboard, habilite Authentication > Sign In / Providers > Authenticator App (TOTP)
-- e defina o nível mínimo de garantia (MFA) como AAL2. As políticas abaixo também exigem aal2.
drop policy if exists "Authenticated users can read store data" on public.pdv_data;
create policy "Authenticated users can read store data"
  on public.pdv_data for select to authenticated
  using ((select auth.uid()) is not null and (select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "Authenticated users can create store data" on public.pdv_data;
create policy "Authenticated users can create store data"
  on public.pdv_data for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "Authenticated users can update store data" on public.pdv_data;
create policy "Authenticated users can update store data"
  on public.pdv_data for update to authenticated
  using ((select auth.uid()) is not null and (select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.uid()) is not null and (select auth.jwt() ->> 'aal') = 'aal2');

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

create or replace function public.resolve_login_identifier(p_identifier text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_email text;
  digits text := regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g');
begin
  select u.email
  into resolved_email
  from auth.users u
  where (
    digits <> ''
    and (
      regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = digits
      or regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = ltrim(digits, '55')
      or regexp_replace(coalesce(u.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g') = digits
      or regexp_replace(coalesce(u.raw_user_meta_data ->> 'document', ''), '\D', '', 'g') = digits
      or regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g') = digits
      or regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g') = ltrim(digits, '55')
    )
  )
  limit 1;

  return resolved_email;
end;
$$;

revoke all on function public.resolve_login_identifier(text) from public;
grant execute on function public.resolve_login_identifier(text) to anon, authenticated;

create table if not exists public.hardware_diagnostics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  test_token text,
  results jsonb not null,
  device jsonb not null,
  summary jsonb not null
);

alter table public.hardware_diagnostics
  add column if not exists test_token text;

alter table public.hardware_diagnostics enable row level security;

revoke all on table public.hardware_diagnostics from anon, authenticated;
grant insert on table public.hardware_diagnostics to anon, authenticated;

drop policy if exists "Allow visitors to submit hardware diagnostics" on public.hardware_diagnostics;
create policy "Allow visitors to submit hardware diagnostics"
  on public.hardware_diagnostics
  for insert
  to anon, authenticated
  with check (true);
