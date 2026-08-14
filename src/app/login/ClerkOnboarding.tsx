"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

type Screen =
  | "welcome"
  | "sign-in"
  | "sign-up"
  | "sign-up-verify"
  | "recover"
  | "recover-code"
  | "recover-new";

function splitName(fullName: string): { firstName: string; lastName?: string } {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") || undefined };
}

function localErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function PasswordField({
  autoComplete,
  error,
  id,
  label,
  onChange,
  value,
}: {
  autoComplete: string;
  error?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="h-12 rounded-[var(--radius-field)]">
        <InputGroupInput
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-sm"
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function ClerkOnboarding() {
  const router = useRouter();
  const { signIn, errors: signInErrors, fetchStatus: signInStatus } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpStatus } = useSignUp();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setReady(true), []);

  const busy = signInStatus === "fetching" || signUpStatus === "fetching";

  function changeScreen(next: Screen) {
    setError(null);
    setCode("");
    setScreen(next);
  }

  function goBack() {
    if (screen === "sign-in" || screen === "sign-up") changeScreen("welcome");
    else if (screen === "recover") changeScreen("sign-in");
    else if (screen === "recover-code") changeScreen("recover");
    else if (screen === "recover-new") changeScreen("recover-code");
    else changeScreen("sign-up");
  }

  async function finish(resource: typeof signIn | typeof signUp) {
    await resource.finalize({
      navigate: ({ session, decorateUrl }) => {
        const destination = session.currentTask ? "/login" : "/";
        const url = decorateUrl(destination);
        if (url.startsWith("http")) window.location.assign(url);
        else router.replace(url);
      },
    });
  }

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    const { error: clerkError } = await signIn.password({
      identifier: email.trim(),
      password,
    });
    if (clerkError) {
      setError("Sign-in did not complete. Check your details and try again.");
      return;
    }
    if (signIn.status === "complete") await finish(signIn);
    else if (
      signIn.status === "needs_second_factor" ||
      signIn.status === "needs_client_trust"
    ) {
      setError("This account needs another verification step. Continue through GRIDGO support.");
    }
  }

  async function continueWithGoogle() {
    setError(null);
    const { error: clerkError } = await signIn.sso({
      strategy: "oauth_google",
      redirectUrl: "/",
      redirectCallbackUrl: "/sso-callback",
    });
    if (clerkError) {
      setError("Google sign-in did not open. Try again.");
    }
  }

  async function submitSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Complete every field to create your account.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Enter the same password twice.");
      return;
    }

    const { firstName, lastName } = splitName(fullName);
    const { error: clerkError } = await signUp.password({
      emailAddress: email.trim(),
      password,
      firstName,
      lastName,
    });
    if (clerkError) {
      setError(localErrorMessage(clerkError, "Account creation did not complete. Try again."));
      return;
    }

    if (signUp.status === "complete") {
      await finish(signUp);
      return;
    }
    if (signUp.unverifiedFields.includes("email_address")) {
      const { error: verificationError } = await signUp.verifications.sendEmailCode();
      if (verificationError) {
        setError("GRIDGO could not send the verification code. Try again.");
        return;
      }
      changeScreen("sign-up-verify");
    }
  }

  async function verifySignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const { error: clerkError } = await signUp.verifications.verifyEmailCode({ code });
    if (clerkError) {
      setError("That verification code did not work. Check it and try again.");
      return;
    }
    if (signUp.status === "complete") await finish(signUp);
  }

  async function sendRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter the email address for your account.");
      return;
    }
    const { error: createError } = await signIn.create({ identifier: email.trim() });
    if (createError) {
      setError("Password recovery could not start. Check the email and try again.");
      return;
    }
    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) {
      setError("GRIDGO could not send the recovery code. Try again.");
      return;
    }
    changeScreen("recover-code");
  }

  async function verifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const { error: clerkError } = await signIn.resetPasswordEmailCode.verifyCode({ code });
    if (clerkError) {
      setError("That recovery code did not work. Check it and try again.");
      return;
    }
    changeScreen("recover-new");
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const { error: clerkError } = await signIn.resetPasswordEmailCode.submitPassword({
      password: newPassword,
    });
    if (clerkError) {
      setError(localErrorMessage(clerkError, "GRIDGO could not update the password."));
      return;
    }
    if (signIn.status === "complete") await finish(signIn);
  }

  const fieldError =
    error || signInErrors.global?.[0]?.message || signUpErrors.global?.[0]?.message;

  return (
    <div className="min-h-dvh bg-canvas px-4 py-4 md:px-8 md:py-8">
      <main
        id="main-content"
        className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-6xl overflow-hidden rounded-[var(--radius-xl)] border border-outline-subtle bg-surface shadow-sheet md:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]"
      >
        <section
          className={cn(
            "min-w-0 flex-col bg-surface-variant p-6 md:p-8 lg:flex lg:p-12",
            screen === "welcome" ? "flex" : "hidden",
          )}
        >
          <Logo />
          <div className="flex min-h-0 flex-1 items-center justify-center py-6">
            <Image
              src="/illustrations/gridgo-portal-workers.svg"
              width={816}
              height={766}
              priority
              alt="GRIDGO operations team coordinating work"
              className="h-auto max-h-[15rem] w-full max-w-[34rem] object-contain md:max-h-[22rem] lg:max-h-[26rem]"
            />
          </div>
          <div className="hidden max-w-xl lg:block">
            <p className="text-overline m-0 uppercase text-text-muted">GRIDGO portal</p>
            <p className="text-h3 m-0 mt-2 text-text-primary">
              One place for suppliers, Operations and Super Admin to move every order
              forward.
            </p>
          </div>
        </section>

        <section className="flex min-w-0 items-center justify-center p-6 md:p-10 lg:p-12">
          <div className="flex w-full max-w-md flex-col gap-8">
            {screen === "welcome" ? (
              <>
                <div className="flex flex-col gap-3">
                  <p className="text-overline m-0 uppercase text-text-muted">
                    Partner and operations portal
                  </p>
                  <h1 className="text-h1 m-0 text-text-primary">Keep every handoff moving.</h1>
                  <p className="text-body-lg m-0 text-text-secondary">
                    Your GRIDGO role opens the right workspace. Suppliers cannot create a
                    public portal role here.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Button variant="primary" fullWidth onClick={() => changeScreen("sign-in")}>
                    Sign in to portal
                  </Button>
                  <Button fullWidth onClick={() => changeScreen("sign-up")}>
                    Create a client account
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Go back"
                  className="self-start"
                  onClick={goBack}
                >
                  <ArrowLeft />
                </Button>

                {screen === "sign-in" ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <h1 className="text-h2 m-0 text-text-primary">Welcome back.</h1>
                      <p className="text-body-lg m-0 text-text-secondary">Let’s sign in.</p>
                    </div>
                    <form onSubmit={submitSignIn} className="flex flex-col gap-5" noValidate>
                      <FieldGroup>
                        <Field data-invalid={signInErrors.fields.identifier ? true : undefined}>
                          <FieldLabel htmlFor="clerk-email">Email</FieldLabel>
                          <Input
                            id="clerk-email"
                            name="email"
                            type="email"
                            autoComplete="username"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            aria-invalid={signInErrors.fields.identifier ? true : undefined}
                          />
                          <FieldError>{signInErrors.fields.identifier?.message}</FieldError>
                        </Field>
                        <PasswordField
                          id="clerk-password"
                          label="Password"
                          autoComplete="current-password"
                          value={password}
                          onChange={setPassword}
                          error={signInErrors.fields.password?.message}
                        />
                      </FieldGroup>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-end"
                        onClick={() => changeScreen("recover")}
                      >
                        Recover password
                      </Button>
                      {fieldError ? (
                        <p className="text-body m-0 text-error" role="alert">
                          {fieldError}
                        </p>
                      ) : null}
                      <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={!ready || busy}
                      >
                        {busy ? "Signing in…" : "Sign in"}
                      </Button>
                    </form>
                    <FieldSeparator>or continue with</FieldSeparator>
                    <Button fullWidth onClick={continueWithGoogle} disabled={busy}>
                      Continue with Google
                    </Button>
                    <p className="text-caption m-0 text-center text-text-muted">
                      Need a client account?{" "}
                      <Button variant="link" onClick={() => changeScreen("sign-up")}>
                        Sign up
                      </Button>
                    </p>
                  </div>
                ) : null}

                {screen === "sign-up" ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <h1 className="text-h2 m-0 text-text-primary">
                        Create your client account.
                      </h1>
                      <p className="text-body-lg m-0 text-text-secondary">
                        Suppliers and portal staff join by invitation only.
                      </p>
                    </div>
                    <form onSubmit={submitSignUp} className="flex flex-col gap-5" noValidate>
                      <FieldGroup>
                        <Field data-invalid={signUpErrors.fields.firstName ? true : undefined}>
                          <FieldLabel htmlFor="full-name">Full name</FieldLabel>
                          <Input
                            id="full-name"
                            name="fullName"
                            autoComplete="name"
                            required
                            value={fullName}
                            onChange={(event) => setFullName(event.target.value)}
                            aria-invalid={signUpErrors.fields.firstName ? true : undefined}
                          />
                          <FieldError>{signUpErrors.fields.firstName?.message}</FieldError>
                        </Field>
                        <Field data-invalid={signUpErrors.fields.emailAddress ? true : undefined}>
                          <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                          <Input
                            id="signup-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            aria-invalid={signUpErrors.fields.emailAddress ? true : undefined}
                          />
                          <FieldError>{signUpErrors.fields.emailAddress?.message}</FieldError>
                        </Field>
                        <PasswordField
                          id="signup-password"
                          label="Password"
                          autoComplete="new-password"
                          value={password}
                          onChange={setPassword}
                          error={signUpErrors.fields.password?.message}
                        />
                        <PasswordField
                          id="confirm-password"
                          label="Confirm password"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                        />
                      </FieldGroup>
                      {fieldError ? (
                        <p className="text-body m-0 text-error" role="alert">
                          {fieldError}
                        </p>
                      ) : null}
                      <div id="clerk-captcha" />
                      <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={!ready || busy}
                      >
                        {busy ? "Creating account…" : "Sign up"}
                      </Button>
                    </form>
                    <p className="text-caption m-0 text-center text-text-muted">
                      Already have an account?{" "}
                      <Button variant="link" onClick={() => changeScreen("sign-in")}>
                        Sign in
                      </Button>
                    </p>
                  </div>
                ) : null}

                {screen === "sign-up-verify" ? (
                  <VerificationForm
                    title="Check your email."
                    description={`Enter the verification code sent to ${email}.`}
                    code={code}
                    setCode={setCode}
                    onSubmit={verifySignUp}
                    error={fieldError}
                    ready={ready}
                    busy={busy}
                    action="Verify account"
                  />
                ) : null}

                {screen === "recover" ? (
                  <SimpleEmailForm
                    email={email}
                    setEmail={setEmail}
                    onSubmit={sendRecoveryCode}
                    error={fieldError}
                    ready={ready}
                    busy={busy}
                  />
                ) : null}

                {screen === "recover-code" ? (
                  <VerificationForm
                    title="Check your email."
                    description={`Enter the recovery code sent to ${email}.`}
                    code={code}
                    setCode={setCode}
                    onSubmit={verifyRecoveryCode}
                    error={fieldError}
                    ready={ready}
                    busy={busy}
                    action="Continue"
                  />
                ) : null}

                {screen === "recover-new" ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <h1 className="text-h2 m-0 text-text-primary">Choose a new password.</h1>
                      <p className="text-body-lg m-0 text-text-secondary">
                        Use a password you have not used for GRIDGO before.
                      </p>
                    </div>
                    <form onSubmit={submitNewPassword} className="flex flex-col gap-5">
                      <FieldGroup>
                        <PasswordField
                          id="new-password"
                          label="New password"
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={setNewPassword}
                          error={signInErrors.fields.password?.message}
                        />
                      </FieldGroup>
                      {fieldError ? (
                        <p className="text-body m-0 text-error" role="alert">
                          {fieldError}
                        </p>
                      ) : null}
                      <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={!ready || busy || !newPassword}
                      >
                        Save new password
                      </Button>
                    </form>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function VerificationForm({
  action,
  busy,
  code,
  description,
  error,
  onSubmit,
  ready,
  setCode,
  title,
}: {
  action: string;
  busy: boolean;
  code: string;
  description: string;
  error?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  ready: boolean;
  setCode: (value: string) => void;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 m-0 text-text-primary">{title}</h1>
        <p className="text-body-lg m-0 text-text-secondary">{description}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <FieldGroup>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="verification-code">Verification code</FieldLabel>
            <Input
              id="verification-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-body m-0 text-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={!ready || busy || !code.trim()}
        >
          {action}
        </Button>
      </form>
    </div>
  );
}

function SimpleEmailForm({
  busy,
  email,
  error,
  onSubmit,
  ready,
  setEmail,
}: {
  busy: boolean;
  email: string;
  error?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  ready: boolean;
  setEmail: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 m-0 text-text-primary">Recover your password.</h1>
        <p className="text-body-lg m-0 text-text-secondary">
          GRIDGO will send a recovery code to your account email.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <FieldGroup>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="recovery-email">Email</FieldLabel>
            <Input
              id="recovery-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-body m-0 text-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={!ready || busy}
        >
          Send recovery code
        </Button>
      </form>
    </div>
  );
}
