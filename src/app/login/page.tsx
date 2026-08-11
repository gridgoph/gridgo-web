"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/Logo";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { homeForRole } from "@/lib/routes";

import { DEV_ACCOUNTS } from "./dev-accounts";

/**
 * Sign-in failures say what went wrong and what to do next — and nothing about
 * who holds an account here. A message that names an address, a role or an
 * internal error code turns a failed guess into a free hint.
 */
function signInErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Could not reach GRIDGO. Check your connection and try again.";
  }
  if (err.code === "invalid_credentials") {
    return "Email or password is wrong. Check both and try again.";
  }
  if (err.kind === "unauthorized" || err.kind === "forbidden") {
    return "This account cannot open the portal. Ask GRIDGO Operations to check it.";
  }
  if (err.kind === "server") {
    return "Sign-in is unavailable right now. Try again in a moment.";
  }
  return "Sign-in did not complete. Try again.";
}

export default function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Until React has attached `onSubmit`, a click would submit the form
   * natively — a GET to this same URL that writes the password into the
   * address bar and browser history. The control stays disabled until then.
   */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace(homeForRole(user.role));
    }
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(signInErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <main
        id="main-content"
        className="grid w-full max-w-md gap-8 lg:max-w-4xl lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:gap-12"
      >
        {/*
          Which site am I on? `gridgo-dash.talasora.com` and the public
          `gridgo.talasora.com` landing site are different places, and this is
          the only screen that can say so before someone types a password.
        */}
        <section className="flex flex-col gap-4">
          <Logo />
          <h1 className="text-h2 lg:text-display text-text-primary m-0">
            Partner and operations portal
          </h1>
          <p className="text-body-lg text-text-secondary m-0 lg:max-w-sm">
            One sign-in for suppliers, Operations and Super Admin. Your role decides which
            workspace opens.
          </p>
        </section>

        <div className="gg-card flex flex-col gap-6">
          <h2 className="text-h3 text-text-primary m-0">Sign in</h2>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FieldGroup>
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error ? true : undefined}
                />
              </Field>

              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error ? true : undefined}
                />
              </Field>
            </FieldGroup>

            {error ? (
              <p className="text-body text-error m-0" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={!ready || submitting}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-caption text-text-muted m-0">
            Locked out? Ask GRIDGO Operations to check your account.
          </p>

          {/*
            Local development only. `DEV_ACCOUNTS` is a constant empty list in a
            production build, so this renders nothing and the addresses are not
            in the bundle at all. See `./dev-accounts.ts`.
          */}
          {DEV_ACCOUNTS.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-outline-subtle pt-4">
              <p className="text-overline text-text-muted m-0 uppercase">
                Local development
              </p>
              <div className="flex flex-wrap gap-2">
                {DEV_ACCOUNTS.map((account) => (
                  <Button
                    key={account.email}
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword("");
                      setError(null);
                    }}
                  >
                    {account.role}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
