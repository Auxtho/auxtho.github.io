# Public Site Release Bootstrap

The public website is released independently from the application backend. The
workflow validates exact site source and rollback SHAs, packages reviewed public
files, publishes only after a manual dispatch, reads the deployed bytes back,
and restores the previous approved site artifact if candidate verification
fails.

## Identities

- `L`: exact currently live, previously approved site SHA.
- `S`: exact candidate site SHA merged to `main`.

The website release does not deploy, reconfigure, or identify backend
revisions. Backend health and artifact verification remain separate operating
concerns.

## Release Authority Modes

- `independent_review`: the protected environment contains one or more exact
  reviewer IDs and prevents self-review.
- `solo_founder`: the protected environment contains no simulated reviewer.
  The manual dispatch actor, triggering actor, workflow, branch, first run
  attempt, and fixed release purpose must match the protected founder identity.

Both modes retain a protected `main` branch or ruleset, the exact required
`Verify Site Contract` check, conversation resolution, force-push and deletion
blocks, HTTPS enforcement, exact release SHAs, and deterministic rollback.

## Required Order

1. Keep GitHub Pages in `workflow` mode with HTTPS enforcement enabled.
2. Merge the reviewed site PR only after `Verify Site Contract` succeeds on
   the exact head SHA.
3. Record the merged candidate SHA `S` and the currently live approved SHA
   `L`.
4. Set the protected `github-pages` environment values:
   - `PRODUCTION_VERIFY_SITE_CONTRACT_MODE`
   - `PRODUCTION_VERIFY_SITE_APPROVED_SHA=S`
   - `PRODUCTION_VERIFY_ROLLBACK_SITE_SHA=L`
   - the selected release-authority values.
5. For the one-time legacy migration, use `site_contract_mode=bootstrap` and
   `release_purpose=bootstrap-migration`. Bootstrap accepts only an exact
   legacy `/release.json` 404 together with the latest successful Pages build
   and deployment at `L`.
6. Dispatch `Deploy Approved Pages Release` from `main` with exact `S` and
   `L`. A rerun is not authorization; a failed attempt requires a fresh
   manual dispatch.
7. Authorization, packaging, and the deploy job immediately before publication
   independently reread repository controls, Pages state, the latest successful
   deployment, and the current live release identity.
8. Package separately named candidate and rollback artifacts from exact Git
   trees. Candidate assets remain content-addressed and privacy-bounded.
9. Publish the candidate, compare canonical and cache-busted bytes, verify
   retired paths and security headers, and run browser smoke checks.
10. If candidate publication or readback fails, restore the exact `L`
    artifact in the same approved job, verify its bytes, and leave the workflow
    failed so the incident remains visible.
11. After the first successful bootstrap release, change the protected contract
    mode to `normal`. Later releases require the live `release.json`, latest
    successful Pages build, latest successful deployment, and rollback SHA to
    agree exactly.

## Evidence

Retain actor-bound authorization snapshots, candidate and rollback byte
provenance, attestations, deployment readbacks, browser smoke evidence, and
rollback evidence. These records prove what public site bytes were approved and
published; they do not claim backend, customer, provider, or production-system
operation.
