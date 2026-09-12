# Shroom Diary

[简体中文](./README.md) · [Live demo](https://shroom.surfplus.xyz)

Shroom is an open-source, private-first AI journal for memory, reflection, and lightweight social learning. It does more than preserve what happened today: it helps people revisit their own evidence over time, revise earlier interpretations, retain useful experience, and notice how they are changing.

> The journal preserves reality. AI helps you look back. Interpretation, choice, and disclosure always remain with the user.

## Vision

> Remember without taking over; help without constant interruption.

Shroom's long-term vision is to become an AI companion that grows alongside each person. With privacy and human agency as hard boundaries, it should gradually understand a person's experiences, choices, relationships, open questions, and long-term goals, then offer help, reminders, and fresh perspectives at moments when they are genuinely useful.

Today, deliberate journaling is Shroom's primary memory interface. Over time, Shroom should evolve from intentional capture to low-friction, low-interruption collection of useful signals, and eventually into a companion capable of timely, proactive support. "Ambient" must never mean invisible surveillance: every automatic input must be visible, opt-in, pausable, inspectable, and deletable, while meaningful interpretations and actions remain subject to user confirmation.

## What Shroom includes

- **Cross-platform journaling** with text, private images, voice recordings, calendar views, archives, search, and paginated history.
- **High-accuracy transcription** where the recording is stored privately first and the transcript remains an editable draft.
- **Semantic journal memory** built on PostgreSQL and pgvector, with evidence-linked answers rather than unsupported summaries.
- **Living questions** that preserve dilemmas a single conversation cannot answer, accumulate user-confirmed journal evidence, and produce versioned interpretations with support, counterevidence, and explicit unknowns.
- **Longitudinal health observation** inside living questions, connecting mental states, physical changes, sleep, behavior, environment, measurements, tests, and journal photos against a personal baseline. It exports a clinician-ready summary while treating every output as a revisable clue—not a diagnosis.
- **Five observer seats** available to every new user, plus user-defined observers that can be edited and switched.
- **Shroom Cards** for reusable understandings, reminders, or perspectives derived from concrete experience. They are not tasks or slogans.
- **Life OS** connecting 20 editable long-horizon commitments to journal evidence, weekly focus, and review. More abstract cross-context decision principles remain evidence-backed drafts until the user publishes a revision.
- **Relationships and tasks** that turn diary evidence into versioned relationship events, commitments, and actionable follow-ups.
- **Controllable AI** with per-entry AI permission and model, token, price-snapshot, and estimated CNY cost records.
- **Lightweight social discovery** through public cards, resonance, favorites, references, and practice—without making private journals public.
- **Portable data** through personal export. Journal text remains the authoritative source; embeddings and analyses are derived data.

## Product boundaries

Shroom is not a medical diagnostic product and does not make final decisions for its users. Emotion assessments, relationship interpretations, and Life OS suggestions are inspectable hypotheses. Shroom does not silently collect browser history, automatically rewrite a person's principles after one analysis, or publish private content without confirmation.

See [docs/PRODUCT.md](./docs/PRODUCT.md) for the full product model, [docs/INQUIRIES.md](./docs/INQUIRIES.md) for the living-question lifecycle, [docs/LIFE_OS.md](./docs/LIFE_OS.md) for the boundary between cards and Life OS, [docs/LIFE_OS_LONG_TERM.md](./docs/LIFE_OS_LONG_TERM.md) for the long-term items module, and [server/REFLECTION_ARCHITECTURE.md](./server/REFLECTION_ARCHITECTURE.md) for the memory architecture.

## Architecture

```text
uni-app / Vue 2
  ├─ Web (H5)
  ├─ Android / iOS (app-plus)
  └─ Mini programs
          │ HTTPS / Bearer + rotating refresh token
          ▼
Node.js / Express API
  ├─ PostgreSQL + pgvector
  ├─ OpenAI-compatible LLM and embedding APIs
  ├─ Volcengine or compatible ASR (optional)
  └─ Private Tencent COS bucket (optional)
```

Repository layout:

- `src/`: uni-app client
- `server/src/`: standalone Shroom API
- `server/sql/`: ordered PostgreSQL migrations
- `server/test/`: Node.js unit, contract, and integration tests
- `docs/`: product, storage, and API documentation

## Local development

### Requirements

- Node.js 16.20 for the current legacy uni-app client toolchain
- Node.js 20+ for the API and tests under `server/`
- PostgreSQL 14+ with pgvector
- npm

### 1. Install dependencies

```bash
npm install
npm --prefix server install
```

Using nvm for the two toolchains is recommended: the client root follows `.nvmrc`, while the API and its tests require Node.js 20 or newer. App and mini-program builds from this older uni-app release may fail on very recent Node.js versions because they removed APIs used by its compiler plugins.

### 2. Create the database and run migrations

Create a dedicated Shroom database and a least-privilege database role, then apply every file in `server/sql/` in filename order:

```bash
for migration in server/sql/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

### 3. Configure the API

```bash
cp server/.env.example server/.env
```

At minimum, set `DATABASE_URL` and a strong random `TOKEN_SECRET`. LLM, embedding, ASR, and COS integrations are optional. Provider credentials must stay in server-side environment variables and must never be bundled into a client build or committed to Git.

### 4. Start the API and web client

Run these in separate terminals:

```bash
set -a
source server/.env
set +a
npm --prefix server start
```

```bash
npm run dev:h5
```

When using a non-production API, set `VUE_APP_SHROOM_ORIGIN` at build time, for example `http://localhost:3102`.

Other targets:

```bash
npm run build:h5
npm run build:app-plus
npm run build:mp-weixin
```

## Verification

```bash
npm --prefix server test
npm run build:h5
```

Database-backed integration and live smoke tests require explicit test environment variables and must never point at production data. See [server/README.md](./server/README.md) for the complete runtime configuration.

## Privacy and security

- New accounts write only to the standalone Shroom database. The application does not read legacy commerce, course, payment, or surfing data sources.
- User identity comes from the session or a scoped API token, never from a client-selected `userId`.
- Passwords are salted and hashed. Refresh tokens rotate and only their digests are stored.
- Private media uses short-lived signed URLs. Image uploads remove EXIF/GPS data and never keep a larger “compressed” output.
- AI can read only content owned by the current account and explicitly allowed for AI use.
- Never commit `.env` files, database exports, recordings, images, certificates, or real user data.

Please report security issues privately through the repository owner's GitHub contact instead of opening a public Issue with exploit details or user data.

## Contributing

Issues, product discussions, and pull requests are welcome. For substantial changes, describe the real user problem, privacy boundary, H5/App/mini-program interaction differences, and a verifiable acceptance path before implementation.

## License

[MIT](./LICENSE)
