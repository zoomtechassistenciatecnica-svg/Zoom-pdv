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

-- A resolução de CPF/telefone agora ocorre na Edge Function login-by-identifier.
-- Remova a função antiga que expunha e-mails a usuários anônimos.
drop function if exists public.resolve_login_identifier(text);

-- Limitação básica por IP para chamadas públicas de login por identificador.
create table if not exists public.login_identifier_attempts (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.login_identifier_attempts enable row level security;
revoke all on table public.login_identifier_attempts from public, anon, authenticated;

create or replace function public.consume_login_identifier_attempt(
  p_key_hash text,
  p_max_attempts integer default 10,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempts integer;
begin
  insert into public.login_identifier_attempts(key_hash, window_started_at, attempts)
  values (p_key_hash, now(), 1)
  on conflict (key_hash) do update
    set window_started_at = case
          when public.login_identifier_attempts.window_started_at < now() - make_interval(secs => greatest(1, p_window_seconds)) then now()
          else public.login_identifier_attempts.window_started_at end,
        attempts = case
          when public.login_identifier_attempts.window_started_at < now() - make_interval(secs => greatest(1, p_window_seconds)) then 1
          else public.login_identifier_attempts.attempts + 1 end;
  select attempts into current_attempts from public.login_identifier_attempts where key_hash = p_key_hash;
  return current_attempts <= greatest(1, p_max_attempts);
end;
$$;
revoke all on function public.consume_login_identifier_attempt(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_login_identifier_attempt(text, integer, integer) to service_role;

-- Resolve apenas o UUID; nunca retorna e-mail. A execução é exclusiva do servidor.
create or replace function public.resolve_login_user_id(p_identifier text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g');
  normalized_phone text := regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g');
  matched_ids uuid[];
begin
  if p_kind = 'phone' and left(normalized_phone, 2) = '55' and length(normalized_phone) >= 12 then
    normalized_phone := substr(normalized_phone, 3);
  end if;
  if p_kind not in ('cpf', 'phone') then return null; end if;

  select array_agg(distinct u.id) into matched_ids
  from auth.users u
  where case
    when p_kind = 'cpf' then
      regexp_replace(coalesce(u.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g') = digits
      or regexp_replace(coalesce(u.raw_user_meta_data ->> 'document', ''), '\D', '', 'g') = digits
    else
      (case when left(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 2) = '55'
             and length(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g')) >= 12
            then substr(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 3)
            else regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') end) = normalized_phone
      or (case when left(regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), 2) = '55'
                and length(regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g')) >= 12
               then substr(regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), 3)
               else regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g') end) = normalized_phone
      or (case when left(regexp_replace(coalesce(u.raw_user_meta_data ->> 'telefone', ''), '\D', '', 'g'), 2) = '55'
                and length(regexp_replace(coalesce(u.raw_user_meta_data ->> 'telefone', ''), '\D', '', 'g')) >= 12
               then substr(regexp_replace(coalesce(u.raw_user_meta_data ->> 'telefone', ''), '\D', '', 'g'), 3)
               else regexp_replace(coalesce(u.raw_user_meta_data ->> 'telefone', ''), '\D', '', 'g') end) = normalized_phone
  end;

  if coalesce(cardinality(matched_ids), 0) <> 1 then return null; end if;
  return matched_ids[1];
end;
$$;
revoke all on function public.resolve_login_user_id(text, text) from public, anon, authenticated;
grant execute on function public.resolve_login_user_id(text, text) to service_role;

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
