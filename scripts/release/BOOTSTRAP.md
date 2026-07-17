# Public Site Release Bootstrap

This sequence is fail-closed. The site workflow reads platform and backend state but does not change repository protection, environment protection, Pages configuration, DNS, CDN configuration, or backend deployments.

## Identities

- `L`: exact currently live, previously approved legacy site SHA.
- `S`: exact candidate site SHA.
- `B`: exact migration bridge backend revision. Before `S` is published, `/api/verify/status` must report `backend_source_sha=B` and `public_site_source_sha=L`.
- `F`: exact final backend revision. After `S` passes site readback, it must report `backend_source_sha=F` and `public_site_source_sha=S`.
- `RL`: exact rollback backend revision. During rollback it must report `backend_source_sha=RL` and `public_site_source_sha=L`.

## Release Authority Modes

- `independent_review`: the protected environment contains one or more exact reviewer IDs and prevents self-review.
- `solo_founder`: the protected environment contains no required-reviewer rule. Instead, the manual dispatch actor ID, actor login, triggering actor, workflow ref, main ref, first run attempt, and fixed public release purpose must exactly bind to the protected founder identity. Pull requests, the exact required check, conversation resolution, administrator enforcement, force-push/deletion blocks, fixed SHAs, backend transition proof, and rollback remain mandatory.

`solo_founder` is an explicit one-person operating exception, not a claim of independent review. Set `PRODUCTION_VERIFY_RELEASE_AUTHORITY_MODE=solo_founder`, `PRODUCTION_VERIFY_ENVIRONMENT_REVIEWER_IDS=[]`, and bind `PRODUCTION_VERIFY_SOLO_FOUNDER_ACTOR_ID` plus `PRODUCTION_VERIFY_SOLO_FOUNDER_ACTOR_LOGIN` to the single accountable operator. Move to `independent_review` when a genuinely separate reviewer becomes available.

## Required Order

1. Before the site PR merges, an authorized platform administrator switches GitHub Pages `build_type` to `workflow`, enables Pages HTTPS enforcement, and leaves the exact reviewed repository, release-authority mode, environment, bypass, branch, force-push, deletion, pull-request, and required-check controls in place.
2. The required `Verify Site Contract` check reads Pages state. It remains failed until step 1 is visible, preventing a merge from publishing through legacy branch mode.
3. Release backend bridge `B` separately. Confirm its status endpoint returns exact JSON identity for `B -> L`. Missing fields, `S`, or any other site/backend SHA is a release hold.
4. Set `compatible_backend_site_shas` to `JSON.stringify([L, S].sort())`. It must contain exactly those two distinct site SHAs in canonical lexical order.
5. For this one-time migration only, set the protected `PRODUCTION_VERIFY_SITE_CONTRACT_MODE` environment variable to `bootstrap`. Dispatch `Deploy Approved Pages Release` from `main` with `release_purpose=bootstrap-migration`, `site_contract_mode=bootstrap`, exact `L`, `S`, `B`, `F`, `RL`, candidate compatibility `[L,S]`, and rollback compatibility `[L]` values matching the protected `github-pages` environment variables. A rerun is not authorization; a failed attempt requires a fresh manual dispatch. Bootstrap accepts only an exact legacy `/release.json` 404 together with latest successful Pages build/deployment SHA `L`; it does not accept a different or malformed response.
6. Authorization, package, and the deploy job immediately before its first mutation independently reread platform state, the latest successful Pages build/deployment, live `/release.json`, and bridge `/api/verify/status`. All three must prove live site `L` and bridge `B -> L`. The first two environment jobs use `deployment: false`, so they cannot replace the previous successful deployment identity merely by requesting approval.
7. Package produces separately named `github-pages-candidate` and `github-pages-rollback` artifacts. Candidate files use content-addressed script, stylesheet, and rendered-image URLs. Bootstrap rollback is built from the actual exact `L` Git tree, preserves its legacy files including PDF/archive/core/lineage paths, records that the candidate evidence manifest did not exist at `L`, and adds only release identity/provenance metadata needed for deterministic readback.
8. One approved `github-pages` job publishes `S`, compares canonical and cache-busted bytes, verifies every absent path, and accepts only bridge `B -> L` against candidate compatibility `[L,S]`.
9. The job emits `BACKEND_FINALIZE_REQUIRED`, then waits for exact final backend `F -> S`. The release succeeds only after this readback passes.
10. A candidate deployment or candidate readback/browser failure occurs before the final-backend signal and therefore selects `github-pages-rollback` inside the same approved job, emits `BACKEND_ROLLBACK_REQUIRED`, and verifies exact site `L` plus rollback backend `RL -> L`. The workflow remains failed after a successful restoration.
11. If candidate site `S` and bridge `B -> L` were already verified but final backend `F -> S` is not proven within the bounded readback, the workflow fails closed without rolling the site back. This preserves the already verified compatibility state `[L,S]` and avoids racing a late backend finalization into `site=L, backend=F -> S`.
12. After a successful `F -> S` readback, change the protected site contract mode to `normal`. Every later release requires the live `release.json` source SHA, latest successful Pages build, latest successful deployment, and approved rollback SHA to agree exactly; bootstrap mode is not reused.

## Evidence

Retain the actor-bound release authorization, authorization snapshots, package authorization snapshot, signed candidate and rollback byte provenance, deployment readbacks, and transition signal artifacts. A solo-founder authorization proves accountable manual action, not independent review. A signal artifact is an explicit handoff to the separately controlled backend release process; it is not evidence that the backend transition happened. Only the subsequent exact status readback closes that phase.
