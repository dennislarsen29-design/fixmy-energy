-- Document Signer (2026-09-06, per Dennis) — self-service PDF upload + field placement
-- for NEW document types, without a dev session. Extends document_templates (which
-- already holds cpuc_guide/tesla_sdcp) with the metadata a self-service upload needs
-- to become a real DEAL_DOC_TYPES entry client-side: a display label, an icon, and
-- which lead category it applies to. hasPdfTemplate is implied by having a row here at
-- all — no separate flag needed.
alter table document_templates add column if not exists label text;
alter table document_templates add column if not exists icon text default '&#128196;';
alter table document_templates add column if not exists applies_to text default 'all'; -- 'all' | 'fixmy' | 'new_solar'

-- Backfill the two existing hardcoded rows so they read consistently if ever listed
-- alongside custom uploads (their DEAL_DOC_TYPES entries in portal.html remain the
-- source of truth for label/icon/appliesWhen client-side — this is just so a raw
-- table read isn't confusingly blank for them).
update document_templates set label = 'California Solar Consumer Protection Guide (CPUC)', icon = '&#128214;', applies_to = 'fixmy' where doc_type = 'cpuc_guide' and label is null;

-- Public bucket for template PDFs — pdf.js fetches these directly from the browser via
-- a plain URL (same as the committed assets/documents/*.pdf static file the first two
-- document types use), so it must be public-read, not the private customer-docs bucket.
-- Anon-key-wide-open policies matching this project's established storage trust model
-- (see job_photos' own policy set) — client-side CURRENT_ROLE==='admin' gating is what
-- actually restricts who can reach the upload UI, same as everywhere else in this app.
insert into storage.buckets (id, name, public)
values ('document-templates', 'document-templates', true)
on conflict (id) do nothing;

create policy "allow_select_document_templates" on storage.objects for select
  using (bucket_id = 'document-templates');
create policy "allow_insert_document_templates" on storage.objects for insert
  with check (bucket_id = 'document-templates');
create policy "allow_update_document_templates" on storage.objects for update
  using (bucket_id = 'document-templates');
create policy "allow_delete_document_templates" on storage.objects for delete
  using (bucket_id = 'document-templates');
