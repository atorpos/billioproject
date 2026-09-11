import { Field } from './Field.js';

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  errors?: string[];
  type?: 'text' | 'search';
}

/** Controlled single-line text input. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  errors,
  type = 'text',
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} errors={errors}>
      {({ id, describedBy, invalid }) => (
        <input
          className="input"
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
