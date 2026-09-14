# OpenCode Development Instructions

## 1. Source of Truth

The file:

`AI_Job_Application_Copilot_Master_PRD_v2.1.md`

is the source of truth for product requirements.

Read the complete PRD before implementation.

Do not duplicate the PRD requirements in this file.

If the PRD does not specify something, do not invent a requirement.

---

## 2. Inspect Before Implementing

Always inspect the existing repository before making architectural or implementation decisions.

Understand:

* existing project structure
* frontend
* backend
* browser extension
* database
* ORM
* authentication
* storage
* AI integration
* APIs
* existing automation
* existing tests
* existing dependencies
* existing build system
* existing UI framework
* existing styling approach

Reuse suitable existing code.

Do not rewrite working functionality without a clear reason.

---

## 3. Do Not Guess

This is a strict rule.

Never invent:

* API keys
* credentials
* secrets
* environment values
* user information
* website behavior
* undocumented APIs
* DOM structures
* selectors
* endpoints
* database structure
* platform behavior

If something is unknown, report it and ask the developer.

Use actual repository evidence whenever possible.

---

## 4. Existing Technology

Preserve the existing technology stack when it is suitable.

Do not silently replace:

* frontend framework
* backend framework
* database
* ORM
* build system
* styling system

If a replacement appears necessary, explain:

1. Current technology
2. Problem
3. Proposed replacement
4. Reason
5. Impact
6. Risks

Then ask for approval.

---

## 5. Configuration and Secrets

Never create fake credentials.

If configuration is missing, report the exact variable required and its purpose.

Example:

```text
Missing configuration:

AI_API_KEY
Purpose: API authentication for the configured AI provider.
Action required: Developer must provide/configure the value.
```

Never hard-code secrets.

Never commit secrets.

Never expose secrets in logs.

---

## 6. Website Behavior

Do not assume that a website behaves in a particular way.

For website automation:

* inspect the actual DOM
* inspect actual interaction behavior
* use actual test pages when available
* keep platform-specific logic inside adapters

If behavior cannot be verified, stop and ask.

---

## 7. Security

Never bypass:

* CAPTCHA
* human verification
* authentication
* anti-bot mechanisms
* security controls

If such a mechanism appears, implement the safe-stop/manual-intervention behavior defined in the PRD.

---

## 8. User Facts

Never fabricate user information.

The user's confirmed profile is the source of truth.

If required information is unavailable:

* do not guess
* do not let AI invent it
* pause the workflow
* request the required information

---

## 9. AI

AI is a fallback mechanism, not the default mechanism.

Follow the answer hierarchy defined in the PRD.

Do not send unnecessary user information to AI.

Do not allow AI to modify confirmed profile facts.

Do not assume an AI provider.

If the configured provider or required credentials are missing, stop and ask.

---

## 10. Implementation Process

Work incrementally.

For each phase:

1. Read the relevant PRD requirements.
2. Inspect affected existing code.
3. Explain the implementation approach.
4. Implement only that phase.
5. Run tests.
6. Run typecheck if available.
7. Run lint if available.
8. Run build if available.
9. Fix failures.
10. Report what changed.
11. Report remaining limitations.
12. Stop and wait when developer approval is required.

Do not implement future phases early unless explicitly requested.

---

## 11. Phase Boundaries

Respect the phase order defined in the PRD.

At the beginning of development:

**Phase 0 only.**

Do not automatically start Phase 1 after Phase 0.

Wait for developer approval.

---

## 12. Failure Handling

Prefer a safe failure over an incorrect action.

When an operation cannot be completed reliably:

```text
detect uncertainty
        ↓
stop/pause safely
        ↓
report the problem
        ↓
ask developer/user when required
```

Do not hide failures with:

* infinite retries
* blind retries
* arbitrary delays
* fallback guesses
* fabricated data

---

## 13. Code Quality

Prefer:

* small changes
* existing abstractions
* clear state transitions
* testable modules
* explicit error handling
* observable behavior
* meaningful logs
* deterministic behavior

Avoid unnecessary:

* rewrites
* abstractions
* dependencies
* architecture changes
* speculative features

---

## 14. Reporting

After each implementation phase, report:

```text
Phase:
Status:

Implemented:
- ...

Files changed:
- ...

Tests:
- ...

Typecheck:
- ...

Lint:
- ...

Build:
- ...

Configuration required:
- ...

Known limitations:
- ...

Questions/blockers:
- ...
```

Do not claim something works unless it has been verified.

---

## 15. Core Rule

When uncertain:

**DO NOT GUESS.**

Inspect the repository, inspect available evidence, or ask the developer.

The goal is not to produce code as quickly as possible.

The goal is to produce a reliable implementation that follows the PRD without silently inventing requirements or behavior.
