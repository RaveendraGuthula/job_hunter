# ARCHITECTURE.md — AI Job Application Copilot

**Phase 0 — Repository Analysis & Target Architecture**
**Version:** 1.1 (Phase 0 deliverable, corrected after developer review)
**Date:** September 12, 2026
**Status:** Awaiting developer approval. No product functionality implemented.

Source of truth: `AI_Job_Application_Copilot_Master_PRD_v2.1.md`. Process rules: `OPENCODE_INSTRUCTIONS.md`.

---

## 1. Repository Analysis — Current State

### 1.1 Repository contents

The working directory `D:\FULL STACK\pesonal_projects\job_hunter` contains the PRD/instructions documents plus an existing `.env` development configuration file:

| File | Role |
|---|---|
| `AI_Job_Application_Copilot_Master_PRD_v2.1.md` | Master product specification (source of truth) |
| `AI_Job_Application_Copilot_Master_PRD_v2.1.pdf` | PDF copy of the same PRD |
| `OPENCODE_INSTRUCTIONS.md` | OpenCode development process rules |
| `.env` | Existing development configuration (backend only; secret values not displayed) |

### 1.2 What exists vs. what does not

| Concern | Status |
|---|---|
| Source code (`extension/`, `backend/`) | **None** |
| Git repository | **Not initialized** |
| Build system / package manifests | **None** (no `package.json`, `pyproject.toml`, `requirements.txt`, etc.) |
| Frontend UI stack | **None** |
| Backend stack | **None** |
| Database / ORM / migrations | **None** |
| Authentication | **None** |
| Storage / object storage wiring | **None** |
| AI integration | **None** |
| Tests / lint / typecheck config | **None** |
| Environment config | **`.env` present** for backend configuration; **CI: none** |
| Existing automation / extensions | **None** |

### 1.3 Conclusion

This is a **greenfield project**. There is no existing code to preserve, reuse, or refactor. All components named in the PRD must be built new. The PRD's "preserve existing stack" rules therefore reduce to: *agree the stack up front with the developer* (done in §3), and *change it later only with approval*.

---

## 2. Approved Stack Decisions (developer-approved during Phase 0)

| Decision | Approved choice | PRD basis |
|---|---|---|
| Extension frontend/build | **React 18 + TypeScript + Vite**, hand-managed Manifest V3 | §32 (`.tsx` components, service worker) |
| Extension styling | **CSS isolated from host-page CSS** (Shadow DOM / `all: initial` strategy — finalization at Phase 1) | §32 |
| Backend | **Python FastAPI** | §33 |
| Database / ORM | **PostgreSQL (provider: Neon) + SQLAlchemy 2.0 (async) + Alembic** | §33–§35 |
| AI provider | **Groq** — model **`llama-3.3-70b-versatile`** | §19–§22, §38 |
| AI SDK policy | **Groq Python SDK directly** for ordinary calls; **Agno** (`agno.models.groq`) only where agent/tool/structured-output capability is required. **No Node.js / Vercel AI SDK.** FastAPI is the only runtime; PRD API contract unchanged | §33, §42 |
| Resume storage | **Local filesystem** (configurable path) for MVP; object storage deferred | §38 |
| Auth | **Email + password, JWT** (bcrypt/argon2-hashed passwords, `JWT_SECRET`) | §34, §38 |

### 2.1 Database layer (final)

```text
FastAPI
   ↓
SQLAlchemy 2.0 Async
   ↓
PostgreSQL
   ↓
Neon (managed PostgreSQL provider)
```

Neon provides managed PostgreSQL; the application database layer targets standard PostgreSQL. **Not introduced:** Supabase, Drizzle, Prisma, any Node.js database runtime, a second ORM, or SQLite as the primary development database. The backend remains Python + FastAPI.

### 2.2 Rejected / deferred options
- **Vercel AI SDK / Node sidecar** — rejected by developer: AI SDK is TypeScript-only and conflicts with the PRD's Python backend. Not introduced.
- **Supabase / Drizzle / Prisma / Node.js database runtime / second ORM** — rejected; PostgreSQL on Neon via SQLAlchemy 2.0 async is the only database layer.
- **SQLite as the primary development database** — rejected; development targets PostgreSQL on Neon.
- **Object storage (S3/R2/MinIO) and Supabase Storage** — deferred; MVP resume storage is the local filesystem.
- **OAuth/SSO** — deferred; email+password JWT only for MVP.

---

## 3. Target Architecture — Component Overview

```text
┌────────────────────────────── Browser Extension (MV3, React 18 + TS + Vite) ─┐
│  popup/App.tsx ── Profile │ JobCard │ MatchScore │ Apply │ Review panels     │
│  content scripts: state-machine, form-engine, chatbot-engine, message-parser │
│  adapters: base → naukri │ linkedin │ indeed │ greenhouse │ lever │ workday  │
│            │ ashby │ generic (platform-specific logic ONLY)                  │
│  background/service-worker.ts, utils/{api,storage}.ts                       │
└──────────────┬───────────────────────────────────────────────────────────────┘
               │ HTTPS (JSON) — PRD §34 API contract
┌──────────────▼────────────────────────── Backend (Python) ────────────────────┐
│  FastAPI app                      │                                          │
│  api/{auth,profile,resume,jobs,   │  services/{resume_parser, job_extractor, │
│        questions,applications,    │  job_matcher, question_classifier,       │
│        analytics}.py              │  answer_engine, ai_service,              │
│                                   │  application_service}                    │
│                                   │                                          │
│  SQLAlchemy 2.0 async ─ PostgreSQL (Neon) ─ Alembic migrations               │
│       │                │                  │                                   │
│  Local filesystem (resumes)   Groq SDK ── llama-3.3-70b-versatile            │
│                                └── Agno (only for agent/tool/structured-out) │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Extension module mapping (from PRD §32, unchanged)
- `src/background/service-worker.ts` — app/message routing, API proxy, state persistence bridge.
- `src/content/content.ts` — injection entry, MutationObserver bootstrap, host-page isolation.
- `src/content/application-agent.ts` — orchestrator driving the state machine.
- `src/content/form-detector.ts` / `chatbot-detector.ts` — application-UI detection (FORM, CHATBOT, REDIRECT, UNKNOWN).
- `src/content/message-parser.ts` — new bot-message extraction, no re-processing of extension's own answers (§13, §17).
- `src/content/question-classifier.ts` — intent catalog (§15) + normalization + duplicate fingerprints.
- `src/content/interaction-engine.ts` — filling/selecting/submitting across input types.
- `src/content/state-machine.ts` — PRD §11 state machine incl. terminal/interruption states.
- `src/adapters/*` — site-specific extraction/interaction/completion (Naukri MVP; `GenericAdapter` fallback).
- `src/components/*` — `JobCard`, `MatchScore`, `ApplyPanel`, `ReviewPanel`, `ProfilePanel` (React).
- `src/popup/App.tsx` — popup UI (profile, tracker, controls).
- `src/utils/{api,storage}.ts` — backend client (`utils/api.ts`) and local persistence (`utils/storage.ts`).

### 3.2 Backend module mapping (from PRD §33, unchanged)
- `app/main.py` — FastAPI app, routers, CORS for extension, middleware.
- `app/api/{auth,profile,resume,jobs,questions,applications,analytics}.py` — PRD §34 endpoints.
- `app/services/{resume_parser,job_extractor,job_matcher,question_classifier,answer_engine,ai_service,application_service}.py`.
- `app/models/` — SQLAlchemy models for the 15 PRD §35 tables; `app/schemas/` — Pydantic contracts; `app/database/` — engine/session/migrations for PostgreSQL on Neon; `app/tests/`.

### 3.3 AI service split (per developer decision)
- `ai_service.answer()` uses **Groq Python SDK** for the standard AI fallback path (§19 contract shape: `answer` / `confidence` / `requires_user_confirmation` / `reason`).
- **Agno** (`Agent(model=Groq(id="llama-3.3-70b-versatile"), output_schema=..., use_json_mode=True)`) is reserved for cases needing tools/agents or strict Pydantic-validated structured output. Decision to route a particular call through Agno vs. raw Groq is an implementation-level rule set documented in `ai_service` and revised during Phase 8.
- Minimal-context, fact-validation, confidence, sensitive-question policy, and cost/latency tracking live in `answer_engine.py` / `ai_service.py` per PRD §19–§22.
- **Phase gating:** AI fallback is Phase 8 only. The existing `GROQ_API_KEY` does not move AI work earlier. Phase 1 establishes only the configuration structure needed for future AI integration. The Groq key must remain **backend-only** and must never be exposed to or shipped into the browser extension.

### 3.4 Browser/Backend Responsibility Boundary (explicit rule)

**The browser extension owns browser interaction.** Extension content scripts and the application agent are exclusively responsible for:

```text
DOM inspection
MutationObserver
form detection
chatbot detection
clicking, typing, selecting
submission interaction
page state
CAPTCHA detection
login-required detection
manual takeover
pause/resume
Emergency STOP
```

**The backend owns application services and data processing.** Backend services exclusively own:

```text
user profile
resume processing
job data
job matching
question classification services
answer engine
AI fallback
applications
application events
analytics
AI usage
database
authentication
```

The backend must **never** attempt to directly manipulate the user's browser DOM. Browser state is the extension's domain; the backend is reached only through the PRD §34 API.

### 3.5 Duplicate Protection — Two Layers

Duplicate protection is split into two distinct layers; the database is **not** the only protection mechanism.

**Layer 1 — Browser/runtime (handled locally by the extension):**
```text
message IDs
normalized message text
DOM fingerprints
question fingerprints
processed-message state
```
This prevents repeated processing caused by MutationObserver events, DOM re-rendering, React rendering, and DOM replacement — before the extension sends repeated requests to the backend.

**Layer 2 — Persistent/cache (backend database):**
```text
question_cache
application state
application_answers
```
These provide persistence and reusable answers, plus durability across sessions/refresh.

---

## 4. Database Model Plan (PRD §35)

**15 tables** in PostgreSQL (on Neon) via SQLAlchemy 2.0 async with Alembic migrations — `users`, `profiles`, `skills`, `experience`, `education`, `preferences`, `resumes`, `jobs`, `job_matches`, `applications`, `application_answers` (§35.1 fields), `application_events` (§35.2 fields), `question_intents`, `question_cache`, `ai_usage`.

Notes:
- `application_answers` records `answer_source` (PROFILE/RULE/CACHE/DERIVED/AI/USER, §18), `was_ai_generated`, `user_modified`.
- `application_events` stores the §36 event taxonomy.
- `applications` carries tracker statuses `SAVED, READY, IN_PROGRESS, REVIEW_REQUIRED, APPLIED, INTERVIEW, REJECTED, WITHDRAWN, FAILED` (§37).
- `question_cache` implements the persistent/cache duplicate-protection layer and reusable answers (§17); the browser/runtime layer is described in §3.5.
- `ai_usage` backs §22 cost/token/latency tracking and `GET /api/usage/ai`.
- Migration tooling: Alembic (first migration produced in Phase 1).

### 4.1 Database Abstraction Principle

The application is designed around **PostgreSQL**, not around a proprietary database-provider API:

```text
Application
   ↓
SQLAlchemy
   ↓
PostgreSQL
   ↓
Neon
```

A future change of PostgreSQL *provider* can be made without changing the fundamental database technology. This does **not** guarantee portability to arbitrary database engines: database-specific schema, types, SQL, constraints, indexes, and migrations may require changes when switching to a different engine. The intended portability is primarily **between PostgreSQL providers**.

---

## 5. API Contract (PRD §34 — unchanged, verbatim)

```
POST /api/profile          GET /api/profile          PATCH /api/profile
POST /api/resumes
POST /api/jobs/analyze     POST /api/jobs/match
POST /api/questions/classify   POST /api/questions/answer
POST /api/applications     GET /api/applications
GET /api/applications/{id} PATCH /api/applications/{id}
POST /api/applications/{id}/events   GET /api/applications/{id}/events
GET /api/usage/ai
```

No contract changes are required by the approved stack beyond documenting the authentication endpoints the PRD already allows under `api/auth.py`.

### 5.1 Authentication API (Phase 1 — explicit contract)

Approved approach: **email + password → secure password hash → JWT**. No OAuth/SSO in the MVP. Endpoints live in `api/auth.py`.

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register` | Create a user account from email + password; return a JWT on success. |
| `POST /api/auth/login` | Validate email + password against the stored hash; return a JWT on success. |
| `GET /api/auth/me` | Return the authenticated user's identity for the provided JWT. |

Password storage uses a proper hashing implementation (e.g. argon2/bcrypt via a maintained library, selected in Phase 1). Precise request/response payloads are defined in Phase 1 schemas. No OAuth/SSO is introduced.

---

## 6. Frontend / UI Stack Assessment (PRD §32)

**Evidence:** no existing frontend in the repository. **Assessment:** PRD §32 prescribes the *component structure* (React `.tsx`), not the tooling, and requires developer approval for any stack choice (given there is no existing stack to preserve).

**Approved:**
- **React 18 + TypeScript** for popup and injected panel components.
- **Vite** as the bundler with a **hand-managed Manifest V3** (`manifest.json` referencing `dist/` outputs; multi-entry build for `background` service worker, `content` scripts, and `popup`).
- **Styling isolated from host-page CSS** — content-script UI rendered through Shadow DOM or equivalent isolation so host CSS cannot leak in (§32). Exact isolation mechanism confirmed in Phase 1.
- **Popup = React root** (`src/popup/App.tsx`); **injected panels** = `src/components/*` mounted by content scripts.

**Deferred to Phase 1 confirmation (non-material):**
- CSS approach inside the extension (plain CSS modules vs. Tailwind inside the isolated scope).
- Vite content-script build configuration (single vs. multiple entries).

---

## 7. Dependency Inventory (planned, not yet installed)

### 7.1 Extension (`extension/`)
- `react` 18, `react-dom` 18, `@types/react`, `@types/react-dom`
- `typescript`
- `vite`
- `@types/chrome` (MV3 typings)
- Tests: `vitest`, `@testing-library/react`, `jsdom`
- Build: Vite multi-entry (background/content/popup) + hand-authored `manifest.json`

### 7.2 Backend (`backend/`)
- `fastapi`, `uvicorn[standard]`
- `sqlalchemy[asyncio]`, `asyncpg`, `alembic`
- `pydantic`, `pydantic-settings`
- `python-multipart` (resume uploads)
- Auth: `pyjwt`, password hashing lib (bcrypt/argon2 via `pwdlib` or `passlib[bcrypt]` — exact lib fixed in Phase 1)
- Resume parsing (Phase 3 selection): PDF (`pypdf` / `pdfplumber` / `PyMuPDF` — final choice Phase 3), DOCX (`python-docx`)
- AI: `groq`, `agno`
- `httpx` (extension-facing/backend HTTP as needed)
- Tests: `pytest`, `pytest-asyncio`, `httpx`/`TestClient`, `respx` (mock AI/HTTP)
- Optional: `sentry-sdk`

### 7.3 Package managers (finalized)
- Extension: **`npm`**
- Backend: **`uv`**

---

## 8. Required Configuration

Per PRD §38 + approved stack. An existing `.env` in the repository provides the development configuration (including `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`). No secret values are displayed, echoed, logged, or committed here; the application loads them through the backend configuration system (e.g. `pydantic-settings`). `.env` must be covered by `.gitignore` (created in Phase 1); `.env.example` is created with variable names only.

| Variable | Purpose | Status |
|---|---|---|
| `APP_ENV` | `development` / `production` environment flag | Value needed at Phase 1 (default `development` acceptable for dev) |
| `API_BASE_URL` | Backend base URL that the extension calls | Value needed before Phase 1 end |
| `DATABASE_URL` | Neon PostgreSQL connection string | **Present in `.env`**; loaded via backend config; value not displayed |
| `JWT_SECRET` | Signing secret for auth tokens | **Present in `.env`**; loaded via backend config; value not displayed |
| `AI_PROVIDER` | `groq` | Fixed by decision |
| `GROQ_API_KEY` | Groq API authentication | **Present in `.env`**; **backend-only**, never exposed to the extension; consumed in Phase 8 only |
| `AI_MODEL` | `llama-3.3-70b-versatile` | Fixed by decision |
| `STORAGE_PROVIDER` | `local` (MVP) | Fixed by decision |
| `STORAGE_BUCKET` | Reserved for future object storage | Not required for MVP |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | Reserved for future object storage | Not required for MVP |
| `STORAGE_LOCAL_PATH` | Local directory for uploaded resumes | Value needed before Phase 3 |
| `SENTRY_DSN` | Error monitoring | Optional; leave unset unless provided |
| Extension permissions/hosts | `naukri.com` (MVP) + backend origin; sensitive-site safety handled app-internally, host list expanded per adapter phase | Confirmed during Phase 1/4 |

---

## 9. Risks, Unknowns & Open Questions

1. **Greenfield risk (High).** No prior code, so every module is new; schedule reflects Phase 1–11 scope.
2. **Naukri DOM unverifiable from repo (High).** PRD §30 forbids assuming selectors/APIs/DOM. No Naukri selectors, undocumented APIs, or chatbot-DOM assumptions are made until Phase 4. Naukri automation is **not** implemented or claimed until Phase 4 inspects a real Naukri application flow. Adapter health/versioning (§46) applies.
3. **Chatbot vs. form detection on Naukri (High).** Actual Naukri application UI mix (form vs. conversational) is unknown and must be validated before the engines are declared working.
4. **CAPTCHA/login/anti-bot states (High).** Must map to safe-stop + manual-resume (§28). Cannot be tested without real Naukri access.
5. **AI fact safety (High).** Groq fallback output must be validated against confirmed profile facts (§20) and the sensitive-question gate (§21); `requires_user_confirmation` enforced.
6. **Duplicate-submission protection (Medium).** MutationObserver re-renders + refresh/resume must not double-submit (§17, §27). Two-layer design: browser/runtime protection in the extension plus persistent/cache protection in the database (§3.5). Design finalized in Phase 7.
7. **CSS isolation (Medium).** Extension UI must not be corrupted by host CSS and must not leak into host page (§32).
8. **MV3 constraints (Medium).** Service-worker lifecycle, content-script messaging, and CSP restrictions shape extension design (Phase 1).
9. **PostgreSQL availability (Resolved).** PostgreSQL on Neon is finalized; `DATABASE_URL` is present in `.env`. Connectivity verified during Phase 1 setup.
10. **Secrets (Resolved for development).** `JWT_SECRET` and `GROQ_API_KEY` exist in `.env`. Values are never displayed, echoed, logged, committed, or copied into code/docs (§38, §39). `.gitignore` covers `.env` (Phase 1).
11. **Cost/latency (Medium).** `llama-3.3-70b-versatile` usage is budgeted per §22 (per-application caps, caching, minimal context). Key is configured; real cost is measured in Phase 8. AI work stays Phase 8.
12. **Agno vs. Groq SDK routing (Low).** Rule set is implementation-level; keep Agno usage narrow to avoid framework overhead.
13. **Local storage retention/deletion (Medium).** MVP needs a retention/deletion policy for resumes/profiles/events per §39 before production.
14. **Windows dev environment (Low).** Uvicorn/process management and resumable paths on Windows — handled at Phase 1 setup.
15. **No repository hygiene currently.** Git not initialized; initialize in Phase 1 with `.gitignore` covering `.env`, `dist/`, uploads, caches.

---

## 10. PRD Requirement → Component Mapping

| PRD § | Requirement | Component |
|---|---|---|
| §7 | User profile (source of truth), confirmed facts | `backend profile` API + `ProfilePanel`, `profiles` + related tables |
| §8 | Resume PDF/DOCX parsing, review/correct, manual fallback | `resume_parser.py`, `api/resume.py`, `ProfilePanel`, `resumes` table |
| §9 | Job extraction, adapters own site-specific logic | `adapters/*`, `utils/api.ts`, `jobs` table, `GET/JOBS/Analyze` |
| §10, §5 | Explainable job matching | `job_matcher.py`, `MatchScore`, `job_matches` table |
| §11, §13 | State machine + chatbot | `state-machine.ts`, `application-agent.ts` |
| §12 | Form engine | `form-detector.ts`, `interaction-engine.ts` |
| §14 | Message/Question model | `message-parser.ts` schemas |
| §15 | Intent catalog | `question_classifier.ts`, `question_classifier.py` |
| §16 | Multiple-question handling | `message-parser.ts` |
| §17 | Cache & duplicate protection | Two layers (§3.5): extension browser/runtime fingerprints + processed-message state; persistent layer via `question_cache` / `application_answers` |
| §18 | Answer sources | `application_answers.answer_source` |
| §19–§22 | AI fallback contract, fact safety, sensitive policy, cost controls | `ai_service.py`, `answer_engine.py`, `ai_usage` table |
| §23–§24 | Override/pause/resume/STOP, review UI | `ReviewPanel`, `ApplyPanel`, state machine |
| §25–§28 | Completion/safe stop, timeouts, CAPTCHA | state machine + engines |
| §29–§31 | Adapter architecture, Naukri MVP | `src/adapters/*` |
| §32 | Extension UI stack (approved React18+TS+Vite) | §3.1 |
| §33–§34 | Backend + API contract | §3.2–§5 |
| §35 | DB model | §4 |
| §36–§37 | Events + tracker | `application_events`, `applications`, Tracker UI |
| §38–§39 | Env vars, privacy/permissions | §8; permission model minimal |
| §44–§46 | Testing, metrics, adapter health/versioning | `app/tests/`, extension `vitest`, fixtures, health/version on adapters |

---

## 11. Implementation Plan (Phase 0 → Phase 11)

Incremental, gated, matching PRD §43. Each phase ends with tests, typecheck, lint, build where applicable, and this doc's status updated.

1. **Phase 0 — Repository Analysis (THIS DOCUMENT, COMPLETE).** Awaiting developer approval.
2. **Phase 1 — Foundation:** git init + `.gitignore` covering `.env`, `dist/`, uploads, caches; scaffold `extension/` (Vite + React 18 + TS + MV3 manifest, CSS-isolation mechanism) and `backend/` (FastAPI, SQLAlchemy 2.0 async → PostgreSQL on Neon, Alembic, `pydantic-settings` reading the existing `.env`, CORS); `.env.example`; auth foundation (email+password JWT: `register`/`login`/`me` per §5.1); health endpoints. **No longer blocked by config** — `DATABASE_URL` and `JWT_SECRET` are in `.env`. AI stays Phase 8; Phase 1 sets up only the configuration structure for future AI integration.
3. **Phase 2 — Profile:** profile CRUD, preferences, validation, editing UI (PRD §7).
4. **Phase 3 — Resume:** PDF/DOCX extraction, parsing lib selection, review/correct UI, bounded retries, `RESUME_PARSE_FAILED`, manual entry. **Needs** `STORAGE_LOCAL_PATH`.
5. **Phase 4 — Job Detection + Naukri:** inspect the real Naukri application flow before writing anything; no selectors/APIs/DOM are assumed before inspection; implement Naukri adapter extraction + app-UI detection; host permissions. Requires representative Naukri access to verify DOM/selectors before any selectors are committed.
6. **Phase 5 — Matching:** explainable deterministic score (§10).
7. **Phase 6 — Form Engine:** detection, control classification, profile mapping, autofill, validation, audit, review UI (§12).
8. **Phase 7 — Chatbot Engine:** state machine, message extraction, segmentation, intents, duplicate protection, MutationObserver, pause/resume/STOP, timeout/retry, completion detection, safe stops (§13).
9. **Phase 8 — AI Fallback:** Groq SDK (+ narrow Agno use), minimal-context prompts, structured responses, fact validation, confidence, sensitive-question gate, cost controls, caching, usage tracking. `GROQ_API_KEY` already exists in `.env` (backend-only). AI functionality is **not** implemented before Phase 8.
10. **Phase 9 — Tracker:** records, statuses, history, events, analytics UI (§37).
11. **Phase 10 — Additional Adapters:** LinkedIn, Indeed, then reusable ATS adapters (Greenhouse/Lever/Workday/Ashby) via `GenericAdapter` (§31) — only after Naukri stability.
12. **Phase 11 — Reliability:** fixtures, integration/regression/security/perf tests, failure recovery (§44).

---

## 12. Phase 0 Corrections — State After Developer Review

The following corrections were applied per developer review (version 1.0 → 1.1):

1. Database finalized: **PostgreSQL on Neon** + SQLAlchemy 2.0 async + Alembic; no Supabase/Drizzle/Prisma/Node.js DB runtime/second ORM/SQLite-as-primary (§2.1, §2.2, §4.1).
2. Database table count corrected to **15** — all PRD §35 entities are enumerated in §4.
3. Package managers finalized: Extension **`npm`**, Backend **`uv`** (§7.3).
4. Authentication API contract documented explicitly: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` (§5.1).
5. Browser/backend responsibility boundary made explicit — extension owns browser interaction, backend owns application services/data (§3.4).
6. Existing `.env` acknowledged as the configuration source without exposing any secret values; `.gitignore` will cover `.env` (§1, §8).
7. AI remains Phase 8 despite `GROQ_API_KEY` presence; key is backend-only and never exposed to the extension (§3.3, §8, §11).
8. Resume storage remains **local filesystem**; no object storage introduced (§2.2).
9. Database abstraction principle documented: PostgreSQL-centric, provider-portable between PostgreSQL providers, **not** a guarantee of cross-engine portability (§4.1).
10. Duplicate protection split into browser/runtime and persistent/cache layers (§3.5).
11. Naukri remains unverified; no selectors/APIs/chatbot-DOM are invented (§9, §11).

**Remaining Phase 0 decision for developer:**
- Approve this corrected document as the master architecture reference before Phase 1 begins.

**Status: PHASE 0 COMPLETE (corrected). No product functionality implemented. Awaiting developer approval before Phase 1.**