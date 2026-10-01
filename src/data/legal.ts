import { site } from '@/config/site';

/**
 * Legal and policy copy.
 *
 * ⚠️ These are **drafts written for the demo**, not reviewed legal text. Argentine
 * consumer law (Ley 24.240, and Ley 25.326 for personal data) sets specific
 * obligations — the 10-day right of withdrawal for distance selling, the content of
 * the privacy notice, the registration of the database — and a real storefront needs
 * a lawyer to confirm this wording before launch. Each page says so.
 *
 * The structure is deliberately simple (`{ heading, body[] }`) so replacing the
 * copy never touches a component.
 */

export const LEGAL_IS_DRAFT = true;

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalPage {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
}

export const legalPages: readonly LegalPage[] = Object.freeze([
  {
    slug: 'garantia',
    title: 'Garantía',
    summary: `Todos los equipos tienen ${site.commerce.warrantyMonths} meses de garantía por escrito.`,
    updated: '2026-01-15',
    sections: [
      {
        heading: 'Qué cubre',
        body: [
          `Cubrimos fallas de fabricación durante ${site.commerce.warrantyMonths} meses desde la fecha de compra, contra presentación del comprobante. Incluye la gestión del service oficial cuando corresponde.`,
          'Si el equipo falla dentro de los primeros 30 días, lo cambiamos por uno igual sin intermediarios, sujeto a disponibilidad del mismo modelo, color y capacidad.',
        ],
      },
      {
        heading: 'Qué no cubre',
        body: [
          'Daños por golpes, líquidos, uso indebido o reparaciones hechas por terceros no autorizados. Tampoco el desgaste normal de la batería por debajo del umbral que define el fabricante.',
        ],
      },
      {
        heading: 'Cómo reclamar',
        body: [
          `Escribinos por WhatsApp al +${site.contact.whatsapp} con la referencia del pedido y una descripción de la falla. Coordinamos el retiro o la visita al service.`,
        ],
      },
    ],
  },
  {
    slug: 'envios',
    title: 'Envíos y retiro',
    summary: 'A todo el país con seguro, o retiro en nuestro showroom con turno.',
    updated: '2026-01-15',
    sections: [
      {
        heading: 'Envíos',
        body: [
          'En CABA y GBA usamos mensajería propia, con seguimiento y entrega en mano. Al interior despachamos por transporte asegurado.',
          `Los envíos son sin cargo en compras desde $${site.commerce.freeShippingThresholdPesos.toLocaleString('es-AR')}. Por debajo de ese monto, el costo se calcula por zona y se muestra en el checkout antes de confirmar.`,
          'Despachamos el día hábil siguiente a la acreditación del pago. Los plazos estimados son de 1 a 2 días en CABA, 2 a 3 en GBA y 3 a 7 al interior.',
        ],
      },
      {
        heading: 'Retiro en showroom',
        body: [
          `${site.store.pickupNote} Te escribimos para coordinar día y horario después de confirmar el pedido.`,
          'Para retirar necesitás DNI y la referencia del pedido. Si retira otra persona, avisanos su nombre y DNI con anticipación.',
        ],
      },
      {
        heading: 'Revisión al recibir',
        body: [
          'Abrí la caja delante del transportista o en el showroom. Si el embalaje está dañado, dejalo asentado y escribinos el mismo día.',
        ],
      },
    ],
  },
  {
    slug: 'pagos',
    title: 'Medios de pago',
    summary: `Transferencia con ${site.commerce.transferDiscountPercent}% off, o tarjeta en ${site.commerce.interestFreeInstalments} cuotas sin interés.`,
    updated: '2026-01-15',
    sections: [
      {
        heading: 'Transferencia bancaria',
        body: [
          `Pagando por transferencia o depósito tenés ${site.commerce.transferDiscountPercent}% de descuento sobre el precio de lista. Al confirmar el pedido te mostramos los datos y la referencia que tenés que citar.`,
          'Reservamos el stock por 30 minutos desde que confirmás. Pasado ese plazo, el pedido vence y el stock vuelve a estar disponible.',
        ],
      },
      {
        heading: 'Tarjeta de crédito',
        body: [
          `Aceptamos tarjetas de crédito en ${site.commerce.interestFreeInstalments} cuotas sin interés sobre el precio de lista, a través de un procesador de pagos autorizado.`,
          'Los datos de tu tarjeta se ingresan directamente en el sitio del procesador. OWNER no los recibe, no los ve y no los almacena en ningún momento.',
        ],
      },
      {
        heading: 'Facturación',
        body: [
          'Emitimos factura por todas las ventas. Si necesitás factura A, decinoslo antes de confirmar e incluí tu CUIT y razón social en las indicaciones del pedido.',
        ],
      },
    ],
  },
  {
    slug: 'terminos',
    title: 'Términos y condiciones',
    summary: 'Las reglas de la compra, en lenguaje claro.',
    updated: '2026-01-15',
    sections: [
      {
        heading: 'Precios y disponibilidad',
        body: [
          'Los precios están expresados en pesos argentinos e incluyen IVA. Pueden cambiar sin aviso previo, pero el precio que se te confirma al generar el pedido es el que respetamos.',
          'La disponibilidad se verifica al momento de generar el pedido. Si un producto se queda sin stock entre que lo agregás al carrito y confirmás, te lo avisamos antes de cobrar.',
        ],
      },
      {
        heading: 'Derecho de arrepentimiento',
        body: [
          'Según el artículo 34 de la Ley 24.240, en las compras a distancia tenés 10 días corridos desde la recepción para arrepentirte y devolver el producto sin costo, siempre que esté sin uso y en su embalaje original. El costo de la devolución corre por nuestra cuenta.',
          `Para ejercerlo, escribinos al +${site.contact.whatsapp} o a ${site.contact.email} indicando la referencia del pedido.`,
        ],
      },
      {
        heading: 'Cancelaciones',
        body: [
          'Podés cancelar un pedido sin cargo mientras esté en estado "esperando pago". Si ya fue despachado, se aplica el procedimiento de devolución del punto anterior.',
        ],
      },
      {
        heading: 'Responsabilidad',
        body: [
          'Respondemos por los productos que vendemos en los términos de la Ley 24.240. No respondemos por daños derivados del uso indebido del equipo ni por la pérdida de datos: hacé copias de seguridad antes de cualquier service.',
        ],
      },
    ],
  },
  {
    slug: 'privacidad',
    title: 'Política de privacidad',
    summary: 'Qué datos pedimos, para qué, y cómo los cuidamos.',
    updated: '2026-01-15',
    sections: [
      {
        heading: 'Qué datos recolectamos',
        body: [
          'Para procesar un pedido pedimos nombre, email, teléfono y, si hay envío a domicilio, la dirección de entrega. Si elegís retiro en showroom, no pedimos dirección: sólo lo mínimo para poder cumplir.',
          'Si creás una cuenta, guardamos tu nombre, tu email y un hash de tu contraseña. No guardamos la contraseña en texto plano en ningún momento.',
          'Nunca pedimos ni almacenamos datos de tarjetas de crédito. Esa información se ingresa en el procesador de pagos y no pasa por nuestros servidores.',
        ],
      },
      {
        heading: 'Para qué los usamos',
        body: [
          'Exclusivamente para procesar tu pedido, coordinar la entrega, emitir la factura y darte soporte posventa. No vendemos ni cedemos tus datos a terceros con fines publicitarios.',
          'Compartimos lo mínimo necesario con el transportista (nombre, dirección, teléfono) y con el procesador de pagos (nombre, email, importe).',
        ],
      },
      {
        heading: 'Tus derechos',
        body: [
          'Según la Ley 25.326 podés acceder, rectificar y solicitar la supresión de tus datos personales de forma gratuita. Escribinos a ' + site.contact.email + ' y te respondemos dentro de los plazos legales.',
          'La Agencia de Acceso a la Información Pública es el órgano de control de la Ley 25.326 y tiene la atribución de atender las denuncias y reclamos relacionados con el incumplimiento de las normas sobre protección de datos personales.',
        ],
      },
      {
        heading: 'Cookies',
        body: [
          'Usamos cookies propias, estrictamente necesarias para que funcione el carrito y la sesión. No usamos cookies de publicidad ni de seguimiento de terceros, así que no hay nada que aceptar ni rechazar.',
        ],
      },
      {
        heading: 'Seguridad',
        body: [
          'Las cookies de sesión son firmadas, HttpOnly y Secure. El sitio se sirve sólo por HTTPS con una política de seguridad de contenido estricta. El detalle técnico de los controles está publicado en el archivo SECURITY.md del repositorio.',
        ],
      },
    ],
  },
]);

export function getLegalPage(slug: string): LegalPage | null {
  return legalPages.find((page) => page.slug === slug) ?? null;
}
