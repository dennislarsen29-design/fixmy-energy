# FixMy.Energy / Solar Review — AI agents & AI functions (2026-11-23)

Prices: Anthropic API list rates per million tokens (input / output). Opus 4.7 & Opus 5: $5 / $25. Sonnet 5 & Sonnet 5.5: $2 / $10. Haiku 4.5: $1 / $5. Web search adds roughly $10 per 1,000 searches (verify on the Anthropic pricing page).
Costs below are ESTIMATES from each function's model, output cap and loop shape. Nothing in the code logs real token use; the real number is Anthropic Console → Usage.
Reports filed = agent_reports rows, last 30 days.

## Scheduled agents (run on their own)
| Agent | What it does | Schedule | Model | Web search | Reports 30d | Est. cost |
|---|---|---|---|---|---|---|
| finance-agent | Business books review, tax ideas — now ONE daily brief | Daily 5am PT | Sonnet 5 | yes | 64 (before the change) | ~$0.40–0.70/run → $12–20/mo |
| personal-finance-agent | Dennis's private financial coach | Daily 5:15am PT | Sonnet 5 | yes | (private table) | ~$10–15/mo |
| business-review-agent (NEW, replaces marketing + bizdev + crm-dev) | Sales, marketing, ops, data, portal findings (max 8) | Mon | Sonnet 5.5 | no | — | ~$0.40/run → ~$2/mo |
| seo-agent | SEO recommendations, title/meta PRs, blog topic ideas → content engine | Thu | Sonnet 5.5 | no | 12 | ~$0.35/run → ~$1.50/mo |
| roadmap-agent | Adds growth tasks to the roadmap | Fri | Sonnet 5 | yes (8) | 1 | ~$0.60/run → ~$3/mo |
| pr-research-agent | Finds press outlets + public contacts | Tue | Sonnet 5 | yes | — | ~$0.60/run → ~$3/mo |
| content-agent (NEW) | 1 blog + 3 social posts a week | Mon | Sonnet 5.5 | no | — | ~$0.15/run → <$1/mo |
| quoya-sync-background | Labels uploaded photos | Nightly (60 photos max) | Sonnet 5 | no | — | ~$0.005/photo |
| bb-auto-pipeline-background | Nightly lead pipeline (small AI step) | Nightly | Haiku 4.5 | no | — | pennies |
| plaid-sync / personal-plaid-sync | Categorize new bank/card charges | Daily | Sonnet 5 | no | — | ~$0.02–0.10/day each |

## Manual / on-demand agents
| Agent | Trigger | Model | Est. cost |
|---|---|---|---|
| coaching-agent | Administration → 1:1s → Run Analysis | Sonnet 5 + search | ~$0.60/run |
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
- finance-agent: files one combined daily brief instead of one report per finding.
- seo-agent: new article ideas go to the content engine (pipeline_state content_topic_ideas) instead of the inbox.
- seo-agent and chat-agent moved from Opus 4.7 to Sonnet 5.5 (about 60% cheaper).
