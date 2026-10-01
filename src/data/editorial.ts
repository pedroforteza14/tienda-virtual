/**
 * ⚠️ MOCK editorial content — customer quotes and "seen in the wild" entries.
 *
 * These are **written examples, not real customer reviews.** They exist so the
 * social-proof section can be designed and reviewed. Publishing invented reviews
 * as genuine would be deceptive (and in Argentina, a Ley 24.240 problem), so the
 * section renders a visible "contenido de demostración" label for as long as this
 * file is the source. Replace with real, attributed content before launch and the
 * label disappears with it.
 */

export const EDITORIAL_IS_MOCK = true;

export interface WildEntry {
  id: string;
  /** Where the object is, written like a photo caption. */
  caption: string;
  city: string;
  /** Which device, for the render. */
  render: 'phone-pro' | 'laptop' | 'watch' | 'earbuds' | 'tablet';
  color: { hex: string; hexAccent: string; name: string; light: boolean };
  /** Short customer line. Mock. */
  quote?: string;
  attribution?: string;
  /** Layout weight in the editorial grid: 1 = small, 2 = wide. */
  span: 1 | 2;
}

export const wildEntries: readonly WildEntry[] = Object.freeze([
  {
    id: 'w1',
    caption: 'Mesa de trabajo, 7:40 de la mañana',
    city: 'Villa Crespo, CABA',
    render: 'laptop',
    color: { hex: '#2A2A2C', hexAccent: '#3A3A3D', name: 'Negro Espacial', light: false },
    quote: 'Llegó en dos días y con la factura. Es la tercera compra que les hago.',
    attribution: 'Martina D.',
    span: 2,
  },
  {
    id: 'w2',
    caption: 'En el colectivo, cancelación al máximo',
    city: 'Línea 152',
    render: 'earbuds',
    color: { hex: '#F0EEEA', hexAccent: '#FAF9F7', name: 'Blanco', light: true },
    span: 1,
  },
  {
    id: 'w3',
    caption: 'Primer día con el 17 Pro',
    city: 'Rosario, Santa Fe',
    render: 'phone-pro',
    color: { hex: '#B9A288', hexAccent: '#CBB69D', name: 'Titanio Desierto', light: true },
    quote: 'Me explicaron por WhatsApp qué modelo me servía. No me vendieron el más caro.',
    attribution: 'Lucas F.',
    span: 1,
  },
  {
    id: 'w4',
    caption: 'Entrenando en Palermo',
    city: 'Bosques de Palermo',
    render: 'watch',
    color: { hex: '#A09E97', hexAccent: '#B9B7B0', name: 'Titanio Natural', light: true },
    span: 1,
  },
  {
    id: 'w5',
    caption: 'Bocetos de sábado',
    city: 'Córdoba Capital',
    render: 'tablet',
    color: { hex: '#A79BC0', hexAccent: '#B8AFCE', name: 'Púrpura', light: true },
    quote: 'Retiré en el showroom con turno. Diez minutos y listo.',
    attribution: 'Sofía R.',
    span: 2,
  },
]);

export interface TrustPoint {
  index: string;
  label: string;
  value: string;
  detail: string;
}

/**
 * Trust, as specifics rather than badges.
 *
 * A badge that says "SECURE" is decoration. "Garantía escrita de 12 meses, con
 * service en CABA" is a claim someone can hold us to — which is the only kind
 * worth making. The brief's §19 point, implemented as spec rails so it reads as
 * part of the system rather than as a trust bar bolted on.
 */
export const trustPoints: readonly TrustPoint[] = Object.freeze([
  {
    index: '01',
    label: 'Originales',
    value: 'Sellados y liberados',
    detail: 'Equipos nuevos, con caja cerrada y IMEI verificable. Nada reacondicionado sin decirlo.',
  },
  {
    index: '02',
    label: 'Garantía',
    value: '12 meses por escrito',
    detail: 'Cobertura propia y gestión del service oficial. Te damos el comprobante con la compra.',
  },
  {
    index: '03',
    label: 'Pagos',
    value: '12 cuotas sin interés',
    detail: 'O 12 % off pagando por transferencia. El precio de cada medio está siempre a la vista.',
  },
  {
    index: '04',
    label: 'Envíos',
    value: 'A todo el país',
    detail: 'Asegurado y con seguimiento. En CABA y GBA, mensajería propia. Retiro con turno previo.',
  },
  {
    index: '05',
    label: 'Atención',
    value: 'Personas, no bots',
    detail: 'Antes y después de comprar. El mismo WhatsApp te responde si algo sale mal.',
  },
]);
