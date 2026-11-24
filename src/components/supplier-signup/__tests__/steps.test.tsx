// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_ELIGIBILITY,
  EMPTY_SHOP_FIELDS,
  type Eligibility,
  type JobsHandledBy,
  type ShopFields,
  type SignupTerms,
} from "@/lib/guided-signup";

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

// Clerk: phone numbers switched off on this instance unless a test says otherwise.
const clerkState = vi.hoisted(() => ({
  phoneEnabled: false as boolean | null,
  user: { phoneNumbers: [] as unknown[], createPhoneNumber: vi.fn() },
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: clerkState.user }),
  useClerk: () => ({
    __unstable__environment:
      clerkState.phoneEnabled === null
        ? undefined
        : { userSettings: { attributes: { phone_number: { enabled: clerkState.phoneEnabled } } } },
  }),
}));

// The map is Leaflet from a CDN; the step is tested with a stand-in that places a pin.
vi.mock("@/components/supplier-signup/PinPicker", () => ({
  PinPicker: ({ onChange }: { onChange: (pin: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 7.0731, lng: 125.6128 })}>
      Place pin on shop
    </button>
  ),
}));

const listSupplierLegalDocuments = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/supplier-self", () => ({ listSupplierLegalDocuments }));

const { StartStep } = await import("@/components/supplier-signup/steps/StartStep");
const { ShopStep } = await import("@/components/supplier-signup/steps/ShopStep");
const { PinStep } = await import("@/components/supplier-signup/steps/PinStep");
const { PrintsStep } = await import("@/components/supplier-signup/steps/PrintsStep");
const { OpenShopStep, agreementLabel } = await import("@/components/supplier-signup/steps/OpenShopStep");

const TERMS: SignupTerms = {
  printGroups: ["documents", "photos"],
  locationConsentWording: "Test wording: GRIDGO may use this pin for pickups and delivery fees.",
  payoutConsentWording: "Test payout wording.",
  documentRates: { bwMinor: 300, colourMinor: 1000 },
};

const LEGAL = [
  { id: "v-sa", documentId: "supplier-agreement", version: 3, title: "Supplier Agreement", text: "Agreement text." },
  { id: "v-tos", documentId: "terms-of-service", version: 5, title: "Terms of Service", text: "Terms text." },
  { id: "v-pn", documentId: "privacy-notice", version: 2, title: "Privacy Notice", text: "Privacy text." },
];

beforeEach(() => {
  vi.stubGlobal("React", React);
  clerkState.phoneEnabled = false;
  clerkState.user = { phoneNumbers: [], createPhoneNumber: vi.fn() };
  listSupplierLegalDocuments.mockReset();
});
afterEach(cleanup);

describe("step 0: Tell us about you", () => {
  function Harness({ onStart }: { onStart: () => void }) {
    const [value, setValue] = useState<Eligibility>(EMPTY_ELIGIBILITY);
    return <StartStep value={value} onChange={setValue} onStart={onStart} />;
  }

  it("says what to answer, then starts with Bisaya under Start", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<Harness onStart={onStart} />);

    expect(screen.getByText("Sugdi na")).toHaveAttribute("lang", "ceb");
    fireEvent.click(screen.getByTestId("start-next"));
    expect(await screen.findByText(/18 or older to open a shop/)).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: /^Print shop/ }));
    await user.click(screen.getByRole("radio", { name: /^I own the shop/ }));
    await user.click(screen.getByRole("checkbox", { name: /I am 18 or older/ }));
    fireEvent.click(screen.getByTestId("start-next"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("Your shop", () => {
  function Harness(props: { manager?: boolean; onSave?: () => Promise<string | null>; onSkip?: () => void }) {
    const [fields, setFields] = useState<ShopFields>(EMPTY_SHOP_FIELDS);
    return (
      <ShopStep
        fields={fields}
        onFieldsChange={setFields}
        manager={props.manager ?? false}
        logo={null}
        onLogoChange={() => undefined}
        onSave={props.onSave ?? (async () => null)}
        onSkip={props.onSkip ?? (() => undefined)}
      />
    );
  }

  it("says plainly when codes cannot be texted, and goes on to the pin instead of a dead end", () => {
    const onSkip = vi.fn();
    render(<Harness onSkip={onSkip} />);
    expect(screen.getByTestId("phone-off")).toHaveTextContent(/GRIDGO cannot text codes yet/);
    expect(screen.queryByTestId("send-code")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("shop-skip"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("asks a manager for the owner's mobile", () => {
    render(<Harness manager />);
    expect(screen.getByTestId("owner-phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner's mobile")).toBeInTheDocument();
  });

  it("saves with a number already confirmed on this sign-in", async () => {
    clerkState.phoneEnabled = true;
    clerkState.user = {
      phoneNumbers: [{ id: "p1", phoneNumber: "+639171234567", verification: { status: "verified" } }],
      createPhoneNumber: vi.fn(),
    };
    const onSave = vi.fn(async () => null);
    render(<Harness onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Shop name"), { target: { value: "Test Print" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Test Owner" } });
    fireEvent.change(screen.getByLabelText("Your mobile"), { target: { value: "0917 123 4567" } });
    expect(screen.getByTestId("phone-confirmed")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("step-next"));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ shopName: "Test Print", contactName: "Test Owner", phone: "+639171234567" }),
    );
  });

  it("will not save an unconfirmed number", async () => {
    clerkState.phoneEnabled = true;
    const onSave = vi.fn(async () => null);
    render(<Harness onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Shop name"), { target: { value: "Test Print" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Test Owner" } });
    fireEvent.change(screen.getByLabelText("Your mobile"), { target: { value: "0917 123 4567" } });
    fireEvent.click(screen.getByTestId("step-next"));
    expect(await screen.findByText(/Confirm this number with the code/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("Pin your shop", () => {
  it("needs the pin, an address and GRIDGO's exact consent", async () => {
    const onSave = vi.fn(async () => null);
    const user = userEvent.setup();
    render(<PinStep saved={undefined} wording={TERMS.locationConsentWording} onSave={onSave} />);

    expect(screen.getByText("Gamita kini")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("step-next"));
    expect(await screen.findByText(/Place your shop on the map/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Place pin on shop" }));
    fireEvent.change(screen.getByLabelText("Address at the pin"), { target: { value: "Door 2, Test Street" } });
    fireEvent.click(screen.getByTestId("step-next"));
    expect(await screen.findByText(/Tick the box to let GRIDGO use your pin/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: TERMS.locationConsentWording }));
    fireEvent.click(screen.getByTestId("step-next"));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        point: { lat: 7.0731, lng: 125.6128, label: "Door 2, Test Street" },
        consent: { accepted: true, wording: TERMS.locationConsentWording },
      }),
    );
  });
});

describe("What you print", () => {
  it("is ready to save as it opens, showing GRIDGO's own page price", async () => {
    const onSave = vi.fn(async () => null);
    render(<PrintsStep saved={undefined} terms={TERMS} onSave={onSave} />);
    expect(screen.getByTestId("gridgo-page-price")).toHaveTextContent("₱3.00 a side");
    expect(screen.getByTestId("gridgo-page-price")).toHaveTextContent("₱10.00 a side");
    fireEvent.click(screen.getByTestId("step-next"));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        groups: ["documents"],
        documents: { papers: ["short", "a4", "long"], colours: ["bw", "colour"], duplex: true },
      }),
    );
  });

  it("asks for the shop's own A3 price when A3 is ticked", async () => {
    const onSave = vi.fn(async () => null);
    render(<PrintsStep saved={undefined} terms={TERMS} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /^A3/ }));
    expect(screen.getByTestId("a3-prices")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("step-next"));
    expect(await screen.findByText("Fix the marked answers above.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("Who takes jobs, and opening the shop", () => {
  function Harness({ onOpen, missing = null }: { onOpen: () => Promise<string | null>; missing?: string | null }) {
    const [value, setValue] = useState<JobsHandledBy>("just_me");
    return <OpenShopStep jobsHandledBy={value} onJobsHandledByChange={setValue} onOpen={onOpen} missing={missing} />;
  }

  it("names the agreement from GRIDGO's own document titles", () => {
    expect(agreementLabel(LEGAL as never)).toBe(
      "I am 18 or older and agree, for this shop, to the Supplier Agreement, Terms of Service and Privacy Notice",
    );
  });

  it("will not open without the tick, then sends the exact versions read", async () => {
    listSupplierLegalDocuments.mockResolvedValue({ documents: LEGAL });
    const onOpen = vi.fn(async () => null);
    const user = userEvent.setup();
    render(<Harness onOpen={onOpen} />);

    expect(await screen.findByTestId("open-shop-consent")).toBeInTheDocument();
    expect(screen.getByText("Ablihi akong tindahan")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("open-shop"));
    expect(await screen.findByText("Tick the agreement below to open your shop.")).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: /agree, for this shop/ }));
    fireEvent.click(screen.getByTestId("open-shop"));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ versionIds: ["v-sa", "v-tos", "v-pn"], marketing: false }));
  });

  it("points back to the step still to finish", async () => {
    listSupplierLegalDocuments.mockResolvedValue({ documents: LEGAL });
    const onOpen = vi.fn(async () => null);
    render(<Harness onOpen={onOpen} missing="Your shop" />);
    await screen.findByTestId("open-shop-consent");
    fireEvent.click(screen.getByTestId("open-shop"));
    expect(await screen.findByText('Finish "Your shop" first.')).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
