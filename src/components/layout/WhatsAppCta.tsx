import { site, whatsappLink } from '@/config/site';
import { ButtonLink } from '@/components/ui/Button';

/**
 * WhatsApp, designed as part of the experience.
 *
 * Explicitly **not** the floating green bubble the brief rules out. It is a full
 * editorial band framing the conversation as access to a specialist, which is
 * both better design and a better offer — in Argentine premium retail, "talk to
 * someone who knows" is the actual value proposition.
 *
 * The number is digits-only by construction and the message is URL-encoded and
 * length-capped in `whatsappLink`, so no caller can inject extra parameters.
 */
export function WhatsAppCta() {
  return (
    <section
      aria-labelledby="help-heading"
      className="u-hairline-bottom border-t border-line"
    >
      <div className="u-container u-section-tight grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="u-label">¿Necesitás ayuda?</p>
          <h2
            id="help-heading"
            className="u-display-tight mt-3 max-w-[22ch] text-h2"
          >
            Hablá con un{' '}
            <span className="u-editorial text-accent">especialista</span> de OWNER.
          </h2>
          <p className="u-prose mt-4 text-body text-fg-dim">
            Te decimos qué modelo te conviene, cuánto sale con transferencia y cuándo llega. Sin
            vueltas y sin bots.
          </p>
        </div>

        <ButtonLink
          href={whatsappLink(
            'Hola OWNER, estoy viendo la tienda y quería hacer una consulta sobre un producto.',
          )}
          external
          size="lg"
          variant="secondary"
          className="justify-self-start md:justify-self-end"
        >
          Escribir por WhatsApp
        </ButtonLink>
      </div>
      <p className="u-container u-mono pb-6 text-micro text-fg-faint">
        Lun a sáb, 10 a 19 h · +{site.contact.whatsapp}
      </p>
    </section>
  );
}
