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

const DEMO_HINTS = [
  { email: "supplier@gridgo.local", role: "Supplier partner" },
  { email: "ops@gridgo.local", role: "Operations" },
  { email: "admin@gridgo.local", role: "Super Admin" },
];

export default function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("supplier@gridgo.local");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(homeForRole(user.role));
    }
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError(
            "Email or password is wrong. Use a demo account ending in @gridgo.local with password demo.",
          );
        } else {
          setError(
            `Sign-in failed (${err.code}). Confirm the demo API is running at the configured base URL.`,
          );
        }
      } else {
        setError(
          "Could not reach the API. Confirm it is running on http://127.0.0.1:8787 (or set NEXT_PUBLIC_API_URL).",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8">
      <main
        id="main-content"
        className="w-full max-w-md"
      >
        <div className="gg-card flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Logo />
            <h1 className="text-h2 text-text-primary m-0">Sign in</h1>
            <p className="text-body text-text-secondary m-0">
              Partner portal, Operations, and Super Admin share this sign-in.
              Your role decides which workspace you enter.
            </p>
          </div>

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
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="border-t border-outline-subtle pt-4">
            <p className="text-overline text-text-muted m-0 mb-2 uppercase">
              Demo accounts
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {DEMO_HINTS.map((hint) => (
                <li key={hint.email}>
                  <button
                    type="button"
                    className="w-full rounded-field border border-outline bg-surface px-3 py-2 text-left hover:bg-overlay-hover"
                    onClick={() => {
                      setEmail(hint.email);
                      setPassword("demo");
                      setError(null);
                    }}
                  >
                    <span className="text-body text-text-primary block">
                      {hint.role}
                    </span>
                    <span className="text-caption text-text-muted">
                      {hint.email} · password demo
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
