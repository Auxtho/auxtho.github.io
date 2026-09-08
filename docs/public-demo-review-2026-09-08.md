# Source-review walkthrough: publication review

Date: 2026-09-08

This release improves the public guided walkthrough. It does not deploy product APIs or introduce a new product capability.

## Review method and result

Three independent AI reviews considered financial workflow ownership, fintech product/integration, and regulatory/audit evidence. Their pre-publication findings were corrected and re-reviewed. This is not an endorsement or review by a real financial institution, fintech buyer or regulator, and is not buyer validation.

The release preserves:
- a fixed browser-only MAS review example;
- direct explanations of what Auxtho performs and what a person decides;
- separately identified product captures for result, Audit and reconstruction;
- immutable source data and accepted public-safe image bytes;
- no browser persistence, customer data, backend requests or external action.

## Findings closed

- Named the synthetic assurance report and the permitted test-receiver delivery request.
- Explained the report-change signal, one affected release and the unresolved notification rule.
- Clarified that reconstruction identifies which records were involved; recorded remediation commitments do not imply executed external remediation.
- Kept C1's interpretation to the demonstrated limit/period comparison and C2's correction to source attribution. The relevant source-scope qualifiers now appear alongside them.
- Added the frozen source-pack date beside the source, rather than presenting historical roles as a fresh determination of today's law.
- Kept the original C1/C2 statements and product screenshots intact.
- Distinguished one C2 exception from its two explanatory reasons.
- Named the separate C1 original-page example before it is expanded from C2/C3.
- Made the mobile receipt outcome and source-reopening detail reachable through visible field controls.
- Preserved keyboard focus and announced the revealed Audit panel.
- Localised Korean accessibility descriptions.
- Moved the cognitive-understanding caveat to the source note while preserving inspection acknowledgment requirements.
- Included the new demo tests in required CI commands and added a published-demo browser smoke test.

## Source semantics

The exact retained [MAS Notice](https://www.mas.gov.sg/-/media/mas-media-library/regulation/notices/trpd/notice-fsm-n05/mas-notice-fsm-n05.pdf), [MAS FAQ](https://www.mas.gov.sg/-/media/mas-media-library/regulation/faqs/trpd/faqs---notice-on-technology-risk-management/faqs---notice-on-trm/faq---notice-on-technology-risk-management.pdf) and [consultation paper](https://www.mas.gov.sg/-/media/mas-media-library/publications/consultations/trpd/2026/consultation-paper-on-proposed-amendments-to-notices-on-technology-risk-management.pdf) remain anchored to the frozen 29 August 2026 pack. Direct MAS document access was unavailable during the external recheck; exact retained copies and their hashes were used. No current-law recertification is claimed.

The source-scope review preserves the Notice paragraph 5 operations/customer-service qualifier and FAQ A10.1 critical-system-malfunction scope without representing an edited sentence as a newly verified product run.

The financial-workflow reading also consulted [Standard Chartered's practitioner-authored workflow explanation](https://www.sc.com/en/news/corporate-investment-banking/agentic-ai-in-asset-servicing/). It informed the task–reviewer–named-result structure only; it provides no evidence about Auxtho customer demand, superiority or operating effectiveness.

M134's authenticated inspection attestation supports the product explanation of review acknowledgment. The browser interaction does not create that authenticated record. The [public image manifest](../assets/demo/singapore-source-review/evidence-manifest.json) identifies each capture and its exact presentation boundary.

## Release validation

- 59 contract tests, including 8 demo contracts.
- 36 local browser tests, including 18 demo tests and 18 existing-site regressions.
- JavaScript syntax, workflow checks, Tailwind build and whitespace checks.
- Desktop/mobile screenshots in English and Korean; 320–1440px layout checks.
- Exact HTML, stylesheet, script and image hashes.
- Dependency audit: no high-severity finding; one existing low-severity build-tool dependency advisory remains.
- Required pre-merge CI and post-publication exact-byte/browser checks remain mandatory.

The reviewed HTML SHA256 is `cf119c1151e7ac3010c2684d4135bf70b974dde80d5a7e57d65772c28f2b54f0`.

The homepage hero, product implementation, controlling product records, existing public proof pages and LinkedIn surfaces are unchanged.
