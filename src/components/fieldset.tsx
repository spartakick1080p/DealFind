import React from 'react';
import clsx from 'clsx';

/* ── Field ── */
export function Field({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('space-y-1.5', className)} {...props}>
      {children}
    </div>
  );
}

/* ── Label ── */
export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={clsx('block text-sm font-medium text-gray-400', className)} {...props}>
      {children}
    </label>
  );
}

/* ── Fieldset ── */
export function Fieldset({
  className,
  children,
  ...props
}: React.FieldsetHTMLAttributes<HTMLFieldSetElement>) {
  return (
    <fieldset className={clsx('space-y-4', className)} {...props}>
      {children}
    </fieldset>
  );
}

/* ── Legend ── */
export function Legend({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLLegendElement>) {
  return (
    <legend className={clsx('text-base font-semibold text-gray-200', className)} {...props}>
      {children}
    </legend>
  );
}
