# Open Dot

Personal assistant with agents, remote routines and the **Dot** mascot. It reviews your Gmail **read-only**, watches sites, GitHub and Vercel, keeps a private feed with sources and times, and talks to coding agents on your computer through the **Runner**, always with your approval of the exact content. Target recurring cost: zero within free tiers.

> **Beta.** Only what was validated is enabled; the rest is labeled “in development” or off. The interface and most docs are in Portuguese. [Português](README.md)

## Works today

| Area | Status |
|---|---|
| Google sign-in, single owner (`OWNER_GOOGLE_SUB` recommended) | Works |
| Gmail: 08:00/17:00 review, rule-based summary, sourced feed | Works, **read-only** (nothing is sent, archived or deleted) |
| Site monitor (HTTPS, up to 3), GitHub (read-only webhook), Vercel (read) | Works |
| Approvals | Exact content is shown and approved; **sending is still off** |
| Project memory and Passport | Per-project consent, encrypted, with retention; data, not authorization |
| Desktop Runner + Codex | Proposal → exact-content approval → applied in an isolated worktree. Validated on Intel macOS |
| Local commit of approved files | Only with a separate native confirmation; never push or merge |

## New in v0.3 (beta, unreleased)

Results depend less on the model and more on the team and the setup: Dot assembles the right team from the tools you already have, on your machine.

- **Team and recipes:** eight specialists (Product, Research, Design, Developer, QA, Architecture, Security, Documentation) and six ready-made recipes, data only, pinned by hash. The screen shows the suggested team, the reason for each choice and the call estimate before you confirm.
- **Approvals:** diff, changed files, timeline and the **real hash** of the content shown; Approve is enabled only when the hash matches.
- **Mail and News:** read-only (sender, subject, snippet); day summary by counting, no model; newsletters from your own inbox.
- **Companion Runner:** tabbed hub, menu-bar icon with a panel, computer health, processes the Runner started, Light/Balanced/Max profiles and signed updates with consent. Closed to the tray it stays idle (0.0–0.1% CPU measured on an Intel Mac).
- **Dot:** the active agent's color and reactions to real state (gaze, blush, sweat, panic), always with the reason in text.

| State | What |
|---|---|
| **Tested** | Web app and Worker (automated and browser tests), read-only Mail, Runner on Intel Mac (measured), 4 real calls to the new specialists (Codex and Claude Code, `docs/orquestrador/AVALIACAO_REAL.md`) |
| **No real test** | Claude Code in the Runner pipeline, end-to-end auto-update, Runner on Apple Silicon and Windows |
| **Simulated** | Engine vs. simple baseline, adaptive calibration, review → fix loop, read-only parallelism (`docs/orquestrador/AVALIACAO.md`). None showed a real gain; all three stay **off** |
| **Planned** | Codex analysis of e-mail, Gemini CLI and Cursor, own RSS, signed installers |
| **Blocked** | Running project tests in an isolated copy (no proven containment at zero cost) |

The number of agents and recipes is information, not a quality metric; the evidence is the evaluations.

## Install the Runner in two steps

1. **Install** from the release and check the published hash next to it. On macOS 15 or later the installer is not signed by Apple: the first time, use System Settings → Privacy & Security → **Open Anyway** (once).
2. **Connect:** the Runner shows a one-time code valid for a few minutes; confirm the code and the computer name on the Runner screen of your Open Dot.

Platforms: Intel macOS **tested**; Apple Silicon macOS and Windows **not tested on real machines**; Linux out of scope. Details (Portuguese): `docs/release/runner-instalacao.md`.

## Experimental or off

- **Claude Code in the Runner:** opt-in, off by default.
- **Cursor and Gemini CLI:** unavailable until the installed CLI offers a verifiable read-only mode.
- **Off by default:** calibration, fixer loop, read-only parallelism, skill suggestions, imported packages, launch at login, notifications, auto cleanup, update checks.
- **Never in this version:** project shell/tests by the Runner, automatic merge/commit/push, sending, replying to or archiving e-mail.

## Platform limits

- **Web/Worker:** Cloudflare Workers Free + Turso Free.
- **Installers are not signed or notarized.** The update signing key does not exist yet (it belongs to the maintainer); until then, new versions are downloaded from the release.

## Run

```bash
npm install          # Node 22.13+
npm run dev          # http://localhost:8787 (app + API + scheduler, local SQLite)
npm run check        # secret scan + typecheck + tests + build
```

Interface only, with labeled demo data: `npm run demo`. Your own cloud instance: [`docs/SETUP.md`](docs/SETUP.md) (Portuguese).

## Licenses

- **Code:** [AGPL-3.0-only](LICENSE), or a [commercial license](COMMERCIAL-LICENSE.md) if you do not want AGPL obligations. Pull requests are welcome for review; merging only happens after maintainer review (which may include a security and quality analysis), green CI and the author's express acceptance of the [CLA](CLA.md). See [CONTRIBUTING.md](CONTRIBUTING.md).
- **The Dot stays visible** in the official app and in this repository under its own **view-only** license ([LICENSE-DOT-ASSETS.md](LICENSE-DOT-ASSETS.md)): you may view it and run the official app unmodified; **copying, redistributing, modifying, AI training and commercial use are prohibited**. The AGPL does not apply to Dot files.
- **If you redistribute or fork, you must replace the Dot** (and the name). The repository ships the **Marcador**, a generic AGPL mascot, and `npm run check:without-dot` (also in CI) proves the app works without the Dot. See [`docs/FORKS.md`](docs/FORKS.md).
- **Trademark:** [TRADEMARK.md](TRADEMARK.md). Attributions: [NOTICE](NOTICE).

License texts are drafts pending legal review.

## Security

Report vulnerabilities privately, see [SECURITY.md](SECURITY.md). Never post tokens or personal data in issues.
