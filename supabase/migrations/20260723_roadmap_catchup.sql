-- ═══ Bring the roadmap board fully current (2026-07-23) ═══
-- Full audit vs. codebase + CLAUDE.md. Promotes every confirmed-shipped item to
-- done (promote-only — never demotes, so it can't revert a manual Done toggle),
-- and adds this session's two accomplishments (email digest, roadmap rebuild) that
-- were never represented. Genuinely-unbuilt items (google-biz, seo-blog, ig-fb-publish,
-- comment-dm, fb-lead-ads, fb-lead-bridge, fb-jobs, service-packages, monitoring-sub,
-- phone-app) are intentionally left To-Do. meta-ads left as-is pending Dennis's
-- confirmation on the retargeting campaign. Idempotent.

update public.roadmap_items set status='done', checked=true,
  completed_at=coalesce(completed_at, now()), updated_at=now()
where key in ('google-ads','ig-dashboard','commission-calc','call-center','booking-ux',
              'plaid-sync','accounting','hiring','ghl-webhook','ig-token','ghl-sms',
              'acc-slot-display','acc-photo-step2','acc-ghl-e2e')
  and status is distinct from 'done';

insert into public.roadmap_items (key,title,description,group_key,status,source,sort,completed_at) values
  ('acc-email-digest','AI Agent Report Email Digest',
   'Every AI agent report (marketing, biz dev, CRM, SEO, socials, finance, roadmap + Financial Coach) emailed as one daily digest via Resend — no more hunting in the Agents tab.',
   'history','done','manual',120, timestamptz '2026-07-23'),
  ('acc-roadmap-board','Roadmap Rebuilt — DB Board + AI Growth Agent',
   'Replaced the broken three-system roadmap with one DB-driven board (Do Now / grouped / Completed) plus a weekly AI growth strategist that auto-adds new tasks with paste-ready prompts.',
   'history','done','manual',130, timestamptz '2026-07-23')
on conflict (key) do nothing;
