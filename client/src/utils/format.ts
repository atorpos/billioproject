const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US');

export function formatCurrency(value: number): string {
  return Number.isFinite(value) ? currencyFormatter.format(value) : '—';
}

export function formatNumber(value: number): string {
  return Number.isFinite(value) ? numberFormatter.format(value) : '—';
}

export function formatDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "3 days ago" style label, relative to `now` (injectable for tests). */
export function formatRelativeDays(iso: string, now: Date = new Date()): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';

  const days = Math.round((now.getTime() - parsed) / 86_400_000);
  if (days <= 0) return 'listed today';
  if (days === 1) return 'listed 1 day ago';
  if (days < 30) return `listed ${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'listed 1 month ago' : `listed ${months} months ago`;
}

export function formatBathrooms(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
