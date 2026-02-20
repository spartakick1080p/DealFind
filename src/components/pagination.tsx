import React from 'react';
import clsx from 'clsx';

/* ── Pagination (root) ── */
export function Pagination({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <nav aria-label="Pagination" className={clsx('flex items-center justify-between', className)} {...props}>
      {children}
    </nav>
  );
}

/* ── PaginationPrevious / PaginationNext ── */
function NavLink({
  href,
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const disabled = !href;
  const Tag = disabled ? 'span' : 'a';

  return (
    <Tag
      href={href}
      aria-disabled={disabled || undefined}
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        disabled
          ? 'text-gray-600 cursor-not-allowed'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function PaginationPrevious(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <NavLink {...props}>
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Previous
    </NavLink>
  );
}

export function PaginationNext(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <NavLink {...props}>
      Next
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </NavLink>
  );
}

/* ── PaginationList ── */
export function PaginationList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('hidden items-center gap-1 sm:flex', className)} {...props}>
      {children}
    </div>
  );
}

/* ── PaginationPage ── */
type PaginationPageProps = {
  current?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function PaginationPage({ current, className, children, ...props }: PaginationPageProps) {
  return (
    <a
      aria-current={current ? 'page' : undefined}
      className={clsx(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors',
        current
          ? 'bg-orange-500 text-black'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200',
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

/* ── PaginationGap ── */
export function PaginationGap() {
  return <span className="px-1 text-gray-600">&hellip;</span>;
}
