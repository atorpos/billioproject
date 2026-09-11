import type { ReactNode } from 'react';

export interface StatusMessageProps {
  tone: 'info' | 'error' | 'empty';
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

/** One component for the loading / empty / error states, so they stay consistent. */
export function StatusMessage({ tone, title, description, action }: StatusMessageProps) {
  return (
    <div className={`status status--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <h3 className="status__title">{title}</h3>
      {description ? <div className="status__description">{description}</div> : null}
      {action ? <div className="status__action">{action}</div> : null}
    </div>
  );
}
