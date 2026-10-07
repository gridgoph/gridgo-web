# Production days: Operations review

Before/after captures at desktop 1440×1000 and phone 390×844. The actual
`ListingReviewPanel` and service-line fact formatter were rendered in an isolated
local fixture page using the portal's own styles, with synthetic records and no
account data. The temporary fixture route was removed after capture.

The record carries 2 working days and a legacy 20-hour compatibility value.
Before: service fact `20h`, listing `Ready in 20 hours`.
After: service fact `2 working days`, listing `Ready in 2 working days`.
Both viewports passed the horizontal-overflow check.

`chrome-devtools-axi` returned its known missing-`pageId` error; captures used the
approved scratch Playwright fallback against the worker's own server on port
3176. No shared server was changed.
