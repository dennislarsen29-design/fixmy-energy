# FixMy.Energy / Solar Review — AI agents & AI functions (2026-11-23)

Prices: Anthropic API list rates per million tokens (input / output). Opus 4.7 & Opus 5: $5 / $25. Sonnet 5 & Sonnet 5.5: $2 / $10. Haiku 4.5: $1 / $5. Web search adds roughly $10 per 1,000 searches (verify on the Anthropic pricing page).
Costs below are ESTIMATES from each function's model, output cap and loop shape. Nothing in the code logs real token use; the real number is Anthropic Console → Usage.
Reports filed = agent_reports rows, last 30 days.

## Scheduled agents (run on their own) — updated 2026-11-23
| Agent | Runs | Scope | Posts to | Model | Est. cost |
|---|---|---|---|---|---|
| Business Review (replaces Marketing + BizDev + CRM Dev) | Monday ~7am PT | Sales, marketing, ops, data and portal: max 8 findings | Agent Inbox + daily digest email | Sonnet 5.5 | ~$0.40/run, ~$2/mo |
| Content | Monday ~6am PT (drafts); publisher every 30 min | 1 blog + 3 social posts per week; nothing posts until you approve | Agents → Content; after approval: blog on fixmy.energy, Google Business, Facebook, Instagram (via GHL); Nextdoor text emailed to you | Sonnet 5.5 | ~$0.15/run, under $1/mo |
| Finance | Monday ~5am PT | One weekly brief: this week vs last week, then 2–4 actions with dollar amounts | Agent Inbox, Finance → AI Advisor, daily digest email | Sonnet 5 | ~$0.50–0.80/run, ~$2–4/mo |
| PR Research | Tuesday ~10am PT | Up to 8 press outlets with verified public contacts; never emails anyone | Agents → PR & Backlinks + weekly summary in Agent Inbox | Sonnet 5 + web search | ~$0.60/run, ~$3/mo |
| SEO | Thursday ~8am PT | Search Console review, title/meta fix pull requests, blog topic ideas | Agent Inbox + GitHub pull requests (you merge) + topic ideas to the Content agent | Sonnet 5.5 | ~$0.35/run, ~$1.50/mo |
| Roadmap | Friday ~8am PT | 2–4 new growth tasks | Business Model → Roadmap board + summary in Agent Inbox | Sonnet 5 + web search | ~$0.60/run, ~$3/mo |
| Personal Financial Coach | Wednesday ~5:15am PT | Your personal finances (private), looking back over the week | Personal → Coach + daily digest email | Sonnet 5 + web search | ~$0.50–0.80/run, ~$2–3/mo |
| Photo labeling (Quoya sync) | OFF (nightly run turned off 2026-11-23); manual "Sync with Quoya" button still works | Labels uploaded job photos | The photos themselves (job_photos labels) | Sonnet 5 | $0 while off |
| Nightly lead pipeline | Nightly ~2am PT | Permit pulls, owner lookup, skip-trace (small AI step) | Black Box leads + Black Box status panel | Haiku 4.5 | pennies |
| Bank/card categorizing (business + personal) | Daily ~4:30 / 4:45am PT | Categorizes new charges | Finance → Expenses / Personal → Bookkeeper | Sonnet 5 | ~$0.02–0.10/day each |

## Manual / on-demand agents
| Agent | Trigger | Model | Est. cost |
|---|---|---|---|
| coaching-agent | Administration → 1:1s → Run Analysis (posts to 1:1s + Agent Inbox) | Sonnet 5 + search | ~$0.60/run |
| market-report-background | City market report | Sonnet 5 + search | ~$0.50/report |
| heal-codefix / heal-seo | Self-healing code/SEO pull requests (you approve) | Sonnet 5.5 | ~$0.10–0.30/fix |
| chat-agent | Agents tab chat box | Sonnet 5.5 | ~$0.01–0.03/question |

## Built into screens (runs when someone uses it)
| Function | Where | Model | Est. cost per use |
|---|---|---|---|
| eval-analysis-background (eval-analysis-core) | Quoya's full evaluation read | Opus 5 + search | ~$0.30–0.80 |
| eval-troubleshoot-background | Error-code troubleshooting | Sonnet 5 + search | ~$0.10–0.20 |
| eval-bill-analysis / axia-bill-analysis | Read a utility bill | Sonnet 5 | ~$0.03–0.08 |
| generate-proposal-insight | Proposal "Situation" text | Sonnet 5 | ~$0.03–0.08 |
| diag-report-draft | Customer diagnostic report | Sonnet 5 | ~$0.02 |
| recapture-draft | Follow-up text/email drafts | Sonnet 5 | ~$0.01–0.02 |
| pr-pitch-draft | Press pitch draft | Sonnet 5 | ~$0.01–0.02 |
| finance-extract | Read a statement PDF | Sonnet 5 | ~$0.05–0.20 |
| personal-consultant | Personal finance chat | Sonnet 5 | ~$0.01–0.03 |
| dialer-notes / quoya-transcript / quoya-assist-extract | Call notes + live form fill | Haiku 4.5 | <$0.01 (live fill repeats during a call) |
| rep-assistant | Rep chat help | Haiku 4.5 | <$0.01 |
| claude-vision | Photo/vision proxy | Haiku 4.5 / Sonnet 5 | <$0.01 |
| lib/ads-create | Meta ad copy | Haiku 4.5 | <$0.01 |

## Consolidated / retired
- socials-agent: retired 2026-11-23 (replaced by content-agent; its Run-now button now runs content). Last report was May 2026.
- gbp-post-agent: schedule removed 2026-11-23 (content engine posts to Google Business).

- marketing-agent, bizdev-agent, crm-dev-agent: merged 2026-11-23 into business-review-agent (their schedules removed; their Run-now names run the review; their files stay because the review reuses their read tools).
- finance-agent: weekly (Mondays) instead of nightly; one brief per run (numbers block + 2–4 actions, max 5 items), new week-over-week data tool, looks back 4 weeks to avoid repeats.
- seo-agent: new article ideas go to the content engine (pipeline_state content_topic_ideas) instead of the inbox.
- seo-agent and chat-agent moved from Opus 4.7 to Sonnet 5.5 (about 60% cheaper).
- personal-finance-agent: weekly on Wednesdays instead of daily (2026-11-23).
- quoya-sync-background (nightly photo labeling): schedule turned off 2026-11-23; manual button still works; self-heal photo-backlog alert disabled with it.
