import { afterEach, expect, it, vi } from "vitest";

import { attachVerificationDocument, setTokenProvider } from "@/lib/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
  setTokenProvider(() => null);
});

it("attaches a shop paper with documentType, the only field the API accepts", async () => {
  setTokenProvider(() => "token");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ file: { fileId: "file_1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await attachVerificationDocument("file_1", "business_permit");

  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toMatch(/\/files\/file_1\/attach$/);
  expect(JSON.parse(String(init.body))).toEqual({ documentType: "business_permit" });
});
