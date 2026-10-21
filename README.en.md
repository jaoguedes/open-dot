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

## Experimental or off

- **Claude Code in the Runner:** proposal-only driver implemented, **not validated against the real CLI**; off unless opted in (`OPEN_DOT_EXPERIMENTAL_DRIVERS=claude-code`).
- **Cursor in the Runner:** unavailable (its CLI cannot verifiably disable write and shell tools).
- **Off in this beta:** project shell/tests through the Runner, parallel agents, automatic merge/commit/push, sending email, Web Push, the Windows executor.
- **AI (Groq):** optional; private email only goes to the AI with confirmed zero data retention.

## Platform limits

- **Web/Worker:** Cloudflare Workers Free + Turso Free.
- **Runner:** tested on Intel macOS; ARM64 macOS and Windows only built in CI, without recent native validation. Executor disabled on Windows.
- **Installers are not signed or notarized.** Your OS will warn; check the published checksum.

## Run

```bash
npm install          # Node 22.13+
npm run dev          # http://localhost:8787 (app + API + scheduler, local SQLite)
npm run check        # secret scan + typecheck + tests + build
```

Interface only, with labeled demo data: `npm run demo`. Your own cloud instance: [`docs/SETUP.md`](docs/SETUP.md) (Portuguese).

## Licenses

- **Code:** [AGPL-3.0-only](LICENSE), or a [commercial license](COMMERCIAL-LICENSE.md) if you do not want AGPL obligations. Contributions require the [CLA](CLA.md).
- **The Dot stays visible** in the official app and in this repository under its own **view-only** license ([LICENSE-DOT-ASSETS.md](LICENSE-DOT-ASSETS.md)): you may view it and run the official app unmodified; **copying, redistributing, modifying, AI training and commercial use are prohibited**. The AGPL does not apply to Dot files.
- **If you redistribute or fork, you must replace the Dot** (and the name). The repository ships the **Marcador**, a generic AGPL mascot, and `npm run check:without-dot` (also in CI) proves the app works without the Dot. See [`docs/FORKS.md`](docs/FORKS.md).
- **Trademark:** [TRADEMARK.md](TRADEMARK.md). Attributions: [NOTICE](NOTICE).

License texts are drafts pending legal review.

## Security

Report vulnerabilities privately, see [SECURITY.md](SECURITY.md). Never post tokens or personal data in issues.
