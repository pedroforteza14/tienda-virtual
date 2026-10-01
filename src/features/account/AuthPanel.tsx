'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, invalidateCsrfToken } from '@/lib/http/client';
import { LoginSchema, SignupSchema, toFieldErrors, type FieldErrors } from '@/lib/validation/schemas';
import { MIN_PASSWORD_LENGTH } from '@/config/constants';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { cn } from '@/lib/utils/cn';

/**
 * Login / signup.
 *
 * Notes that matter beyond the markup:
 *
 *  - **`invalidateCsrfToken()` on success.** Login and signup rotate the session id
 *    server-side (session-fixation defence), which changes the derived CSRF token.
 *    Without dropping the cached one, the next mutation would be rejected with a
 *    stale token.
 *  - **Signup reports success either way.** The server deliberately cannot tell us
 *    whether the email already existed, because that would be an account-enumeration
 *    oracle. So the copy says "ya podés iniciar sesión", which is true in both cases.
 *  - The password field carries `autoComplete="new-password"` on signup and
 *    `current-password` on login, so password managers behave.
 */
export function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formMessage, setFormMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormMessage(null);

    const schema = mode === 'login' ? LoginSchema : SignupSchema;
    const payload =
      mode === 'login'
        ? { email: values.email, password: values.password }
        : { name: values.name, email: values.email, password: values.password };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);

    const result = await apiFetch<{ user: { name: string } | null }>(
      mode === 'login' ? '/api/auth/login' : '/api/auth/signup',
      { method: 'POST', body: parsed.data },
    );
    setBusy(false);

    if (!result.ok) {
      setErrors(result.fields ?? {});
      setFormMessage({ tone: 'err', text: result.message });
      return;
    }

    // The session rotated, so the cached CSRF token is stale.
    invalidateCsrfToken();

    if (mode === 'signup' && !result.data.user) {
      // Indistinguishable from a fresh signup, on purpose.
      setFormMessage({
        tone: 'ok',
        text: 'Listo. Ya podés iniciar sesión con ese email.',
      });
      setMode('login');
      setValues({ ...values, password: '' });
      return;
    }

    router.refresh();
  }

  return (
    <div className="max-w-md">
      <div role="tablist" aria-label="Acceder o crear cuenta" className="flex gap-1">
        {(['login', 'signup'] as const).map((candidate) => (
          <button
            key={candidate}
            role="tab"
            type="button"
            aria-selected={mode === candidate}
            onClick={() => {
              setMode(candidate);
              setErrors({});
              setFormMessage(null);
            }}
            className={cn(
              'u-label min-h-11 border-b-2 px-4 transition-colors',
              mode === candidate
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-faint hover:text-fg-dim',
            )}
          >
            {candidate === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        ))}
      </div>

      <form
        className="mt-8 flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {mode === 'signup' ? (
          <TextField
            id="auth-name"
            label="Nombre y apellido"
            autoComplete="name"
            required
            value={values.name}
            error={errors.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
          />
        ) : null}

        <TextField
          id="auth-email"
          type="email"
          label="Email"
          autoComplete="email"
          inputMode="email"
          required
          value={values.email}
          error={errors.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
        />

        <TextField
          id="auth-password"
          type="password"
          label="Contraseña"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          {...(mode === 'signup'
            ? { hint: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres. Usá una frase, no una palabra.` }
            : {})}
          value={values.password}
          error={errors.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />

        {formMessage ? (
          <p
            role="status"
            className={cn(
              'u-mono text-tiny',
              formMessage.tone === 'ok'
                ? 'text-signal-ok'
                : 'text-signal-err',
            )}
          >
            {formMessage.text}
          </p>
        ) : null}

        <Button type="submit" size="lg" block loading={busy}>
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </Button>
      </form>

      <p className="u-mono mt-6 text-micro text-fg-faint">
        No necesitás cuenta para comprar. Sirve para ver tus pedidos anteriores.
      </p>
    </div>
  );
}
