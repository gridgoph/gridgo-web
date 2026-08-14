# Clerk authentication design QA

## Scope and evidence

- Reference: `/home/kali/firstmate/data/gridgo-clerk-impl/login-reference.png` (1465 x 944).
- Combined comparison: `/tmp/gridgo-clerk-qa/comparison/reference-vs-gridgo.png` (1170 x 1688). The reference crops are the top row; GRIDGO implementations are the bottom row.
- Implemented states: `/tmp/gridgo-clerk-qa/welcome-mobile-final.png`, `/tmp/gridgo-clerk-qa/sign-in-mobile-final-empty.png`, and `/tmp/gridgo-clerk-qa/sign-up-mobile-final.png` (390 x 844, DPR 1, light).
- Additional checks: `/tmp/gridgo-clerk-qa/welcome-desktop.png` and `/tmp/gridgo-clerk-qa/sign-up-desktop-v2.png` (1440 x 900, DPR 1), plus `/tmp/gridgo-clerk-qa/welcome-mobile-dark-v3.png` (390 x 844, DPR 1, dark).
- Browser: Chrome through `chrome-devtools-axi`. Checked navigation, keyboard focus order, password visibility control, recovery navigation, responsive layout, light/dark presentation, and console output. The only console message was Clerk's expected development-key warning.

## Visual comparison

The implementation preserves the reference's three-part progression, dominant illustration-first welcome state, compact form hierarchy, back navigation, full-width form actions, social sign-in separator, and account-switching links. Intentional GRIDGO adaptations are:

- GRIDGO action yellow replaces the reference's coral palette.
- Satoshi, GRIDGO semantic tokens, the GRIDGO logo, and the supplied Lukasz workers illustration replace the food-app identity.
- Public sign-up is explicitly client-only; suppliers, Operations, and Super Admin do not receive a public role selector.
- Desktop uses a portal-appropriate split layout while mobile retains the reference's single-column rhythm.
- Google is the only public social option; Facebook is not part of GRIDGO authentication.

## Findings and resolutions

- P1 — Mobile sign-in and sign-up initially extended below the viewport because the desktop illustration remained visible. Resolved by reserving the illustration panel for `lg` viewports on form states.
- P2 — The mobile welcome screen initially placed the secondary action below the first viewport. Resolved by compacting the welcome illustration and hiding desktop-only illustration copy below `lg`.
- No remaining P0, P1, or P2 visual defects were found in the final comparison.

## Accessibility checks

- Logical `h1` structure and associated form labels are present.
- Back, password visibility, recovery, primary, Google, and account-switch controls have accessible names.
- Keyboard navigation reaches the recovery control in logical order and the existing global focus treatment remains visible.
- Controls retain the GRIDGO 44 x 44 minimum target.
- Passwords start masked and can be shown and hidden without replacing the field.
- Layout fits 390 x 844 without horizontal overflow or clipped primary actions.

## Final result

passed
