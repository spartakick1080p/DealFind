'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, size = 'md', disabled }: ToggleProps) {
  const isSm = size === 'sm';
  const trackW = isSm ? 32 : 44;
  const trackH = isSm ? 18 : 24;
  const knobD = isSm ? 14 : 20;
  const pad = 2;
  const travel = trackW - knobD - pad * 2;
  const iconSize = isSm ? 'size-2' : 'size-3';

  return (
    <label className={`inline-flex items-center gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <div
        className="relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out"
        style={{
          width: trackW,
          height: trackH,
          padding: pad,
          backgroundColor: checked ? 'rgb(34 197 94)' : 'rgba(255,255,255,0.15)',
        }}
      >
        <span
          className="relative rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-in-out"
          style={{
            width: knobD,
            height: knobD,
            transform: `translateX(${checked ? travel : 0}px)`,
          }}
        >
          {/* X icon (off state) */}
          <span
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
              checked ? 'opacity-0' : 'opacity-100'
            }`}
            aria-hidden="true"
          >
            <svg fill="none" viewBox="0 0 12 12" className={`${iconSize} text-gray-400`}>
              <path d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {/* Check icon (on state) */}
          <span
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
              checked ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden="true"
          >
            <svg fill="currentColor" viewBox="0 0 12 12" className={`${iconSize} text-green-600`}>
              <path d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z" />
            </svg>
          </span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-label={label}
          className="sr-only"
        />
      </div>
      {label && <span className="text-sm text-gray-300">{label}</span>}
    </label>
  );
}
