# Page Channel Policy

## Purpose
Define official vs founder channel boundaries for public pages.

## Official Channel Rules
- Public pages (`index.html`, `verify.html`) must expose company channels only.
- LinkedIn label on public pages must be `Company LinkedIn (Official)`.
- External links opened in new tabs must use `rel="noopener noreferrer"`.

## Founder Channel Rules
- story 페이지의 개인 LinkedIn은 Founder LinkedIn 라벨로 유지(공식 채널 아님).
- Founder channel links are allowed only on founder-context pages such as `story.html`.

## Verification Page Rule
- verify는 검증/증빙용 페이지이므로 개인 채널 노출 금지(공식 채널만 허용).

## Validation Checklist
- Confirm no personal LinkedIn URL exists on `index.html` and `verify.html`.
- Confirm company LinkedIn URL is present on both public pages.
- Build/preview and verify no broken links.
- Confirm `verify.html?report=R123&h=abc` still reveals QR verification details.
