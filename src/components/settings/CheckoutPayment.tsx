/**
 * Checkout payment on Operational settings: how much of a new order the
 * client pays when they check out — the whole order (the default since
 * 2026-09-25, gridgo-api#66) or 75% now and 25% before delivery.
 *
 * Presentational only. `OperationalSettings` owns the draft and saves it with
 * the rest of the page through the settings version handshake. An API that
 * does not hold the setting yet gets no section at all: a control that saves
 * nothing would only mislead.
 */

import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DOWNPAYMENT_PERCENT_CHOICES,
  type DownpaymentPercentChoice,
} from "@/lib/api/constraints";

const medium = { fontFamily: "var(--font-medium)" } as const;

export const CHECKOUT_PAYMENT_OPTIONS: Record<
  DownpaymentPercentChoice,
  { label: string; detail: string }
> = {
  100: {
    label: "Pay in full at checkout (100%)",
    detail:
      "One QR transfer for the whole order, confirmed once by Operations. There is no balance to chase before delivery.",
  },
  75: {
    label: "75% now, 25% before delivery",
    detail:
      "The client sends the rest before the rider can complete delivery, and Operations confirms both transfers.",
  },
};

/** The option's words for a stored value, or the bare figure for one the portal does not know. */
export function checkoutPaymentLabel(percent: number): string {
  return (
    CHECKOUT_PAYMENT_OPTIONS[percent as DownpaymentPercentChoice]?.label ??
    `${percent}% at checkout`
  );
}

type Props = {
  /** The choice as picked, not yet saved. */
  value: number;
  onChange: (value: DownpaymentPercentChoice) => void;
  /** The stored value, or undefined when the API does not hold one. */
  inForce: number | undefined;
  disabled?: boolean;
};

export function CheckoutPayment({ value, onChange, inForce, disabled }: Props) {
  if (inForce === undefined) return null;
  return (
    <section className="gg-card p-3" aria-labelledby="checkout-payment-heading">
      <h2 id="checkout-payment-heading" className="text-h3 text-text-primary m-0">
        Checkout payment
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        How much of a new order the client pays when they check out. Operations confirms
        each transfer before the order moves.
      </p>

      <Field className="mt-4 max-w-prose">
        <FieldTitle id="checkout-payment-label">Client pays at checkout</FieldTitle>
        <RadioGroup
          aria-labelledby="checkout-payment-label"
          aria-describedby="checkout-payment-help"
          value={String(value)}
          onValueChange={(next) => onChange(Number(next) as DownpaymentPercentChoice)}
          disabled={disabled}
          className="gap-2"
        >
          {DOWNPAYMENT_PERCENT_CHOICES.map((percent) => {
            const option = CHECKOUT_PAYMENT_OPTIONS[percent];
            return (
              <label
                key={percent}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline bg-surface px-3 py-2 has-[[data-checked]]:border-accent"
              >
                {/* Named by its label alone; the detail is its description. */}
                <RadioGroupItem
                  value={String(percent)}
                  className="mt-1"
                  aria-labelledby={`checkout-payment-${percent}`}
                  aria-describedby={`checkout-payment-${percent}-detail`}
                />
                <span className="min-w-0 flex-1">
                  <span id={`checkout-payment-${percent}`} className="block text-body text-text-primary">
                    {option.label}
                  </span>
                  <span
                    id={`checkout-payment-${percent}-detail`}
                    className="block text-caption text-text-muted"
                  >
                    {option.detail}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
        <FieldDescription id="checkout-payment-help">
          Applies to orders placed from now on &mdash; every order already placed keeps the
          split it was placed under.
        </FieldDescription>
      </Field>

      <p
        className="text-body text-text-secondary m-0 mt-3"
        data-testid="checkout-payment-in-force"
      >
        In force right now:{" "}
        <span className="text-text-primary" style={medium}>
          {checkoutPaymentLabel(inForce)}
        </span>
        {value !== inForce ? (
          <>
            {" "}
            &middot; after saving:{" "}
            <span className="text-text-primary" style={medium}>
              {checkoutPaymentLabel(value)}
            </span>
          </>
        ) : null}
      </p>
    </section>
  );
}
