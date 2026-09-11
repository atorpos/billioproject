import type { ScoreBreakdown } from '@billio/shared';
import { Meter } from './ui/Meter.js';

export interface ScoreBreakdownPanelProps {
  breakdown: ScoreBreakdown;
}

const LABELS: Array<{ key: keyof ScoreBreakdown; label: string; inactiveHint: string }> = [
  { key: 'budgetFit', label: 'Budget fit', inactiveHint: 'no target budget set' },
  { key: 'recency', label: 'Recency', inactiveHint: '' },
  { key: 'keyword', label: 'Keyword match', inactiveHint: 'no keyword entered' },
  { key: 'status', label: 'Availability', inactiveHint: '' },
];

/**
 * Shows why a listing scored what it did. Components the user gave no input for
 * are shown as excluded rather than hidden, so the ranking stays explainable.
 */
export function ScoreBreakdownPanel({ breakdown }: ScoreBreakdownPanelProps) {
  return (
    <div className="breakdown">
      {LABELS.map(({ key, label, inactiveHint }) => {
        const value = breakdown[key];
        if (value === null) {
          return (
            <p className="breakdown__inactive" key={key}>
              <span>{label}</span>
              <span>not scored — {inactiveHint}</span>
            </p>
          );
        }
        return <Meter key={key} label={label} value={value} />;
      })}
    </div>
  );
}
