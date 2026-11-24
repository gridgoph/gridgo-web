// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listSupplierVerificationQueue: vi.fn(),
  getSupplierVerificationDetail: vi.fn(),
  getApprovalCase: vi.fn(),
  decideApprovalCase: vi.fn(),
  getFileDownloadUrl: vi.fn(),
  getHomePrinter: vi.fn(),
  approveHomeStarter: vi.fn(),
  getSettings: vi.fn(),
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.stubGlobal("React", React);

// Base UI's checkbox dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => "/ops/shop-verification",
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { ShopVerificationDesk } from "@/components/shop-verification/ShopVerificationDesk";
import { ApiError } from "@/lib/api/client";
import { manilaToday } from "@/lib/home-printers";

const summary = {
  verified: false,
  verificationState: "being_checked",
  startedAt: "2026-11-18T02:00:00Z",
  deadlineAt: "2026-12-18T02:00:00Z",
  daysLeft: 24,
  countdownDays: null,
  payoutCapMinor: 500000,
  paidBeforeVerificationMinor: 0,
  remainingCapMinor: 500000,
  capReached: false,
  heldMinor: 0,
  recoveryDueMinor: 0,
  paidOpenRegularJobs: 0,
  newOrdersPaused: true,
};

const files = [
  { fileId: "f_id", detectedContentType: "image/jpeg", readyAt: "2026-11-24T04:06:00Z", references: [{ documentType: "valid_id" }] },
  { fileId: "f_selfie", detectedContentType: "image/jpeg", readyAt: "2026-11-24T04:06:00Z", references: [{ documentType: "id_selfie" }] },
  { fileId: "f_print", detectedContentType: "image/jpeg", readyAt: "2026-11-24T04:06:00Z", references: [{ documentType: "sample_work" }] },
];

function entry(over: Record<string, unknown> = {}) {
  return {
    supplierId: "usr_home",
    approvalCaseId: "case_home",
    approvalStatus: "pending",
    shopName: "Home printer A",
    verification: summary,
    verificationDocuments: files,
    ...over,
  };
}

function home(over: { homePrinter?: Record<string, unknown>; [k: string]: unknown } = {}) {
  const { homePrinter, ...rest } = over;
  return {
    version: 5,
    homePrinter: {
      printerType: "home",
      symbol: "house",
      level: "pending",
      verified: false,
      online: false,
      offersPaused: true,
      reason: "home_starter_review_required",
      deadlineAt: "2026-12-18T02:00:00Z",
      weeklyJobs: 0,
      weeklyJobCap: 30,
      offlineUntil: null,
      allowHomePickup: false,
      ...homePrinter,
    },
    pin: {
      point: { lat: 7.08629, lng: 125.61505, label: "Example Street" },
      barangay: "Barangay Example",
      street: "Example Street",
      propertyType: "boarding_house",
      landmark: "Near the corner store",
      nextChangeAt: "2026-12-18T02:00:00Z",
    },
    starterEvidence: null,
    verificationDocuments: [
      { fileId: "f_id", documentType: "valid_id" },
      { fileId: "f_selfie", documentType: "id_selfie" },
      { fileId: "f_print", documentType: "sample_work" },
    ],
    ...rest,
  };
}

/** A birth date `years` whole years before today in Manila. */
function bornYearsAgo(years: number): string {
  const today = manilaToday();
  return `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  api.listSupplierVerificationQueue.mockResolvedValue({
    suppliers: [entry(), entry({ supplierId: "usr_shop", approvalCaseId: "case_shop", shopName: "Shop B", verificationDocuments: [] })],
    nextCursor: null,
  });
  api.getSupplierVerificationDetail.mockResolvedValue({ supplier: entry({ ledger: [] }) });
  api.getApprovalCase.mockResolvedValue({
    approvalCase: { id: "case_home", kind: "supplier", status: "pending", version: 2 },
    applicant: null,
    history: [],
  });
  api.getFileDownloadUrl.mockImplementation(async (id: string) => `https://files.example/${id}?sig=1`);
  api.getHomePrinter.mockImplementation(async (id: string) => {
    if (id === "usr_home") return home();
    throw new ApiError(404, { error: "home_printer_not_found" });
  });
  api.getSettings.mockResolvedValue({ version: 1, homePrinter: { minimumAgeYears: 18, starterWeeklyJobCap: 30, verificationWindowDays: 30 } });
  api.approveHomeStarter.mockResolvedValue(home({ homePrinter: { level: "starter", reason: "home_offline" } }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openHome() {
  nav.params = new URLSearchParams("shop=usr_home");
  render(<ShopVerificationDesk canDecide={false} base="/ops" />);
  return screen.findByRole("heading", { name: "Starter review" });
}

describe("home printers on the shop verification desk", () => {
  it("tags a home printer's row with the house and its Starter files; a shop stays a shop", async () => {
    render(<ShopVerificationDesk canDecide={false} base="/ops" />);
    const homeRow = await screen.findByRole("button", { name: "Open Home printer A" });
    expect(await within(homeRow).findByText("Home printer")).toBeInTheDocument();
    expect(within(homeRow).getByText("Ready for Starter review")).toBeInTheDocument();
    expect(within(homeRow).getByText(/3 of 3 Starter files/)).toBeInTheDocument();
    const shopRow = screen.getByRole("button", { name: "Open Shop B" });
    await waitFor(() => expect(api.getHomePrinter).toHaveBeenCalledWith("usr_shop"));
    expect(within(shopRow).queryByText("Home printer")).toBeNull();
    expect(within(shopRow).getByText(/0 of 3 papers/)).toBeInTheDocument();
  });

  it("shows the ID and selfie side by side, the test print, the agreement and the week", async () => {
    await openHome();
    const pair = screen.getByRole("group", { name: "ID and selfie, side by side" });
    expect(await within(pair).findByRole("img", { name: "ID" })).toHaveAttribute("src", "https://files.example/f_id?sig=1");
    expect(await within(pair).findByRole("img", { name: "Selfie with the ID" })).toHaveAttribute("src", "https://files.example/f_selfie?sig=1");
    expect(await screen.findByRole("img", { name: "Test print" })).toBeInTheDocument();
    expect(within(screen.getByTestId("file-agreement")).getByText("Agreed")).toBeInTheDocument();
    const facts = screen.getByTestId("home-printer-facts");
    expect(within(facts).getByText("Jobs this week").nextSibling).toHaveTextContent("0 of 30");
    expect(within(facts).getByText("Paused until GRIDGO approves them as Starter.")).toBeInTheDocument();
    // The business-permit plate of an ordinary shop is not asked of a home printer.
    expect(screen.queryByText("Business permit")).toBeNull();
  });

  it("keeps the street and pin folded until the reviewer asks", async () => {
    await openHome();
    expect(screen.getByText("Barangay Example · Boarding house")).toBeInTheDocument();
    expect(screen.queryByText("Example Street")).toBeNull();
    expect(screen.queryByTestId("home-private-address")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Show the private address" }));
    const address = screen.getByTestId("home-private-address");
    expect(address).toHaveTextContent("Example Street");
    expect(address).toHaveTextContent("Landmark: Near the corner store");
    expect(address).toHaveTextContent("Pin 7.08629, 125.61505");
  });

  it("shows the age check before submit and refuses an under-age ID without asking GRIDGO", async () => {
    await openHome();
    const approve = screen.getByRole("button", { name: "Approve as Starter" });
    expect(approve).toBeDisabled();
    expect(screen.getByText("Enter the date of birth from the ID.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Date of birth on the ID"), { target: { value: bornYearsAgo(16) } });
    await userEvent.setup().click(screen.getByRole("checkbox"));
    expect(screen.getByText("Age 16: under 18")).toBeInTheDocument();
    expect(screen.getByText("The ID shows 16. Starter needs 18 or older.")).toBeInTheDocument();
    expect(approve).toBeDisabled();
    expect(api.approveHomeStarter).not.toHaveBeenCalled();
  });

  it("approves as Starter with the version, the date read off the ID and the current files", async () => {
    await openHome();
    const user = userEvent.setup();
    const birth = bornYearsAgo(25);
    fireEvent.change(screen.getByLabelText("Date of birth on the ID"), { target: { value: birth } });
    expect(screen.getByText("Age 25: 18 or older")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve as Starter" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Approve as Starter" }));
    await waitFor(() =>
      expect(api.approveHomeStarter).toHaveBeenCalledWith("usr_home", {
        expectedVersion: 5,
        dateOfBirth: birth,
        reviewedFileIds: ["f_id", "f_selfie", "f_print"],
      }),
    );
    expect(await screen.findByText(/Home printer A is approved as Starter and can take up to 30 document jobs a week/)).toBeInTheDocument();
  });

  it("puts a refusal in plain words and loads the current files", async () => {
    api.approveHomeStarter.mockRejectedValue(new ApiError(409, { error: "home_starter_documents_required" }));
    await openHome();
    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText("Date of birth on the ID"), { target: { value: bornYearsAgo(30) } });
    await user.click(screen.getByRole("checkbox"));
    const calls = api.getHomePrinter.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Approve as Starter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The ID, the ID selfie or the test print changed while you were reviewing. The current files are shown now",
    );
    await waitFor(() => expect(api.getHomePrinter.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false"));
  });

  it("names what is missing and keeps Approve as Starter closed", async () => {
    api.getHomePrinter.mockResolvedValue(
      home({
        homePrinter: { reason: "home_file_privacy_required" },
        verificationDocuments: [{ fileId: "f_id", documentType: "valid_id" }],
      }),
    );
    await openHome();
    expect(within(screen.getByTestId("file-agreement")).getByText("Not agreed yet")).toBeInTheDocument();
    expect(screen.getByText("They have not sent the selfie with the ID and the test print yet.")).toBeInTheDocument();
    expect(screen.getByText("They have not agreed to keep client files private yet.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Approve as Starter" })).toBeDisabled();
  });

  it("shows the Starter record instead of the form once approved", async () => {
    api.getHomePrinter.mockResolvedValue(
      home({
        homePrinter: { level: "starter", reason: "home_offline", weeklyJobs: 12 },
        starterEvidence: { dateOfBirth: bornYearsAgo(25), fileIds: ["f_id", "f_selfie", "f_print"], reviewedBy: "usr_ops", reviewedAt: "2026-11-24T04:17:00Z" },
      }),
    );
    await openHome();
    expect(screen.queryByRole("button", { name: "Approve as Starter" })).toBeNull();
    expect(screen.getByTestId("starter-record")).toHaveTextContent("The ID shows age 25.");
    expect(within(screen.getByTestId("home-printer-facts")).getByText("Jobs this week").nextSibling).toHaveTextContent("12 of 30");
    expect(within(screen.getByTestId("home-printer-facts")).getByText("Taking offers").nextSibling).toHaveTextContent("Offline");
  });

  it("keeps one yellow action: Verified's Approve is outlined until Starter", async () => {
    nav.params = new URLSearchParams("shop=usr_home");
    render(<ShopVerificationDesk canDecide base="/admin" />);
    await screen.findByRole("heading", { name: "Decide Verified" });
    const starter = screen.getByRole("button", { name: "Approve as Starter" });
    const verified = screen.getByRole("button", { name: "Approve" });
    expect(starter.className).not.toEqual(verified.className);
  });

  it("draws the shop view unchanged against an API without home printers", async () => {
    api.getHomePrinter.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    nav.params = new URLSearchParams("shop=usr_home");
    render(<ShopVerificationDesk canDecide={false} base="/ops" />);
    expect(await screen.findByRole("heading", { name: "Papers" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Starter review" })).toBeNull();
    expect(screen.queryByText("Home printer")).toBeNull();
    // A missing route stops the row reads after the first answer.
    await waitFor(() => expect(api.getHomePrinter.mock.calls.length).toBeLessThanOrEqual(3));
  });
});
