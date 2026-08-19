-- Quay 1 — SA Broker Invoicing: record-keeping store
-- ============================================================
-- Persists every generated broker tax-invoice line so payroll/supers can browse
-- past months and per-broker breakdowns. Invoices are REGENERATED on demand from
-- these rows (deterministic PDF), so we store the data, not the files.
--
-- doc_no (the SAGE INV#### number, reused as the invoice number) is the natural
-- key: re-uploading the same SAGE export upserts rather than duplicating.
--
-- Access is DELIBERATELY restricted to superusers and payroll only, matching the
-- app's login gate. RLS uses staff.auth_user_id = auth.uid() and the same signal
-- the app uses: is_super OR designation = 'payroll'.
-- ============================================================

-- 1. Table -------------------------------------------------------
create table if not exists public.broker_invoices (
  doc_no          text primary key,                 -- SAGE INV#### = invoice number
  broker_name     text not null,
  inv_date        date,                              -- SAGE line date (month basis)
  division        text,                              -- line description (invoice "Division")
  excl            numeric(14,2) not null default 0,  -- exclusive amount (abs)
  vat             numeric(14,2) not null default 0,  -- VAT (abs)
  total           numeric(14,2) not null default 0,  -- total incl. (abs) = invoice grand total
  outstanding     numeric(14,2) not null default 0,  -- balance due (abs)
  source_filename text,
  created_by      uuid references auth.users(id),
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists broker_invoices_inv_date_idx on public.broker_invoices (inv_date);
create index if not exists broker_invoices_broker_idx    on public.broker_invoices (broker_name);

comment on table public.broker_invoices is
  'SA Broker Invoicing store: one row per generated tax invoice (keyed by SAGE INV number). Invoices are regenerated from these rows. Supers + payroll only (RLS).';

-- keep updated_at fresh on upsert-update
create or replace function public.broker_invoices_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists broker_invoices_touch_trg on public.broker_invoices;
create trigger broker_invoices_touch_trg
  before update on public.broker_invoices
  for each row execute function public.broker_invoices_touch();

-- 2. Access helper: super OR payroll -----------------------------
create or replace function public.is_super_or_payroll()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.auth_user_id = auth.uid()
      and coalesce(s.active, true) is not false
      and (coalesce(s.is_super, false) or s.designation = 'payroll')
  );
$$;

-- 3. RLS: supers + payroll may read/write; nobody else ------------
alter table public.broker_invoices enable row level security;

drop policy if exists broker_invoices_rw on public.broker_invoices;
create policy broker_invoices_rw on public.broker_invoices
  for all to authenticated
  using (public.is_super_or_payroll())
  with check (public.is_super_or_payroll());
