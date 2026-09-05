-- Real-PDF DocuSign-style signing engine (2026-09-05, per Dennis — "not this fabricated
-- version... it needs to be the actual PDF that was uploaded and overlay customer's
-- input"). One row per document type, storing WHERE on the real PDF each signable field
-- sits (as a fraction of page width/height, so it's resolution-independent regardless of
-- what scale pdf.js renders the page at). `fields` is auto-placed by Claude from reading
-- the real document, then reviewed/adjusted by Dennis via the template editor before any
-- customer ever signs against it — `confirmed` gates that.
create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  doc_type text unique not null,
  pdf_path text not null,
  pdf_pages int not null default 1,
  fields jsonb not null default '[]'::jsonb,
  confirmed boolean not null default false,
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table document_templates enable row level security;
create policy "anon full access to document_templates" on document_templates
  for all using (true) with check (true);
