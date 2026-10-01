import { ContactSchema } from '@/lib/validation/schemas';
import { guarded, jsonOk } from '@/server/security/guard';
import { logger } from '@/server/observability/logger';

/**
 * Contact form.
 *
 * Rate limited to 3 per 10 minutes, honeypot-checked by the schema, and the
 * message is length-capped and rejected if it contains angle brackets — so
 * nothing that reaches a future inbox or admin panel can carry markup.
 *
 * **[PRE-LAUNCH]** this logs the enquiry rather than delivering it. Wiring a
 * transactional email provider is a change to this handler only; the validation
 * and the limits are already where they need to be.
 */
export const POST = guarded({ bucket: 'contact', schema: ContactSchema }, async ({ data, requestId }) => {
  logger.info('contact.received', {
    requestId,
    // Pseudonymised by the logger; the name and message length are enough to
    // triage without storing the body in a log sink.
    email: data.email,
    nameLength: data.name.length,
    messageLength: data.message.length,
  });

  // Always the same response, whatever happens downstream: a contact form that
  // reports delivery failures differently is a probe for internal state.
  return jsonOk({ received: true });
});
