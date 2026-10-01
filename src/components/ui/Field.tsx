import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Form field.
 *
 * The accessibility rules here are not negotiable, because getting them wrong in
 * a checkout is how an order is lost:
 *
 *  - the label is **always** a real `<label>`. Placeholder-as-label disappears
 *    the moment someone types and is invisible to autofill;
 *  - hint and error are wired through `aria-describedby`, so they are announced
 *    with the field rather than orphaned next to it;
 *  - the error is `role="status"` (polite), so it is announced without yanking
 *    focus away mid-typing;
 *  - `aria-invalid` marks the field itself, which is what screen readers use to
 *    say "invalid entry";
 *  - the error text is also visually adjacent and marked with an icon-free
 *    colour *plus* wording, never colour alone.
 */

const CONTROL =
  'w-full min-h-12 bg-transparent border border-[var(--line-strong)] rounded-[var(--radius-sm)] ' +
  'px-3.5 py-2.5 text-[var(--text-step-0)] text-[var(--text)] placeholder:text-[var(--text-faint)] ' +
  'transition-[border-color,background-color] duration-[var(--dur-fast)] ' +
  'hover:border-[color-mix(in_oklab,var(--text)_35%,transparent)] ' +
  'focus:border-[var(--accent)] ' +
  'aria-[invalid=true]:border-[var(--color-signal-err)] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean;
  children: (ariaProps: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    required: boolean | undefined;
  }) => ReactNode;
  className?: string;
}

export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: FieldShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="u-label text-[var(--text-dim)]">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-[var(--accent)]">
              {' '}
              *
            </span>
            <span className="sr-only"> (requerido)</span>
          </>
        ) : null}
      </label>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })}

      {hint && !error ? (
        <p id={hintId} className="text-[var(--text-step--2)] text-[var(--text-faint)]">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="status"
          className="u-mono text-[var(--text-step--2)] text-[var(--color-signal-err)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id, label, hint, error, required, wrapperClassName, ...rest },
  ref,
) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      {(aria) => <input ref={ref} className={CONTROL} {...aria} {...rest} />}
    </FieldShell>
  );
});

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  wrapperClassName?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { id, label, hint, error, required, children, wrapperClassName, ...rest },
  ref,
) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      {(aria) => (
        <select
          ref={ref}
          // A native select is kept on purpose: it gets the platform picker on
          // mobile, which is faster and more accessible than anything custom.
          className={cn(CONTROL, 'appearance-none bg-[var(--surface-raised)] pr-10')}
          {...aria}
          {...rest}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
});

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ id, label, hint, error, required, wrapperClassName, ...rest }, ref) {
    return (
      <FieldShell
        id={id}
        label={label}
        hint={hint}
        error={error}
        required={required}
        className={wrapperClassName}
      >
        {(aria) => <textarea ref={ref} rows={4} className={cn(CONTROL, 'resize-y')} {...aria} {...rest} />}
      </FieldShell>
    );
  },
);
