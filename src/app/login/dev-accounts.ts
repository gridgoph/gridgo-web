/**
 * Local-development sign-in convenience — and the reason it is shaped this way.
 *
 * This portal's sign-in page is public (`https://gridgo-dash.talasora.com/login`).
 * Listing account addresses there hands anyone who opens it the account list,
 * super admin included, before they have guessed a single password. Wrong
 * passwords do not make that safe: the addresses are the disclosure.
 *
 * So the addresses are not hidden behind a runtime flag, an environment
 * variable, or a comment — any of which still ships them inside the JavaScript
 * the browser downloads. `process.env.NODE_ENV` is substituted by the compiler,
 * so in a production build the expression below folds to a constant `[]` and
 * the literals are dropped from the emitted bundle entirely.
 *
 * `scripts/assert-no-account-addresses.mjs` greps the build output to prove it
 * and runs as part of `npm run build`, so a reintroduction fails the build
 * rather than the deploy.
 */
export type DevAccount = {
  /** Plain-language role — the accessible name of the control. */
  role: string;
  email: string;
  /**
   * The local demo API's password, so choosing an account is one tap. It rides
   * the same guard as the address, so it folds away with it; a production build
   * has no list to carry it. Never put a real credential here — the guard keeps
   * this out of the bundle, not out of the repository.
   */
  password: string;
};

/**
 * `demo` is the local demo API's shared password. It is written inline rather
 * than hoisted to a module constant so it sits *inside* the branch the compiler
 * discards — a top-level constant would survive the fold and rely on tree
 * shaking instead.
 */
export const DEV_ACCOUNTS: readonly DevAccount[] =
  process.env.NODE_ENV === "production"
    ? []
    : [
        {
          role: "Supplier partner",
          email: "supplier@gridgo.ph",
          password: "demo",
        },
        { role: "Operations", email: "ops@gridgo.ph", password: "demo" },
        { role: "Super Admin", email: "admin@gridgo.ph", password: "demo" },
      ];
