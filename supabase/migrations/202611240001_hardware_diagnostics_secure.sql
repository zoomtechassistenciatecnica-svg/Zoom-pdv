
-- Diagnósticos de hardware vinculados a uma OS.
-- O cliente nunca insere diretamente.

create table if not exists public.hardware_diagnostics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id text not null,
  order_number integer,
  technician_id uuid references auth.users(id) on delete set null,
  results jsonb not null,
  device jsonb not null,
  summary jsonb not null
);

alter table public.hardware_diagnostics add column if not exists order_id text;
alter table public.hardware_diagnostics add column if not exists order_number integer;
alter table public.hardware_diagnostics add column if not exists technician_id uuid references auth.users(id) on delete set null;

update public.hardware_diagnostics
set order_id = 'legacy-unlinked'
where order_id is null;

alter table public.hardware_diagnostics alter column order_id set not null;

create index if not exists hardware_diagnostics_order_created_idx
  on public.hardware_diagnostics (order_id, created_at desc);

create table if not exists public.hardware_diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  order_id text not null,
  order_number integer,
  technician_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists hardware_diagnostic_sessions_expiry_idx
  on public.hardware_diagnostic_sessions (expires_at)
  where used_at is null;

alter table public.hardware_diagnostics enable row level security;
alter table public.hardware_diagnostic_sessions enable row level security;

revoke all on table public.hardware_diagnostics from public, anon, authenticated;
revoke all on table public.hardware_diagnostic_sessions from public, anon, authenticated;

grant select on table public.hardware_diagnostics to authenticated;

drop policy if exists "Allow visitors to submit hardware diagnostics"
  on public.hardware_diagnostics;

drop policy if exists "PDV users can read hardware diagnostics"
  on public.hardware_diagnostics;

create policy "PDV users can read hardware diagnostics"
  on public.hardware_diagnostics
  for select to authenticated
  using (
    public.has_pdv_access()
    and (auth.jwt() ->> 'aal') = 'aal2'
  );
