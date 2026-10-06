# Shop and date groups

Screenshots use the actual `BasketPanel` component and existing design tokens on an isolated local Next development server. Synthetic fixtures represent two dates at the same anonymous shop; no customer records are shown. A temporary preview route was removed before committing. Receipt expansion uses an intercepted synthetic invoice response in the browser; actual payment, persistence, payout and refund integration is tested in the API PR.

- `before-phone.png` / `before-desktop.png`: the previous component labels the two groups as shops and omits their separate dates.
- `after-phone.png` / `after-desktop.png`: independent dates on both group cards and an accurate group count.
- `receipt-phone.png` / `receipt-desktop.png`: expanded combined receipt with the date in each section.

Viewports: 390×844 and 1440×1000, full-page captures. No horizontal page overflow at either size. The browser CLI hit its documented missing-page-ID error, so captures used the documented headless Chromium fallback. Browser and local server were closed after capture.
