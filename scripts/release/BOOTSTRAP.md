# Public Site Release Bootstrap

This sequence is fail-closed. The site workflow reads platform and backend state but does not change repository protection, environment protection, Pages configuration, DNS, CDN configuration, or backend deployments.

## Identities

- `L`: exact currently live, previously approved legacy site SHA.
- `S`: exact candidate site SHA.
- `B`: exact migration bridge backend revision. Before `S` is published, `/api/verify/status` must report `backend_source_sha=B` and `public_site_source_sha=L`.
- `F`: exact final backend revision. After `S` passes site readback, it must report `backend_source_sha=F` and `public_site_source_sha=S`.
- `RL`: exact rollback backend revision. During rollback it must report `backend_source_sha=RL` and `public_site_source_sha=L`.

## Required Order

1. Before the site PR merges, an authorized platform administrator switches GitHub Pages `build_type` to `workflow`, enables Pages HTTPS enforcement, and leaves the exact reviewed repository, environment, reviewer, bypass, branch, force-push, deletion, and required-check controls in place.
2. The required `Verify Site Contract` check reads Pages state. It remains failed until step 1 is visible, preventing a merge from publishing through legacy branch mode.
3. Release backend bridge `B` separately. Confirm its status endpoint returns exact JSON identity for `B -> L`. Missing fields, `S`, or any other site/backend SHA is a release hold.
4. Set `compatible_backend_site_shas` to `JSON.stringify([L, S].sort())`. It must contain exactly those two distinct site SHAs in canonical lexical order.
5. Dispatch `Deploy Approved Pages Release` from `main` with exact `L`, `S`, `B`, `F`, `RL`, candidate compatibility, and rollback compatibility values matching the protected `github-pages` environment variables.
6. Authorization and package independently reread platform state, the latest successful Pages deployment, live `/release.json`, and bridge `/api/verify/status`. Both must prove live site `L` and bridge `B -> L`.
7. Package produces separately named `github-pages-candidate` and `github-pages-rollback` artifacts. Both are built from exact committed SHAs and have independent byte/provenance manifests.
8. One approved `github-pages` job publishes `S`, compares canonical and cache-busted bytes, verifies every absent path, and accepts only bridge `B -> L` against candidate compatibility `[L,S]`.
9. The job emits `BACKEND_FINALIZE_REQUIRED`, then waits for exact final backend `F -> S`. The release succeeds only after this readback passes.
10. Any candidate deploy, site readback, browser smoke, signal, or final backend readback failure selects `github-pages-rollback` inside the same approved job, emits `BACKEND_ROLLBACK_REQUIRED`, and verifies exact site `L` plus rollback backend `RL -> L`. The workflow remains failed after a successful restoration.

## Evidence

Retain the authorization snapshots, package authorization snapshot, signed candidate and rollback byte provenance, deployment readbacks, and transition signal artifacts. A signal artifact is an explicit handoff to the separately controlled backend release process; it is not evidence that the backend transition happened. Only the subsequent exact status readback closes that phase.
