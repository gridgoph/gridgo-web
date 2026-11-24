/**
 * Confirming the shop's mobile with a texted code (guided sign-up, gridgo-api
 * `docs/SUPPLIER_SIGNUP_API.md`). Mirrors the shop app's `lib/clerkPhone.ts`.
 *
 * GRIDGO does not trust a typed number: it reads Clerk's own record and
 * refuses the shop step until that number is verified on this sign-in. So the
 * number is added to the Clerk user and confirmed there. A number already
 * verified needs no code at all.
 *
 * Clerk can have phone numbers switched off for the whole instance. That is
 * not the shop's mistake, so it is its own outcome (`unavailable`) and the
 * step offers a way round it instead of a dead end.
 */

export type ClerkPhoneNumber = {
  id: string;
  phoneNumber: string;
  verification?: { status?: string | null } | null;
  prepareVerification: () => Promise<unknown>;
  attemptVerification: (params: { code: string }) => Promise<unknown>;
};

export type ClerkPhoneUser = {
  phoneNumbers: ClerkPhoneNumber[];
  createPhoneNumber: (params: { phoneNumber: string }) => Promise<ClerkPhoneNumber>;
  reload?: () => Promise<unknown>;
};

export type PhoneStart =
  | { status: "verified" }
  | { status: "code_sent"; phone: ClerkPhoneNumber }
  /** This Clerk does not hold or text phone numbers at all. */
  | { status: "unavailable" }
  | { status: "failed"; message: string };

const SEND_FAILED = "We could not text a code to that number. Check it and try again.";
const CODE_FAILED = "That code did not match. Check the six digits in the text, or send another.";

/** Clerk error codes that mean "this number", not "this feature". */
const NUMBER_PROBLEMS: Record<string, string> = {
  form_param_format_invalid: "Enter a Philippine mobile number, like 0917 123 4567.",
  form_identifier_exists: "That number is already on another account. Use a different mobile.",
  form_code_incorrect: CODE_FAILED,
  verification_failed: CODE_FAILED,
  verification_expired: "That code expired. Send another.",
  too_many_requests: "Too many tries. Wait a minute, then send another code.",
};

function clerkCode(error: unknown): string | null {
  const errors = (error as { errors?: { code?: unknown }[] } | null)?.errors;
  const code = Array.isArray(errors) ? errors[0]?.code : null;
  return typeof code === "string" ? code : null;
}

/**
 * Whether Clerk's own environment says phone numbers are off. `null` when it
 * cannot tell: the first send then decides.
 */
export function clerkPhoneNumbersEnabled(clerk: unknown): boolean | null {
  const env = (clerk as {
    __unstable__environment?: {
      userSettings?: { attributes?: { phone_number?: { enabled?: unknown } } };
    };
  } | null)?.__unstable__environment;
  const enabled = env?.userSettings?.attributes?.phone_number?.enabled;
  return typeof enabled === "boolean" ? enabled : null;
}

export function isVerifiedPhone(
  user: Pick<ClerkPhoneUser, "phoneNumbers"> | null | undefined,
  mobile: string,
): boolean {
  return Boolean(
    user?.phoneNumbers.some(
      (phone) => phone.phoneNumber === mobile && phone.verification?.status === "verified",
    ),
  );
}

/** Add the number to this sign-in if it is new, then text it a code. */
export async function startPhoneConfirm(user: ClerkPhoneUser, mobile: string): Promise<PhoneStart> {
  if (isVerifiedPhone(user, mobile)) return { status: "verified" };
  try {
    const phone =
      user.phoneNumbers.find((existing) => existing.phoneNumber === mobile) ??
      (await user.createPhoneNumber({ phoneNumber: mobile }));
    await phone.prepareVerification();
    return { status: "code_sent", phone };
  } catch (error) {
    const code = clerkCode(error);
    if (code && NUMBER_PROBLEMS[code]) return { status: "failed", message: NUMBER_PROBLEMS[code] };
    // Anything else from Clerk here (a parameter it does not know, a
    // strategy it does not offer) means this instance does not text codes.
    if (code) return { status: "unavailable" };
    return { status: "failed", message: SEND_FAILED };
  }
}

export async function resendPhoneCode(phone: ClerkPhoneNumber): Promise<string | null> {
  try {
    await phone.prepareVerification();
    return null;
  } catch (error) {
    const code = clerkCode(error);
    return (code && NUMBER_PROBLEMS[code]) || SEND_FAILED;
  }
}

/** `null` when the number is now verified; otherwise the sentence to show. */
export async function confirmPhoneCode(
  user: ClerkPhoneUser,
  phone: ClerkPhoneNumber,
  code: string,
): Promise<string | null> {
  try {
    await phone.attemptVerification({ code: code.replace(/\D/g, "") });
    await user.reload?.();
    return null;
  } catch (error) {
    const clerk = clerkCode(error);
    return (clerk && NUMBER_PROBLEMS[clerk]) || CODE_FAILED;
  }
}
