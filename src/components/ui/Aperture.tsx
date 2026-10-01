import { cn } from '@/lib/utils/cn';

/**
 * The brass aperture — the signature device.
 *
 * Purely decorative, so it is always `aria-hidden` and never focusable.
 *
 * ⚠️ One aperture per viewport. Two on screen at once is the device eating
 * itself; see docs/creative-direction.md §3.
 */
export function Aperture({
  size = '20rem',
  className,
  children,
}: {
  size?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('aperture grid place-items-center', className)}
      style={{ '--aperture-size': size } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
