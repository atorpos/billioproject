import { Field } from './Field.js';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Label for the empty option. Omit to make the select required-by-shape. */
  placeholder?: string;
  hint?: string;
  errors?: string[];
  disabled?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  errors,
  disabled,
}: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} errors={errors}>
      {({ id, describedBy, invalid }) => (
        <select
          className="input"
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
