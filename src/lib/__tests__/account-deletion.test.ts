import { expect, it, vi } from "vitest";
import {
  confirmWithCode,
  confirmWithPassword,
  sendDeletionCode,
} from "../account-deletion";
function session() {
  return {
    startVerification: vi
      .fn()
      .mockResolvedValue({
        status: "needs_first_factor",
        supportedFirstFactors: [
          {
            strategy: "email_code",
            emailAddressId: "email_1",
            safeIdentifier: "s***@example.test",
          },
        ],
      }),
    prepareFirstFactorVerification: vi
      .fn()
      .mockResolvedValue({ status: "needs_first_factor" }),
    attemptFirstFactorVerification: vi.fn().mockResolvedValue({ status: "complete" }),
  };
}
it("requires the password and a completed first-factor check", async () => {
  const s = session();
  expect((await confirmWithPassword(s, "")).status).toBe("refused");
  expect(s.startVerification).not.toHaveBeenCalled();
  expect((await confirmWithPassword(s, "private-test")).status).toBe("ok");
  expect(s.startVerification).toHaveBeenCalledWith({ level: "first_factor" });
  s.attemptFirstFactorVerification.mockResolvedValue({ status: "needs_second_factor" });
  expect((await confirmWithPassword(s, "private-test")).status).toBe("failed");
});
it("prepares only an available email factor and refuses incomplete or expired codes", async () => {
  const s = session();
  expect(await sendDeletionCode(s)).toEqual({
    status: "ok",
    destination: "s***@example.test",
  });
  expect(s.prepareFirstFactorVerification).toHaveBeenCalledWith({
    strategy: "email_code",
    emailAddressId: "email_1",
  });
  expect((await confirmWithCode(s, "12")).status).toBe("refused");
  expect(s.attemptFirstFactorVerification).not.toHaveBeenCalled();
  s.attemptFirstFactorVerification.mockRejectedValue({
    errors: [{ code: "verification_expired" }],
  });
  expect(await confirmWithCode(s, "123456")).toMatchObject({
    status: "refused",
    message: expect.stringContaining("expired"),
  });
});
