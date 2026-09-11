import { Field } from './Field.js';

export interface NumberFieldProps {
  label: string;
  /** Kept as a string so a half-typed or invalid value survives re-render. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  errors?: string[];
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Numeric input that stores its value as a string. Coercing to `number` on every
 * keystroke would swallow intermediate states like "" or "-" and make it
 * impossible to submit deliberately invalid input for the API to reject.
 */
export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  errors,
  min,
  max,
  step,
}: NumberFieldProps) {
  return (
    <Field label={label} hint={hint} errors={errors}>
      {({ id, describedBy, invalid }) => (
        <input
          className="input"
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
