export interface MeterProps {
  label: string;
  /** 0..1 */
  value: number;
  /** Text shown on the right, e.g. "78%". Defaults to a percentage of `value`. */
  valueLabel?: string;
}

/** A labelled proportional bar, reused for every score component. */
export function Meter({ label, value, valueLabel }: MeterProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div className="meter">
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        <span className="meter__value">{valueLabel ?? `${Math.round(clamped * 100)}%`}</span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="meter__fill" style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  );
}
