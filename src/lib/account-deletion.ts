/**
 * Clerk session reverification before a deletion privacy request.
 * The password or emailed code stays with Clerk. GRIDGO receives only the
 * privacy request after the check succeeds.
 */

export type DeletionConfirmMethod = "password" | "email_code";

export function deletionConfirmMethod(user: { passwordEnabled?: boolean } | null | undefined): DeletionConfirmMethod {
  return user?.passwordEnabled === false ? "email_code" : "password";
}

export const DELETION_PASSWORD_MISSING = "Type the password you sign in to GRIDGO with.";
export const DELETION_CODE_MISSING = "Type the 6-digit code from the email.";
export const DELETION_PASSWORD_WRONG = "That password is not right. Type the one you sign in to GRIDGO with.";
export const DELETION_CODE_WRONG = "That code was not accepted. Check the 6 digits in the email, or send another code.";
export const DELETION_CODE_EXPIRED = "That code has expired. Send another code and use the new one.";
export const DELETION_TOO_MANY = "Too many tries. Wait a few minutes, then try again.";
export const DELETION_CHECK_FAILED = "GRIDGO could not confirm it is you. Check this browser's connection and try again.";
export const DELETION_CODE_SEND_FAILED = "GRIDGO could not email you a code. Check this browser's connection and try again.";
export const DELETION_NO_SESSION =
  "GRIDGO could not reach your sign-in to confirm it is you. Go back, then open Delete account again.";
export const DELETION_REQUEST_FAILED =
  "It is you, but the request did not reach GRIDGO. Check this browser's connection and try again.";

type Step = {
  status: string;
  supportedFirstFactors?: readonly { strategy: string; emailAddressId?: string; safeIdentifier?: string }[] | null;
};

export type ReverifySession = {
  startVerification: (params: { level: "first_factor" }) => Promise<Step>;
  prepareFirstFactorVerification: (params: { strategy: "email_code"; emailAddressId: string }) => Promise<Step>;
  attemptFirstFactorVerification: (
    params: { strategy: "password"; password: string } | { strategy: "email_code"; code: string },
  ) => Promise<Step>;
};

export type ConfirmOutcome = { status: "ok" } | { status: "refused"; message: string } | { status: "failed"; message: string };

function clerkCode(error: unknown): string | null {
  const errors = (error as { errors?: { code?: string }[] } | null)?.errors;
  return errors?.[0]?.code ?? null;
}

function refusalFor(error: unknown, wrong: string): ConfirmOutcome {
  const code = clerkCode(error);
  if (code === "form_password_incorrect" || code === "form_code_incorrect" || code === "verification_failed") {
    return { status: "refused", message: wrong };
  }
  if (code === "verification_expired") return { status: "refused", message: DELETION_CODE_EXPIRED };
  if (code === "too_many_requests" || code === "user_locked") return { status: "failed", message: DELETION_TOO_MANY };
  return { status: "failed", message: DELETION_CHECK_FAILED };
}

export async function confirmWithPassword(session: ReverifySession, password: string): Promise<ConfirmOutcome> {
  if (!password) return { status: "refused", message: DELETION_PASSWORD_MISSING };
  try {
    await session.startVerification({ level: "first_factor" });
    const step = await session.attemptFirstFactorVerification({ strategy: "password", password });
    return step.status === "complete" ? { status: "ok" } : { status: "failed", message: DELETION_CHECK_FAILED };
  } catch (error) {
    return refusalFor(error, DELETION_PASSWORD_WRONG);
  }
}

export async function sendDeletionCode(session: ReverifySession): Promise<{ status: "ok"; destination: string } | { status: "failed"; message: string }> {
  try {
    const started = await session.startVerification({ level: "first_factor" });
    const factor = started.supportedFirstFactors?.find((candidate) => candidate.strategy === "email_code" && candidate.emailAddressId);
    if (!factor?.emailAddressId) return { status: "failed", message: DELETION_CODE_SEND_FAILED };
    await session.prepareFirstFactorVerification({ strategy: "email_code", emailAddressId: factor.emailAddressId });
    return { status: "ok", destination: factor.safeIdentifier ?? "" };
  } catch (error) {
    if (clerkCode(error) === "too_many_requests") return { status: "failed", message: DELETION_TOO_MANY };
    return { status: "failed", message: DELETION_CODE_SEND_FAILED };
  }
}

export async function confirmWithCode(session: ReverifySession, code: string): Promise<ConfirmOutcome> {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return { status: "refused", message: DELETION_CODE_MISSING };
  try {
    const step = await session.attemptFirstFactorVerification({ strategy: "email_code", code: digits });
    return step.status === "complete" ? { status: "ok" } : { status: "failed", message: DELETION_CHECK_FAILED };
  } catch (error) {
    return refusalFor(error, DELETION_CODE_WRONG);
  }
}
