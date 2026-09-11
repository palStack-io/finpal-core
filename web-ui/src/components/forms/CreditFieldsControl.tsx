import React from 'react';
import { Percent, CreditCard, CalendarClock } from 'lucide-react';
import { errorTextStyle, labelStyle } from '../../styles/formStyles';
import { apiFieldErrors } from '../../utils/apiError';

/**
 * APR, credit limit and minimum payment, for a card or a loan.
 *
 * *** THESE THREE COLUMNS HAVE EXISTED SINCE B1 AND NO CLIENT HAS EVER COLLECTED
 * THEM, SO `apr` IS NULL FOR EVERY USER ON EVERY INSTANCE. *** The API accepts
 * them on both verbs, both service layers type them, the demo seeder writes them
 * -- and there was no input anywhere. That is what C1a fixes, and it is a
 * prerequisite for learnPal: a payoff mountain cannot be drawn without a rate.
 *
 * *** ONE COMPONENT, BOTH FORMS, AND THAT IS THE POINT. *** `AddAccountForm` and
 * `EditAccountForm` are separate files that have already drifted apart once --
 * #123 was two copies of a colour list disagreeing -- and D-99's rule is that a
 * field added to one client is not a capability until the other one has it too.
 * Here the two "clients" are two forms in the same app.
 *
 * It is deliberately PRESENTATIONAL and controlled by props rather than reaching
 * for a form library, because the two forms do not share one: `AddAccountForm`
 * uses react-hook-form and `EditAccountForm` uses plain `useState`. A component
 * that assumed either would only be usable in one of them, which is the failure
 * mode it exists to prevent.
 *
 * Values are STRINGS, not numbers. An `<input type="number">` holds a string, and
 * '' is the only honest representation of "the user has not said" -- `0` is a real
 * APR (an intro rate) and a real minimum payment, so a numeric state would have to
 * use `0` for both "zero" and "empty" and the field would become unclearable.
 */
export interface CreditFieldValues {
  creditLimit: string;
  apr: string;
  minPayment: string;
}

export type CreditFieldName = keyof CreditFieldValues;

interface CreditFieldsControlProps {
  values: CreditFieldValues;
  onChange: (field: CreditFieldName, value: string) => void;
  /** Rendered beside the two money fields. The profile's symbol, never a literal $ (#126). */
  currencySymbol: string;
  disabled?: boolean;
  /** 'credit' | 'loan' -- only the copy differs; the fields are the same. */
  accountType: string;
  /** Per-field messages, keyed exactly as the server keys them in `details`. */
  errors?: Partial<Record<CreditFieldName, string>>;
}

/**
 * `Account.apr` is `Numeric(5,2)`, so 999.99 is the ceiling the COLUMN imposes and
 * the server refuses anything above it with a 400 naming the field. The `max` here
 * is the same number for the same reason -- it is a courtesy that saves a round
 * trip, NOT the enforcement. A browser attribute is not a validator: it is trivially
 * bypassed and absent entirely from any other caller, which is why the server-side
 * `validate.Range` is the thing that actually holds.
 */
export const APR_MAX = 999.99;

const helpTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  margin: '0 0 12px',
  lineHeight: 1.5,
};

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  // `fr` tracks, never fixed columns: these three sit inside a 500px SlidePanel at
  // 1440 and inside a 390px viewport on a phone, and a fixed track overflows the
  // narrow one. `auto-fit` collapses to a single column without a media query,
  // which matters because web-ui has none.
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '12px',
};

export const CreditFieldsControl: React.FC<CreditFieldsControlProps> = ({
  values,
  onChange,
  currencySymbol,
  disabled = false,
  accountType,
  errors = {},
}) => {
  const isLoan = accountType === 'loan';

  const field = (
    name: CreditFieldName,
    label: string,
    icon: React.ReactNode,
    extra: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <div>
      <label style={labelStyle} htmlFor={`credit-field-${name}`}>
        <span style={{ display: 'inline-flex', marginRight: '6px', verticalAlign: 'middle' }} aria-hidden="true">
          {icon}
        </span>
        {label}
      </label>
      <input
        id={`credit-field-${name}`}
        type="number"
        inputMode="decimal"
        className="fp-input"
        disabled={disabled}
        value={values[name]}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `credit-field-${name}-error` : undefined}
        {...extra}
      />
      {errors[name] && (
        <p id={`credit-field-${name}-error`} style={errorTextStyle} role="alert">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-light)',
        borderRadius: '8px',
      }}
    >
      <p style={{ ...labelStyle, marginBottom: '6px' }}>
        {isLoan ? 'Loan terms' : 'Card terms'}
      </p>
      {/*
        Why we ask. A form that demands three numbers without saying what they buy
        gets three blank fields, and a NULL apr is exactly the state this slice
        exists to end. All three are optional and the copy says so, because a
        required rate would block account creation for anyone who does not have
        their statement to hand.
      */}
      <p style={helpTextStyle}>
        All optional. Adding your rate lets finPal show what this{' '}
        {isLoan ? 'loan' : 'card'} actually costs you, and how much sooner it clears
        if you pay more than the minimum.
      </p>

      <div style={fieldGridStyle}>
        {field(
          'creditLimit',
          isLoan ? 'Original amount' : 'Credit limit',
          <CreditCard size={14} />,
          { min: 0, step: '0.01', placeholder: `${currencySymbol}0.00` },
        )}
        {field('apr', 'APR (%)', <Percent size={14} />, {
          min: 0,
          max: APR_MAX,
          step: '0.01',
          placeholder: '19.99',
        })}
        {field(
          'minPayment',
          isLoan ? 'Monthly payment' : 'Minimum payment',
          <CalendarClock size={14} />,
          { min: 0, step: '0.01', placeholder: `${currencySymbol}0.00` },
        )}
      </div>
    </div>
  );
};

/**
 * The three form strings, as the API's snake_case body.
 *
 * *** `''` BECOMES `null`, NOT "omitted", AND THAT IS A DECISION. *** On create the
 * two are identical -- `api/v1/accounts.py` says so in as many words: *"`None` and
 * 'not sent' mean the same thing on create, and the service writes NULL for both"*.
 * On EDIT they are not: omitting the key leaves the stored value alone (the handler
 * is `if 'apr' in data`), so a user who clears the box and saves would find the old
 * rate still there and no error to explain it. `null` is what `allow_none=True`
 * exists for. One rule for both verbs, because two rules is how the two forms drift.
 *
 * `Number('')` is `0`, which is why the empty check comes first: without it, clearing
 * a credit limit would silently set it to zero and every card would read as maxed
 * out. That is the trap the Account type's own comment warns about.
 */
export function creditFieldsPayload(values: CreditFieldValues): {
  credit_limit: number | null;
  apr: number | null;
  min_payment: number | null;
} {
  const num = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    // A non-numeric string reaching here means the browser let something odd
    // through; send null rather than NaN, which serialises to the JSON literal
    // `null` anyway but via a value no reader would expect.
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    credit_limit: num(values.creditLimit),
    apr: num(values.apr),
    min_payment: num(values.minPayment),
  };
}

/** The stored account back into form strings. `null` and `undefined` both mean "not stated". */
export function creditFieldsFromAccount(account: {
  creditLimit?: number | null;
  apr?: number | null;
  minPayment?: number | null;
}): CreditFieldValues {
  // `?? ''` and never `|| ''`: `0` is a real APR and a real minimum payment, and
  // `||` would reopen the edit form with those boxes empty and then clear the
  // stored zero on save.
  const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return {
    creditLimit: str(account.creditLimit),
    apr: str(account.apr),
    minPayment: str(account.minPayment),
  };
}

/**
 * A refused request, narrowed to this control's three fields and re-keyed to its
 * prop names. The API keys errors by COLUMN (`credit_limit`); the form uses
 * camelCase. Mapping in one place stops each form inventing its own.
 *
 * The body itself is read by `apiFieldErrors` in `utils/apiError.ts` and nowhere
 * else -- `apiErrorPrecedence.test.ts` enforces that single reader, and it caught
 * a first version of this function reaching into `response.data.details` directly.
 * That guard is D-53's, and D-53 was every file reading the wrong key at once.
 */
export function creditFieldErrors(error: unknown): Partial<Record<CreditFieldName, string>> {
  const bag = apiFieldErrors(error);
  const out: Partial<Record<CreditFieldName, string>> = {};
  if (bag.credit_limit) out.creditLimit = bag.credit_limit;
  if (bag.apr) out.apr = bag.apr;
  if (bag.min_payment) out.minPayment = bag.min_payment;
  return out;
}
