'use client';

import React from 'react';
import clsx from 'clsx';
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  type MenuButtonProps,
} from '@headlessui/react';

/* ── Dropdown (root) ── */
export function Dropdown({ children }: { children: React.ReactNode }) {
  return <Menu as="div" className="relative inline-block text-left">{children}</Menu>;
}

/* ── DropdownButton ── */
type DropdownButtonProps = {
  outline?: boolean;
} & MenuButtonProps<'button'>;

export function DropdownButton({ outline, className, children, ...props }: DropdownButtonProps) {
  return (
    <MenuButton
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]',
        outline
          ? 'border border-white/15 text-gray-300 hover:bg-white/5'
          : 'bg-orange-500 text-black hover:bg-orange-400',
        className,
      )}
      {...props}
    >
      {children}
    </MenuButton>
  );
}

/* ── DropdownMenu ── */
export function DropdownMenu({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <MenuItems
      transition
      className={clsx(
        'absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-lg',
        'bg-[#1a1a1a] border border-white/10 shadow-xl',
        'transition data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75',
        'focus:outline-none',
        className,
      )}
      {...props}
    >
      <div className="py-1">{children}</div>
    </MenuItems>
  );
}

/* ── DropdownItem ── */
type DropdownItemProps = {
  href?: string;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

export function DropdownItem({ href, className, children, ...props }: DropdownItemProps) {
  const itemClasses = clsx(
    'flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300',
    'data-[focus]:bg-white/5 data-[focus]:text-orange-400',
    'transition-colors',
    className,
  );

  if (href) {
    return (
      <MenuItem as="a" href={href} className={itemClasses}>
        {children}
      </MenuItem>
    );
  }

  return (
    <MenuItem as="button" type="button" className={itemClasses} {...props}>
      {children}
    </MenuItem>
  );
}
