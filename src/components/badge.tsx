import React from 'react';
import clsx from 'clsx';

const colorMap: Record<string, string> = {
  orange: 'bg-orange-500/15 text-orange-400 ring-orange-500/20',
  lime: 'bg-lime-500/15 text-lime-400 ring-lime-500/20',
  purple: 'bg-purple-500/15 text-purple-400 ring-purple-500/20',
  rose: 'bg-rose-500/15 text-rose-400 ring-rose-500/20',
  red: 'bg-red-500/15 text-red-400 ring-red-500/20',
  green: 'bg-green-500/15 text-green-400 ring-green-500/20',
  blue: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  yellow: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/20',
  gray: 'bg-white/10 text-gray-400 ring-white/10',
};

type BadgeProps = {
  color?: string;
} & React.HTMLAttributes<HTMLSpanElement>;

export function Badge({ color = 'orange', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        colorMap[color] ?? colorMap.gray,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
