# Task 4 Report — Browser PDF redemption and cleanup

## Result

Implemented the production browser boundary for one-time protected PDF delivery. The client now creates an authenticated download grant through the callable endpoint, redeems it with a fresh Firebase ID token and limited-use App Check token, validates and bounds the PDF response, triggers the exact filename from a temporary object URL, and revokes that URL.

## Files

- `assets/js/commerce-client.js`
- `tests/commerce-browser.spec.mjs`
- `tests/storefront-html.test.mjs`

## TDD evidence

- RED: the two initial real-boundary browser cases timed out waiting for the download button because the production boundary still threw `Protected delivery runtime is not released`; 13 existing cases passed.
- GREEN: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx playwright test tests/commerce-browser.spec.mjs` — 17 passed.
- GREEN: `npm run test:storefront:unit` — 21 passed.
- GREEN: `git diff --check` — clean.

## Security and behavior evidence

- Grant callable uses ordinary App Check plus a Firebase ID token.
- Stream request obtains a fresh ID token and limited-use App Check token and uses `credentials:'omit'`.
- Only HTTP 200 with exact `application/pdf` is accepted.
- Declared and streamed bodies are bounded to 80 MiB; empty, malformed, mismatched, and oversized bodies fail closed.
- The detached link downloads as `Home Inspection Study Guide.pdf`; its temporary object URL is revoked after the click is dispatched.
- Browser coverage verifies no raw grant, test token, or private path reaches URL/history-visible state, local storage, session storage, DOM, or console.
- A failed or ambiguous stream is not automatically retried. A later user click requests a fresh grant.
- No message, payment, invoice, provider, environment-flag, catalog, tax, or release-setting mutation was made.

## Deviations

None. The implementation remains within Task 4 scope.
