import { cx } from '@/lib/cx';
import { SOCIAL_LINKS } from './nav-links';
import { SocialIcon } from './social-icons';

/**
 * A row of social links. `tone` picks the colours for a dark (footer) or
 * light (contact page) background. Each link carries the network's name as
 * its accessible label, since the icon alone says nothing to a screen reader.
 */
export function SocialLinks({
  tone = 'light',
  label,
  className,
}: {
  tone?: 'light' | 'dark';
  /** Accessible name for the list, e.g. "Follow Packvio". */
  label: string;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={cx('flex flex-wrap items-center gap-2', className)}>
      {SOCIAL_LINKS.map((link) => (
        <li key={link.network}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer me"
            aria-label={link.label}
            title={link.label}
            className={cx(
              'inline-flex size-10 items-center justify-center rounded-pill transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2',
              tone === 'dark'
                ? 'bg-surface/10 text-surface hover:bg-brand-cyan hover:text-ink focus-visible:outline-brand-cyan'
                : 'bg-panel text-brand-purple hover:bg-brand-purple hover:text-surface focus-visible:outline-brand-purple',
            )}
          >
            <SocialIcon network={link.network} />
          </a>
        </li>
      ))}
    </ul>
  );
}
