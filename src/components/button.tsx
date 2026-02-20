import React from 'react';
import clsx from 'clsx';

const baseStyles =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] disabled:opacity-50 disabled:cursor-not-allowed';

const variantStyles = {
  solid:
    'bg-orange-500 text-black hover:bg-orange-400 active:bg-orange-600',
  outline:
    'border border-white/15 text-gray-300 hover:bg-white/5 active:bg-white/10',
  ghost:
    'text-gray-400 hover:bg-white/5 hover:text-gray-200 active:bg-white/10',
  danger:
    'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 active:bg-red-500/30',
};

const sizeStyles = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

type ButtonVariant = keyof typeof variantStyles;
type ButtonSize = keyof typeof sizeStyles;

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  outline?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = 'solid',
  size = 'md',
  outline,
  className,
  children,
  ...props
}: ButtonProps) {
  const resolvedVariant = outline ? 'outline' : variant;

  return (
    <button
      className={clsx(baseStyles, variantStyles[resolvedVariant], sizeStyles[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
