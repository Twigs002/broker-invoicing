-- SA Broker Invoicing: add the `entity` dimension (Quay 1 vs Active)
-- ============================================================
-- The app now runs as one of two entities at a time (quay1 | active), chosen by the
-- header pill toggle. Records must stay fully separate per entity, and the two brands
-- may legitimately reuse the same document number, so the natural key becomes
-- (entity, doc_no) instead of doc_no alone.
--
-- CONFIDENTIALITY: Quay 1 and Active are mutually secret. The app always filters by the
-- active entity; this migration keeps their rows partitioned by the `entity` column.
--
-- Safe to run on the existing table: the new column backfills existing rows to 'quay1'.
-- ============================================================

-- 1. Add the entity column (existing rows backfill to 'quay1') --------------
alter table public.broker_invoices
  add column if not exists entity text not null default 'quay1';

-- constrain to the known entities (drop first so re-runs are idempotent)
alter table public.broker_invoices drop constraint if exists broker_invoices_entity_chk;
alter table public.broker_invoices
  add constraint broker_invoices_entity_chk check (entity in ('quay1','active'));

-- 2. Move the primary key from (doc_no) to (entity, doc_no) -----------------
-- lets the same doc_no exist once per entity, and matches the app's
-- upsert onConflict:"entity,doc_no".
alter table public.broker_invoices drop constraint if exists broker_invoices_pkey;
alter table public.broker_invoices
  add constraint broker_invoices_pkey primary key (entity, doc_no);

create index if not exists broker_invoices_entity_idx on public.broker_invoices (entity);

comment on column public.broker_invoices.entity is
  'Owning entity: quay1 | active. Records are always filtered by this; the two brands are kept mutually confidential.';
