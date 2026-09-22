# OpenDM

**Open-source social automation for creators, agencies and businesses.**

Imagine an assistant that never sleeps. Someone comments `GUIDE` on your
Instagram post. OpenDM replies publicly, sends your guide by DM, adds the
person to your contacts with a "Guide Lead" tag, and tracks whether they
click your link. All of it automatic, all of it yours.

> ⚠️ **Status:** v0.1.0. Core flows are tested and working. See the
> [Roadmap](#roadmap) for what is coming next.

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Next.js](https://img.shields.io/badge/Next.js-14-000000)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1)
![Redis](https://img.shields.io/badge/Redis-7-dc382d)
![Tests](https://img.shields.io/badge/tests-65%20passing-brightgreen)
![License](https://img.shields.io/badge/License-MIT-green)

---

## What is this exactly?

OpenDM is a **social automation operating system** you run yourself.

Most tools like this are paid services. You rent them per message, you have
no idea how they store your data, and you cannot change how they work.
OpenDM is the opposite: the whole thing is open source, you run it on your
own machine (or a $5 server), and you own everything inside it: contacts,
messages, links, analytics.

It starts with Instagram because that is the classic use case. Someone
comments, they get a reply and a DM. But underneath it is a general engine:
**trigger, conditions, actions**. You pick what happens, when it happens,
and what the system is allowed to do. The engine does not care whether the
event is a comment, a DM, a story reply, or eventually something from
Facebook, WhatsApp or TikTok.

## How it works, in plain words

1. Something happens on your Instagram. A comment, a DM, a story reply.
2. OpenDM checks your automations. Each one is a short recipe: *if this
   happens, and these conditions are true, do these actions in this order.*
3. The work is handed to a background worker (a second helper process that
   does the heavy lifting). The website itself just drops off the work
   orders and moves on.
4. Every run is recorded. You can open any execution and see each step:
   what was sent, when, whether it worked, and if it failed, why.

This design means nothing gets lost when the website restarts. Work waits in
a to-do tray (the queue) until the worker picks it up.

## Features

| Area | What you get |
| --- | --- |
| **Automations** | Three triggers to start from: comment, DM, story reply. Conditions like keywords, excluded words, a specific post, or followers only. Actions like sending a DM, replying publicly, sending a tracked link, tagging the person, calling a webhook, or waiting. You can enable, pause, duplicate, edit, archive, test, export and import them. |
| **Visual builder** | A simple flow you can read in seconds: trigger, conditions, actions. No confusing node editor. A built-in **Test** button shows what would happen before you turn anything on. |
| **Inbox** | Every conversation in one place. Unread badges, search, replies. If Instagram rules block a reply, OpenDM tells you why instead of failing silently. |
| **Contacts** | A lightweight customer list. Who commented, who got tagged, what they clicked, what was sent to them. Notes and tags included. |
| **Tracked links** | Short links that count clicks, unique visitors and click-through rate per campaign. |
| **Analytics** | Real numbers: triggers, DMs sent, failures, clicks, top automations, top keywords, conversion funnel, account health. Nothing estimated, and empty states look intentional rather than broken. |
| **AI help (optional)** | Rewrite a message in a friendlier tone, generate a whole campaign from one sentence, get analytics insights. Works with Anthropic, OpenAI or Gemini. AI output is always a draft. Nothing is sent without you approving it. |
| **Templates** | Ten ready-made flows for common cases: Comment GUIDE, Comment PRICE, lead magnet, webinar, real estate, restaurant, agency leads, newsletter and more. They install as editable drafts. |
| **Team** | Workspaces with owner, admin and member roles. Invite people by email. Every important action is logged. |
| **Demo mode** | One click gives you a workspace full of realistic sample data. You can explore everything without connecting Instagram at all. |

## Quick start (non-technical version)

You need two things installed: **Node.js 20 or newer** (a free tool for
running JavaScript) and **Docker** (a free tool that runs the small
databases OpenDM uses). Both have simple installers for Mac and Windows.

Then, in a terminal:

```bash
git clone https://github.com/laithnas/opendm
cd opendm
npm install
npm run init -- --seed
npm run dev:all
```

Breakdown:

- `npm install` downloads the project's parts.
- `npm run init` sets everything up for you: it creates a `.env` file with
  secret keys generated just for you, starts the databases, and prepares
  them. The `--seed` part fills the workspace with sample data.
- `npm run dev:all` starts the app (a link opens or visit
  http://localhost:3000) and the background worker together.

Then click **Explore the demo** on the login screen and you are inside.
Everything on screen is sample data, so you can click around freely.

Already have your own databases running? Use `npm run init -- --no-docker`.
Want the empty version without sample data? Just drop the `--seed`.

You can run `npm run init` again any time. It only fills in what is
missing, and it never overwrites an existing `.env`.

## What `npm run init` actually does

1. **Creates `.env`** from `.env.example`, with fresh random secrets for
   `SESSION_SECRET`, `ENCRYPTION_KEY` and `META_VERIFY_TOKEN`. Never reuse
   example secrets; this is why the script generates new ones.
2. **Starts PostgreSQL and Redis** with Docker, and waits until both are
   healthy. PostgreSQL stores your data; Redis handles the work queue.
3. **Applies migrations**, which is just a tidy way of saying it brings the
   database up to date with the code.
4. **Seeds the demo workspace** when you pass `--seed`.
5. **Prints what to do next**: start commands, the login URL, and where to
   add Meta or AI credentials.

## Running the app day to day

```bash
npm run dev:all        # website plus worker, one command
```

One command is the normal way. If you prefer them separate:

```bash
npm run dev            # the website only
npm run worker         # the background worker only
```

A few other useful commands:

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Apply database changes after an update |
| `npm run db:seed` | Reset and refill the demo data |
| `npm run db:studio` | Browse the database visually |
| `npm run test` | Run the automated tests |
| `npm run typecheck` / `npm run lint` | Check the code is healthy |
| `npm run build` | Prepare a production version |

## Your first automation, step by step

1. Go to **Automations** and click **New automation**.
2. Pick a trigger. For the classic case: **Comment**.
3. Add a condition. Choose *keyword matches* and type `GUIDE`.
4. Add actions, in order:
   - **Public reply**: "Sent, check your DMs!"
   - **Send DM** with the message `Hey {{username}}, here is your guide: {{link}}`
   - **Tag contact** with "Guide Lead"
5. Click **Test** to see a dry run with no real messages sent.
6. Click **Save and activate**.

That is the whole loop. The builder shows the flow visually, so you can
always tell at a glance what an automation does. In messages you can use
placeholders like `{{username}}` and `{{link}}`; OpenDM fills them in per
person at send time.

## Connecting Instagram

OpenDM uses Instagram's official API. No scraping, no passwords, no browser
automation.

1. Create a free **Business** app at <https://developers.facebook.com/apps>.
2. Add the **"Manage messaging & content on Instagram"** use case, then open
   its **Customize** page — it has its own **Instagram App ID/Secret**,
   separate from the app's main one. Use those in `.env` (`META_APP_ID`,
   `META_APP_SECRET`, `META_VERIFY_TOKEN`). This part has a few sharp edges
   (a second redirect-URI field, an activation step, an exact scope list) —
   **[docs/meta-setup.md](docs/meta-setup.md) §1 walks through all of it in
   order; read it before doing this step**, it will save you real time.
3. Set up the webhook with the callback
   `https://your-host/api/webhooks/instagram` and the fields `comments` and
   `messaging`.
4. In the app, go to **Settings, Connections** and click
   **Connect real Instagram**.

A few honest notes about Instagram's rules, because OpenDM respects them
and tells you when it cannot do something:

- Instagram allows business DMs only inside a 7-day window after the
  person's last message. OpenDM checks this before sending and explains it
  clearly if a reply is blocked.
- Public comment replies work on any comment.
- Up to 3 quick-reply buttons can ride along with a DM.
- Follower status for the "followers only" condition requires extra Meta
  permissions. Without them, that condition fails safely and tells you why.

Step-by-step guide with screenshots-style detail:
[docs/meta-setup.md](docs/meta-setup.md).

## Do I need to understand the code to use it?

No. The app is fully usable through the browser. The technical bits exist
for people who want to extend or self-host deeply, and they are documented,
but you never have to touch them. If you encountered a wall, these docs are
where to look:

- 📄 [docs/setup.md](docs/setup.md), every setting explained
- 🏗️ [docs/architecture.md](docs/architecture.md), how the pieces fit
- 🚀 [docs/deployment.md](docs/deployment.md), going live on a server
- 🔐 [docs/security.md](docs/security.md), how your data is protected
- 🧩 [docs/automation-engine.md](docs/automation-engine.md), triggers,
  conditions and actions in detail
- 🛠️ [docs/troubleshooting.md](docs/troubleshooting.md), common problems
  and fixes

## Testing

```bash
npm run test            # 65 unit and integration tests
npm run typecheck
npm run lint
NODE_ENV=production npm run build
```

The tests cover the important failure paths: keyword matching, message
rendering, import/export validation, workspace isolation (one customer can
never see another customer's data), invite and role rules, click dedup and
webhook signature verification. The demo mode runs the exact same code path
as production, so you are testing the real thing.

## Going live

Three pieces: the website, the worker, and the databases.

- **Website:** `npm run build` then `npm start`. Any service that runs
  Node.js works: a small VPS, Railway, Fly.io, Render.
- **Worker:** `npm run worker` as its own process. Background work never
  depends on the website staying awake.
- **Databases:** managed PostgreSQL and Redis, or the included
  `docker compose` stack.

Production checklist, systemd examples, scaling notes:
[docs/deployment.md](docs/deployment.md).

## Common questions

**Is it free?** Yes. MIT license. You can use it, modify it, even sell a
hosted version.

**Do I need Meta credentials to try it?** No. Demo mode gives you a full
sample workspace in one click.

**Where is my data stored?** On your own server or computer. OpenDM keeps
only what the platform API legally provides (username, handle, tags you
add). Tokens are encrypted before they touch the database.

**Can I use it with other social networks?** Not yet. Instagram is the first
adapter. The provider layer is ready for Facebook, WhatsApp, TikTok,
LinkedIn and X, and those appear as roadmap items. OpenDM will never claim
support it does not have.

**Can I move my automations between computers?** Yes. Every automation can
be exported as a JSON file and imported anywhere, including a shared library
of community templates.

**Does OpenDM work with other tools?** Yes, through a webhook action. When
something happens, OpenDM can notify n8n, Make, Zapier or your own system
with a signed message it can verify.

## Screenshots

The demo workspace is built for this: one click, no credentials, realistic
data. Fresh captures are welcome as pull requests. The best views are the
Automations flow cards, the builder, the Inbox, a contact profile, and the
Analytics page.

## Roadmap

- Google login, passwords and two-factor authentication
- Self-serve billing with Stripe (paid workspaces)
- A proper post picker for "specific post" conditions, plus follower growth
  charts
- Adapters for Facebook, WhatsApp, TikTok, LinkedIn and X
- Automation version history and a live queue monitor page
- An n8n node package and a Zapier connector

## Contributing

Pull requests are welcome, and [CONTRIBUTING.md](CONTRIBUTING.md) is short.
It covers the code style, the traps to avoid, and how to run the checks
before submitting. Security issues are handled privately, see
[SECURITY.md](SECURITY.md).

## License

MIT, © Leonyx AI. Built by Laith Nasrallah / Leonyx AI. See
[LICENSE](LICENSE).

**Topics:** `instagram` `automation` `social-media` `manychat-alternative`
`nextjs` `typescript` `self-hosted` `creator-tools` `marketing-automation`
`open-source`