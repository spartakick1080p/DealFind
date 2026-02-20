import React from 'react';
import clsx from 'clsx';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={clsx(
        'block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200',
        'placeholder:text-gray-500',
        'focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25 focus:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}
