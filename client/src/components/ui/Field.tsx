import type { ReactNode } from 'react';
import { useId } from 'react';

export interface FieldProps {
  label: string;
  /** Validation messages for this field. The first is rendered; all are announced. */
  errors?: string[];
  hint?: string;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Wraps any control with a label, hint and error slot, and wires up the
 * id/aria-describedby/aria-invalid plumbing once instead of in every input.
 */
export function Field({ label, errors = [], hint, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = errors.length > 0;
  const describedBy = [hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field${invalid ? ' field--invalid' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy, invalid })}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {invalid ? (
        <p className="field__error" id={errorId} role="alert">
          {errors.join(' ')}
        </p>
      ) : null}
    </div>
  );
}
