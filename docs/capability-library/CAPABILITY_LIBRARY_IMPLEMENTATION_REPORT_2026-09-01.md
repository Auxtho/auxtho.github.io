# Auxtho Capability Library — Local Implementation Candidate

Date: 2026-09-01 KST
Status: `LOCAL_CANDIDATE_COMPLETE / EXTERNAL_PUBLICATION_HELD`

> Historical status note: this document records the pre-deploy candidate at
> the moment it was completed. It was superseded for publication status by
> `CAPABILITY_LIBRARY_LIVE_PUBLICATION_RECORD_2026-09-01.md` after PR #36
> deployed source `d262386a10f30443aff1417dc9c5de8cedeca1f7`. The original
> candidate facts and external-effect counts below remain unchanged as
> historical evidence.

## 1. Canonical public-site source and deploy lineage

- Repository: `Auxtho/auxtho.github.io`
- Candidate base: remote `main` commit
  `4b44323725177beae50cdb8a4864ec8b6e2a6c1d`
- Base tree: `8d79be0c1e57f3b0f5562feb9ab83abc5d22433c`
- Base merge: PR #35, `Recenter homepage on controlled release`
- Base CI: GitHub Actions run `33429963197`, success
- Base approved Pages release: GitHub Actions run `33430151842`, success
- Live homepage readback matched that message-rebalanced source before work began.
- The older `ceeffc4` / PR #34 and `319a940` worktrees were inspected only as lineage evidence and were not edited.
- Implementation branch:
  `codex/capability-library-public-candidate-v1`
- Implementation occurred in an independent clone under the current writable
  Codex workspace. The dirty product workspace remained read-only.

## 2. Implemented public routes

1. `/capabilities/`
2. `/capabilities/exact-source-traceability/`
3. `/capabilities/regulatory-source-pack/`
4. `/capabilities/ai-review-exception-queue/`
5. `/capabilities/decision-receipts-audit-history/`
6. `/capabilities/incident-reconstruction-recovery/`
7. `/capabilities/ardamire-defense-layer/`

The homepage hero and company position are unchanged. Only the homepage's two
navigation labels now route to the Capability Library. LinkedIn and every
external profile remain unchanged.

## 3. Five-minute product chain

The library collectively reveals the controlling product sequence:

```text
approved source and AI-assisted work
-> selected claims and prepared exceptions
-> reviewer inspection, correction and final decision
-> exact-version authorization and one permitted action
-> receipt, UNKNOWN or reconciliation
-> durable history, reconstruction and recovery
```

Each module answers:

1. What document or job is involved?
2. What does Auxtho perform?
3. What does the person decide?
4. What is visible on screen?
5. What record or state remains?

## 4. Product revalidation

Exact terminal product source:

- commit: `1cca2c79d92ffba686883dd0ef3a8c4eb08f7c1b`
- tree: `652839fd434bdd0741f2bd94a60844f65056eba7`

Current focused results:

- M121-M125 backend owners/verifiers: `115 passed`
- M133-M138 receipt/history backend focus: `41 passed`
- terminal App TypeScript: `PASS`
- M121 Source Pack local App/API browser: `1 passed`
- M122 exception correction/readback local browser: `1 passed`
- M123 incident reconstruction local browser: `1 passed`
- M125 integrated product path local browser: `1 passed`
- M133-M138 receipt/history browser owner with source preview enabled:
  `45 passed`
- focused lint for M121, M122, M123 and M125 changed files: `PASS`
- current full-tree lint is not a promotion signal; the exact terminal
  `AuditTrailView` currently triggers two `react-hooks/set-state-in-effect`
  findings under the installed Next/ESLint rule set. Product source was not
  changed in this website task. The browser owner and TypeScript remain green.
- M138's frozen real local Firestore Emulator query/cursor proof remains the
  exact terminal evidence. No GCP index deployment or hosted readback was
  inferred.

## 5. Public-safe visual evidence

- New screenshots use bounded component crops, not scaled full-page images.
- Every used image is listed with bytes, dimensions, SHA-256, source module,
  crop, redaction posture and synthetic/local boundary in:
  `assets/capabilities/manifest.json`.
- The existing M120 exact-source crop retains the yellow geometry highlight,
  page 3 source wording, source role, and public source identity.
- The new M121-M125 and M133-M138 crops came from the exact terminal product
  tree or a public-safe synthetic projection of the exact Audit component.
- A raw M123 event timeline capture was deleted because it exposed raw event
  payloads and internal reason codes.
- The M125 Console handoff capture was deleted because tenant and internal
  operations boundaries remain private.
- The M121 technical-contract identity crop was deleted because the buyer
  story did not require internal profile identifiers.
- Desktop `1440px` and mobile `390px` screenshots were visually inspected for
  the library index and the first-priority modules. Headings, questions,
  records, captions and navigation remain readable without overlap.
- Product crops retain their natural pixel scale inside bounded horizontal
  inspection frames. On narrow screens a reviewer can swipe the frame or open
  the hash-pinned image directly instead of reading a miniature screenshot.

## 6. Claim and source control

The module-by-module claim/source/status table is:
`docs/capability-library/CAPABILITY_CLAIM_SOURCE_STATUS_2026-09-01.csv`.

The copy uses direct verified verbs: `find`, `show`, `route`, `preserve`,
`bind`, `block`, `record`, `reconstruct`, and `recover`. Proof boundaries
appear once in each source note rather than weakening every headline.

## 7. Defensibility and hardening note

### Publicly explainable after approval

- user-visible workflow and product screens;
- exact source, page, wording and geometry inspection;
- source roles, eligibility and lifecycle state;
- prepared exceptions and preserved human corrections;
- accountable decision and exact-version authorization;
- one permitted action, receipt, UNKNOWN and reconciliation;
- bounded Audit history, reconstruction and recovery behavior;
- dated, hash-pinned proof and current verification counts.

### Private by default

- source code and unique implementation mechanics;
- prompts that expose proprietary mechanics;
- security and attack internals;
- authentication, tenant, IAM and separation implementation details;
- private provenance, raw logs, secrets, customer data and unpublished
  benchmarks;
- unpromoted Operator Board, Agent Wallboard and Ardamire Agent/Watch surfaces.

### Verified core contracts to harden next

1. Close the current `AuditTrailView` hook-lint findings without weakening the
   receipt/history contract.
2. Preserve reproducible clean App/API packaging from the exact M138/M140
   lineage.
3. Maintain one launcher for the founder-readable five-minute composed path.
4. Add a deterministic verifier for the Capability Library capture manifest,
   image references and sentence-to-source table.
5. Keep exact-version authorization, receipt/UNKNOWN, bounded history and
   reconstruction owner tests green across packaging changes.

The moat is the connected implementation, correctness owners, versioned
source/rule packs, decision/action contracts, audit depth, integration learning
and accumulated proof—not secrecy of the product idea.

### Attractive features that wait for Buyer evidence

- a new jurisdiction or Source Pack;
- a new Workflow Profile or artifact type;
- buyer-owned rules, approval matrices or delegated-authority assumptions;
- a new connector or real external-effect adapter;
- customer-effectiveness or measured work-reduction claims.

Issuer-authenticated cross-organization handoff, recipient verification or
acknowledgement, correction/revocation exchange, and a regulator view remain
`PLANNED`. They are excluded from the library and public navigation until a
future terminal Freeze and separate promotion gate.

## 8. Final public-site validation

- release and control contracts: `51 passed`
- deterministic static build: `PASS`
- recursive JavaScript contract: `11 files checked`
- workflow contract: `2 workflows / 22 actions parsed`
- desktop/mobile Playwright readback: `18 passed`
- metadata, hash binding, internal links, fragments, alt text, focus, contrast,
  page overflow and responsive reflow: `PASS`
- planned cross-organization claim scan on public surfaces: `0 matches`

## 9. Remaining publication gates

1. Founder/Human/XO review of the exact local pages and screenshots.
2. Close or explicitly accept the product-source Audit lint hardening item.
3. Create no public commit-to-main, push, PR, merge, deploy, LinkedIn edit or
   external post without a separate approval.
4. After an approved deployment, record URL, bytes, hash, deployed commit and
   live desktop/mobile readback.

Ardamire publication remains limited to the existing modelled scenario. The
actual Agent/Watch implementation still requires a clean terminal Freeze and
separate public-use decision.

## 10. Founder review URLs

When the local static review server is running on port `4177`:

- `http://127.0.0.1:4177/capabilities/`
- `http://127.0.0.1:4177/capabilities/exact-source-traceability/`
- `http://127.0.0.1:4177/capabilities/decision-receipts-audit-history/`
- `http://127.0.0.1:4177/capabilities/incident-reconstruction-recovery/`
- `http://127.0.0.1:4177/capabilities/regulatory-source-pack/`
- `http://127.0.0.1:4177/capabilities/ai-review-exception-queue/`
- `http://127.0.0.1:4177/capabilities/ardamire-defense-layer/`

## 11. External effects

```text
push: 0
PR: 0
merge: 0
deploy: 0
LinkedIn changes: 0
messages or connection requests: 0
cloud/customer/provider mutation: 0
```
