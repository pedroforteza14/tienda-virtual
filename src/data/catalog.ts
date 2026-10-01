import { pesos } from '@/lib/money';
import type { Category, Colorway, Product, Spec, Variant } from '@/types/catalog';

/**
 * ⚠️  MOCK CATALOGUE. Every price here is invented. See src/data/README.md.
 * The UI surfaces this flag as a visible notice; do not flip it without
 * replacing the data.
 */
export const PRICES_ARE_MOCK = true;

/* -------------------------------------------------------------------------- */
/* Builders                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic stock. A random value would make tests flaky and screenshot
 * diffs meaningless, so units-on-hand is a pure function of the SKU.
 * FNV-1a — short, no dependency, good enough for spreading values.
 */
function pseudoStock(sku: string, max = 12): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sku.length; i += 1) {
    hash ^= sku.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // 1 in 9 variants is out of stock, so the out-of-stock UI is always exercised.
  return hash % 9 === 0 ? 0 : (hash % max) + 1;
}

function slugifyTier(tier: string): string {
  return tier.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

interface VariantSpec {
  slug: string;
  colors: Colorway[];
  /** Storage tiers or case sizes, cheapest/smallest first. */
  tiers: string[];
  tierKind: 'storage' | 'size' | 'none';
  /** Price of the first tier, in pesos. */
  basePesos: number;
  /** Added per tier step, in pesos. */
  stepPesos: number;
}

function buildVariants({
  slug,
  colors,
  tiers,
  tierKind,
  basePesos,
  stepPesos,
}: VariantSpec): Variant[] {
  const tierList = tierKind === 'none' ? [''] : tiers;
  const variants: Variant[] = [];

  for (const color of colors) {
    tierList.forEach((tier, tierIndex) => {
      const sku = ['OWN', slug.toUpperCase().replace(/[^A-Z0-9]/g, ''), color.id.toUpperCase()]
        .concat(tier ? [slugifyTier(tier).toUpperCase()] : [])
        .join('-');

      variants.push({
        sku,
        colorId: color.id,
        ...(tierKind === 'storage' && tier ? { storage: tier } : {}),
        ...(tierKind === 'size' && tier ? { size: tier } : {}),
        priceList: pesos(basePesos + tierIndex * stepPesos),
        stock: pseudoStock(sku),
      });
    });
  }

  /**
   * Guarantee at least one buyable variant per product.
   *
   * The 1-in-9 zero rule is there so the sold-out states are always reachable,
   * but applied blindly it can zero *every* variant of a single-SKU product —
   * which it did to AirPods 4, leaving a listing nobody could buy and an e2e
   * suite that failed on a product it had hardcoded. A product with no sellable
   * variant is a data bug, not a realistic edge case; individual variants may
   * still be sold out, and `tests/unit/catalog.test.ts` asserts both halves.
   */
  if (variants.every((variant) => variant.stock === 0)) {
    const first = variants[0];
    if (first) first.stock = 4;
  }

  return variants;
}

function specs(...rows: [label: string, value: string][]): Spec[] {
  return rows.map(([label, value], i) => ({
    index: String(i + 1).padStart(2, '0'),
    label,
    value,
  }));
}

/* -------------------------------------------------------------------------- */
/* Colourways                                                                  */
/* -------------------------------------------------------------------------- */

const TITANIUM: Colorway[] = [
  { id: 'nat', name: 'Titanio Natural', hex: '#9E9C96', hexAccent: '#B8B6AF', light: true },
  { id: 'blk', name: 'Titanio Negro', hex: '#2B2B2D', hexAccent: '#3C3C3F' },
  { id: 'dsr', name: 'Titanio Desierto', hex: '#B9A288', hexAccent: '#CBB69D', light: true },
  { id: 'wht', name: 'Titanio Blanco', hex: '#E3E0DA', hexAccent: '#F0EEE9', light: true },
];

const IPHONE_17: Colorway[] = [
  { id: 'blk', name: 'Negro', hex: '#1B1B1D', hexAccent: '#2C2C2F' },
  { id: 'wht', name: 'Blanco', hex: '#E9E6E0', hexAccent: '#F4F2EE', light: true },
  { id: 'lav', name: 'Lavanda', hex: '#B6AECB', hexAccent: '#C8C1D8', light: true },
  { id: 'sge', name: 'Salvia', hex: '#A3B3A0', hexAccent: '#B6C4B3', light: true },
  { id: 'mst', name: 'Niebla', hex: '#C9CDCE', hexAccent: '#DADDDE', light: true },
];

const IPHONE_AIR: Colorway[] = [
  { id: 'sky', name: 'Titanio Cielo', hex: '#A9BACB', hexAccent: '#BECCDA', light: true },
  { id: 'blk', name: 'Titanio Negro', hex: '#26262A', hexAccent: '#37373C' },
  { id: 'wht', name: 'Titanio Blanco', hex: '#E5E2DC', hexAccent: '#F1EFEB', light: true },
  { id: 'gld', name: 'Titanio Oro', hex: '#C8AE82', hexAccent: '#D8C29B', light: true },
];

const MAC_PRO_COLORS: Colorway[] = [
  { id: 'blk', name: 'Negro Espacial', hex: '#2A2A2C', hexAccent: '#3A3A3D' },
  { id: 'slv', name: 'Plata', hex: '#CFCFCF', hexAccent: '#E2E2E2', light: true },
];

const MAC_AIR_COLORS: Colorway[] = [
  { id: 'sky', name: 'Azul Cielo', hex: '#A7B8CC', hexAccent: '#BCC9D9', light: true },
  { id: 'mid', name: 'Medianoche', hex: '#23262E', hexAccent: '#33373F' },
  { id: 'str', name: 'Blanco Estelar', hex: '#E5DED2', hexAccent: '#F0EBE2', light: true },
  { id: 'slv', name: 'Plata', hex: '#CFCFCF', hexAccent: '#E2E2E2', light: true },
];

const IMAC_COLORS: Colorway[] = [
  { id: 'blu', name: 'Azul', hex: '#5E7FA8', hexAccent: '#7794B8' },
  { id: 'grn', name: 'Verde', hex: '#6B8F72', hexAccent: '#84A48A' },
  { id: 'pnk', name: 'Rosa', hex: '#C98F93', hexAccent: '#D7A6A9', light: true },
  { id: 'slv', name: 'Plata', hex: '#CFCFCF', hexAccent: '#E2E2E2', light: true },
];

const IPAD_PRO_COLORS: Colorway[] = MAC_PRO_COLORS;

const IPAD_AIR_COLORS: Colorway[] = [
  { id: 'blu', name: 'Azul', hex: '#8FA4BE', hexAccent: '#A5B6CC', light: true },
  { id: 'pur', name: 'Púrpura', hex: '#A79BC0', hexAccent: '#B8AFCE', light: true },
  { id: 'str', name: 'Blanco Estelar', hex: '#E3DCD0', hexAccent: '#EFEAE1', light: true },
  { id: 'gry', name: 'Gris Espacial', hex: '#5A5C60', hexAccent: '#6E7074' },
];

const IPAD_COLORS: Colorway[] = [
  { id: 'blu', name: 'Azul', hex: '#7D9DC4', hexAccent: '#94AFD1', light: true },
  { id: 'pnk', name: 'Rosa', hex: '#D5A4A8', hexAccent: '#E0B8BB', light: true },
  { id: 'ylw', name: 'Amarillo', hex: '#D9C286', hexAccent: '#E5D2A2', light: true },
  { id: 'slv', name: 'Plata', hex: '#CFCFCF', hexAccent: '#E2E2E2', light: true },
];

const WATCH_ALU: Colorway[] = [
  { id: 'mid', name: 'Aluminio Medianoche', hex: '#232630', hexAccent: '#343743' },
  { id: 'slv', name: 'Aluminio Plata', hex: '#D2D2D2', hexAccent: '#E5E5E5', light: true },
  { id: 'rsg', name: 'Aluminio Oro Rosa', hex: '#C9A396', hexAccent: '#D8B8AC', light: true },
];

const WATCH_TI: Colorway[] = [
  { id: 'nat', name: 'Titanio Natural', hex: '#A09E97', hexAccent: '#B9B7B0', light: true },
  { id: 'blk', name: 'Titanio Negro', hex: '#2C2C2E', hexAccent: '#3D3D40' },
];

const WHITE_ONLY: Colorway[] = [
  { id: 'wht', name: 'Blanco', hex: '#F0EEEA', hexAccent: '#FAF9F7', light: true },
];

const SILVER_ONLY: Colorway[] = [
  { id: 'slv', name: 'Plata', hex: '#CBCBCB', hexAccent: '#DEDEDE', light: true },
];

const CASE_COLORS: Colorway[] = [
  { id: 'blk', name: 'Negro', hex: '#1E1E20', hexAccent: '#2E2E31' },
  { id: 'tan', name: 'Arena', hex: '#C3AE92', hexAccent: '#D2C0A8', light: true },
  { id: 'blu', name: 'Azul Profundo', hex: '#33475E', hexAccent: '#445A73' },
  { id: 'cly', name: 'Terracota', hex: '#A8563F', hexAccent: '#BB6B53' },
];

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

export const categories: readonly Category[] = Object.freeze([
  {
    slug: 'iphone',
    name: 'iPhone',
    display: 'The one you reach for',
    blurb: 'Desde el 16e hasta el 17 Pro Max. Todos liberados, todos con garantía.',
    render: 'phone-pro',
  },
  {
    slug: 'mac',
    name: 'Mac',
    display: 'Work that holds up',
    blurb: 'MacBook Air, MacBook Pro, Mac mini e iMac. Para trabajar y para producir.',
    render: 'laptop',
  },
  {
    slug: 'ipad',
    name: 'iPad',
    display: 'A surface for ideas',
    blurb: 'iPad, iPad Air e iPad Pro. Con Pencil, se vuelve otra cosa.',
    render: 'tablet',
  },
  {
    slug: 'watch',
    name: 'Watch',
    display: 'Worn, not carried',
    blurb: 'Series 11, Ultra 3 y SE 3. Con la correa que elijas.',
    render: 'watch',
  },
  {
    slug: 'airpods',
    name: 'AirPods',
    display: 'Silence, on demand',
    blurb: 'AirPods 4 y AirPods Pro 3. Cancelación de ruido que se nota.',
    render: 'earbuds',
  },
  {
    slug: 'accessories',
    name: 'Accesorios',
    display: 'The rest of the kit',
    blurb: 'Fundas, carga y Pencil. Lo que completa el equipo.',
    render: 'case',
  },
]);

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

const IPHONE_STORAGE_PRO = ['256 GB', '512 GB', '1 TB', '2 TB'];
const IPHONE_STORAGE = ['256 GB', '512 GB'];

export const products: readonly Product[] = Object.freeze([
  {
    slug: 'iphone-17-pro-max',
    name: 'iPhone 17 Pro Max',
    family: 'iphone',
    tagline: 'The long game.',
    summary:
      'La batería más grande que puso Apple en un teléfono, con el chip A19 Pro y un sistema de ' +
      'cámaras de tres lentes de 48 MP. Es el iPhone para quien no quiere pensar en el cargador.',
    render: 'phone-pro',
    colors: TITANIUM,
    storages: IPHONE_STORAGE_PRO,
    sizes: [],
    variants: buildVariants({
      slug: 'iphone-17-pro-max',
      colors: TITANIUM,
      tiers: IPHONE_STORAGE_PRO,
      tierKind: 'storage',
      basePesos: 3_450_000,
      stepPesos: 450_000,
    }),
    specs: specs(
      ['Pantalla', 'Super Retina XDR de 6,9" · ProMotion 120 Hz'],
      ['Chip', 'A19 Pro · Neural Engine de 16 núcleos'],
      ['Cámaras', 'Triple 48 MP · teleobjetivo 4x'],
      ['Batería', 'Hasta 39 h de video'],
      ['Material', 'Unibody de aluminio y Ceramic Shield 2'],
      ['Conectividad', '5G · Wi-Fi 7 · USB-C 3'],
    ),
    highlights: [
      'Autonomía real de dos días de uso normal',
      'Teleobjetivo 4x para retrato sin acercarte',
      'Grabación ProRes RAW directo a disco externo',
    ],
    useCases: ['work', 'creative', 'travel'],
    releasedAt: '2025-09-19',
    rank: 100,
    featured: true,
    seo: {
      title: 'iPhone 17 Pro Max — precio en Argentina, cuotas y stock',
      description:
        'iPhone 17 Pro Max en OWNER STORE: 256 GB a 2 TB, cuatro acabados de titanio. Precio ' +
        'transferencia, 12 cuotas sin interés y envío a todo el país. Producto original con garantía.',
    },
    pairsWith: ['OWN-AIRPODSPRO3-WHT', 'OWN-FUNDASILICONAIPHONE17PRO-BLK', 'OWN-MAGSAFECHARGER-WHT'],
  },
  {
    slug: 'iphone-17-pro',
    name: 'iPhone 17 Pro',
    family: 'iphone',
    tagline: 'All of it, smaller.',
    summary:
      'El mismo chip A19 Pro y el mismo sistema de cámaras que el Pro Max, en un cuerpo de 6,3" ' +
      'que entra en una mano. Para quien quiere todo pero no quiere el tamaño.',
    render: 'phone-pro',
    colors: TITANIUM,
    storages: ['256 GB', '512 GB', '1 TB'],
    sizes: [],
    variants: buildVariants({
      slug: 'iphone-17-pro',
      colors: TITANIUM,
      tiers: ['256 GB', '512 GB', '1 TB'],
      tierKind: 'storage',
      basePesos: 2_950_000,
      stepPesos: 420_000,
    }),
    specs: specs(
      ['Pantalla', 'Super Retina XDR de 6,3" · ProMotion 120 Hz'],
      ['Chip', 'A19 Pro · Neural Engine de 16 núcleos'],
      ['Cámaras', 'Triple 48 MP · teleobjetivo 4x'],
      ['Batería', 'Hasta 31 h de video'],
      ['Material', 'Unibody de aluminio y Ceramic Shield 2'],
      ['Conectividad', '5G · Wi-Fi 7 · USB-C 3'],
    ),
    highlights: [
      'Formato de 6,3" que se usa con una mano',
      'Mismo sistema de cámaras que el Pro Max',
      'Carga rápida al 50 % en 20 minutos',
    ],
    useCases: ['work', 'creative', 'everyday'],
    releasedAt: '2025-09-19',
    rank: 98,
    featured: true,
    seo: {
      title: 'iPhone 17 Pro — precio en Argentina, cuotas y stock',
      description:
        'iPhone 17 Pro en OWNER STORE: 256 GB, 512 GB y 1 TB en titanio. Precio transferencia, ' +
        '12 cuotas sin interés, envío a todo el país y garantía de 12 meses.',
    },
    pairsWith: ['OWN-AIRPODSPRO3-WHT', 'OWN-FUNDASILICONAIPHONE17PRO-TAN', 'OWN-MAGSAFECHARGER-WHT'],
  },
  {
    slug: 'iphone-17',
    name: 'iPhone 17',
    family: 'iphone',
    tagline: 'The honest one.',
    summary:
      'Pantalla ProMotion de 120 Hz, chip A19 y cámara frontal Center Stage. Es el iPhone que ' +
      'alcanza para el 95 % de la gente, y lo sabe.',
    render: 'phone',
    colors: IPHONE_17,
    storages: IPHONE_STORAGE,
    sizes: [],
    variants: buildVariants({
      slug: 'iphone-17',
      colors: IPHONE_17,
      tiers: IPHONE_STORAGE,
      tierKind: 'storage',
      basePesos: 2_150_000,
      stepPesos: 380_000,
    }),
    specs: specs(
      ['Pantalla', 'Super Retina XDR de 6,3" · ProMotion 120 Hz'],
      ['Chip', 'A19'],
      ['Cámaras', 'Dual Fusion de 48 MP'],
      ['Frontal', 'Center Stage de 18 MP'],
      ['Batería', 'Hasta 30 h de video'],
      ['Material', 'Aluminio y Ceramic Shield 2'],
    ),
    highlights: [
      'ProMotion de 120 Hz, antes exclusivo de los Pro',
      'Cinco colores, todos con terminación mate',
      'La mejor relación precio-prestación de la línea',
    ],
    useCases: ['everyday', 'entertainment', 'travel'],
    releasedAt: '2025-09-19',
    rank: 95,
    featured: true,
    seo: {
      title: 'iPhone 17 — precio en Argentina, cuotas y stock',
      description:
        'iPhone 17 en OWNER STORE: 256 GB y 512 GB en cinco colores. Precio transferencia, ' +
        '12 cuotas sin interés y envío a todo el país.',
    },
    pairsWith: ['OWN-AIRPODS4-WHT', 'OWN-MAGSAFECHARGER-WHT'],
  },
  {
    slug: 'iphone-air',
    name: 'iPhone Air',
    family: 'iphone',
    tagline: 'Almost nothing.',
    summary:
      '5,6 mm de titanio. El iPhone más fino que se fabricó, con el chip A19 Pro y una sola ' +
      'cámara de 48 MP que hace el trabajo de tres.',
    render: 'phone',
    colors: IPHONE_AIR,
    storages: ['256 GB', '512 GB', '1 TB'],
    sizes: [],
    variants: buildVariants({
      slug: 'iphone-air',
      colors: IPHONE_AIR,
      tiers: ['256 GB', '512 GB', '1 TB'],
      tierKind: 'storage',
      basePesos: 2_650_000,
      stepPesos: 400_000,
    }),
    specs: specs(
      ['Pantalla', 'Super Retina XDR de 6,5" · ProMotion 120 Hz'],
      ['Espesor', '5,6 mm'],
      ['Chip', 'A19 Pro'],
      ['Cámara', 'Fusion de 48 MP con teleobjetivo 2x'],
      ['Material', 'Titanio grado 5'],
      ['Conectividad', 'eSIM únicamente · 5G · Wi-Fi 7'],
    ),
    highlights: [
      'Pesa 165 g: se nota en el bolsillo',
      'Titanio grado 5 en todo el chasis',
      'Solo eSIM — verificá que tu operador la soporte',
    ],
    useCases: ['everyday', 'travel', 'work'],
    releasedAt: '2025-09-19',
    rank: 92,
    featured: false,
    seo: {
      title: 'iPhone Air — el iPhone más fino, precio en Argentina',
      description:
        'iPhone Air en OWNER STORE: 5,6 mm de titanio, chip A19 Pro, 256 GB a 1 TB. Precio ' +
        'transferencia y 12 cuotas sin interés.',
    },
    pairsWith: ['OWN-AIRPODSPRO3-WHT', 'OWN-MAGSAFECHARGER-WHT'],
  },
  {
    slug: 'iphone-16e',
    name: 'iPhone 16e',
    family: 'iphone',
    tagline: 'The way in.',
    summary:
      'Chip A18, Face ID y una cámara de 48 MP, al precio más bajo de la línea. El primer ' +
      'iPhone de alguien, sin que se sienta como un descarte.',
    render: 'phone',
    colors: [
      { id: 'blk', name: 'Negro', hex: '#1C1C1E', hexAccent: '#2D2D30' },
      { id: 'wht', name: 'Blanco', hex: '#EAE7E1', hexAccent: '#F5F3EF', light: true },
    ],
    storages: ['128 GB', '256 GB', '512 GB'],
    sizes: [],
    variants: buildVariants({
      slug: 'iphone-16e',
      colors: [
        { id: 'blk', name: 'Negro', hex: '#1C1C1E', hexAccent: '#2D2D30' },
        { id: 'wht', name: 'Blanco', hex: '#EAE7E1', hexAccent: '#F5F3EF', light: true },
      ],
      tiers: ['128 GB', '256 GB', '512 GB'],
      tierKind: 'storage',
      basePesos: 1_490_000,
      stepPesos: 250_000,
    }),
    specs: specs(
      ['Pantalla', 'Super Retina XDR de 6,1"'],
      ['Chip', 'A18'],
      ['Cámara', 'Fusion de 48 MP'],
      ['Batería', 'Hasta 26 h de video'],
      ['Seguridad', 'Face ID'],
      ['Conectividad', '5G · USB-C'],
    ),
    highlights: [
      'El acceso más barato a iOS con Face ID',
      'Mismo USB-C que el resto de la línea',
      'Apple Intelligence incluido',
    ],
    useCases: ['everyday', 'travel'],
    releasedAt: '2025-02-28',
    rank: 80,
    featured: false,
    seo: {
      title: 'iPhone 16e — precio en Argentina y cuotas',
      description:
        'iPhone 16e en OWNER STORE: 128 GB a 512 GB, chip A18 y Face ID. El iPhone más ' +
        'accesible, con garantía y envío a todo el país.',
    },
    pairsWith: ['OWN-AIRPODS4-WHT', 'OWN-MAGSAFECHARGER-WHT'],
  },

  /* ------------------------------- Mac ---------------------------------- */
  {
    slug: 'macbook-pro-14-m5',
    name: 'MacBook Pro 14" M5',
    family: 'mac',
    tagline: 'Renders while you sleep.',
    summary:
      'Chip M5 con GPU de 10 núcleos y pantalla Liquid Retina XDR. Compila, exporta y edita ' +
      '4K multicapa sin que el ventilador aparezca en la conversación.',
    render: 'laptop',
    colors: MAC_PRO_COLORS,
    storages: ['512 GB', '1 TB', '2 TB'],
    sizes: [],
    variants: buildVariants({
      slug: 'macbook-pro-14-m5',
      colors: MAC_PRO_COLORS,
      tiers: ['512 GB', '1 TB', '2 TB'],
      tierKind: 'storage',
      basePesos: 4_250_000,
      stepPesos: 700_000,
    }),
    specs: specs(
      ['Pantalla', 'Liquid Retina XDR de 14,2" · 1600 nits HDR'],
      ['Chip', 'M5 · CPU 10 núcleos · GPU 10 núcleos'],
      ['Memoria', '16 GB unificada (ampliable a 32 GB)'],
      ['Batería', 'Hasta 24 h'],
      ['Puertos', '3× Thunderbolt 4 · HDMI · SDXC · MagSafe 3'],
      ['Audio', 'Seis parlantes con audio espacial'],
    ),
    highlights: [
      'Pantalla de 1600 nits para HDR real',
      'Puertos que no necesitan un dongle',
      '24 horas de batería sin bajar el brillo',
    ],
    useCases: ['work', 'creative'],
    releasedAt: '2025-10-22',
    rank: 97,
    featured: true,
    seo: {
      title: 'MacBook Pro 14" M5 — precio en Argentina y cuotas',
      description:
        'MacBook Pro 14" con chip M5 en OWNER STORE: 512 GB a 2 TB, Negro Espacial o Plata. ' +
        'Precio transferencia, 12 cuotas sin interés y garantía de 12 meses.',
    },
    pairsWith: ['OWN-AIRPODSPRO3-WHT', 'OWN-IPADPRO13M5-BLK-256GB'],
  },
  {
    slug: 'macbook-air-13-m4',
    name: 'MacBook Air 13" M4',
    family: 'mac',
    tagline: 'The default answer.',
    summary:
      '1,24 kg, sin ventilador y con 18 horas de batería. Para el 90 % de los trabajos, es la ' +
      'computadora correcta y no hay mucho más que discutir.',
    render: 'laptop',
    colors: MAC_AIR_COLORS,
    storages: ['256 GB', '512 GB', '1 TB'],
    sizes: [],
    variants: buildVariants({
      slug: 'macbook-air-13-m4',
      colors: MAC_AIR_COLORS,
      tiers: ['256 GB', '512 GB', '1 TB'],
      tierKind: 'storage',
      basePesos: 2_390_000,
      stepPesos: 480_000,
    }),
    specs: specs(
      ['Pantalla', 'Liquid Retina de 13,6" · 500 nits'],
      ['Chip', 'M4 · CPU 10 núcleos · GPU 8 núcleos'],
      ['Memoria', '16 GB unificada'],
      ['Batería', 'Hasta 18 h'],
      ['Peso', '1,24 kg'],
      ['Puertos', '2× Thunderbolt 4 · MagSafe 3 · jack 3,5 mm'],
    ),
    highlights: [
      'Sin ventilador: absolutamente silenciosa',
      'Soporta dos monitores externos con la tapa abierta',
      'Azul Cielo es el color nuevo de la línea',
    ],
    useCases: ['work', 'everyday', 'travel'],
    releasedAt: '2025-03-12',
    rank: 94,
    featured: true,
    seo: {
      title: 'MacBook Air 13" M4 — precio en Argentina y cuotas',
      description:
        'MacBook Air 13" M4 en OWNER STORE: 256 GB a 1 TB en cuatro colores. Precio ' +
        'transferencia, 12 cuotas sin interés y envío a todo el país.',
    },
    pairsWith: ['OWN-AIRPODS4-WHT', 'OWN-MAGSAFECHARGER-WHT'],
  },
  {
    slug: 'mac-mini-m4',
    name: 'Mac mini M4',
    family: 'mac',
    tagline: '12.7 cm of desk.',
    summary:
      'Un cubo de 12,7 cm de lado con chip M4 y puertos adelante. Traé tu monitor, tu teclado ' +
      'y listo: es el Mac más barato que existe.',
    render: 'compact',
    colors: SILVER_ONLY,
    storages: ['256 GB', '512 GB', '1 TB'],
    sizes: [],
    variants: buildVariants({
      slug: 'mac-mini-m4',
      colors: SILVER_ONLY,
      tiers: ['256 GB', '512 GB', '1 TB'],
      tierKind: 'storage',
      basePesos: 1_190_000,
      stepPesos: 380_000,
    }),
    specs: specs(
      ['Chip', 'M4 · CPU 10 núcleos · GPU 10 núcleos'],
      ['Memoria', '16 GB unificada'],
      ['Tamaño', '12,7 × 12,7 × 5 cm'],
      ['Puertos', '2× USB-C frontal · 3× Thunderbolt 4 · HDMI · Ethernet'],
      ['Video', 'Hasta tres monitores 6K'],
      ['Consumo', '4 W en reposo'],
    ),
    highlights: [
      'Puertos USB-C en el frente, por fin',
      'Entra en cualquier escritorio',
      'Tres monitores 6K desde una caja de 12 cm',
    ],
    useCases: ['work', 'creative', 'everyday'],
    releasedAt: '2024-11-08',
    rank: 85,
    featured: false,
    seo: {
      title: 'Mac mini M4 — precio en Argentina y cuotas',
      description:
        'Mac mini con chip M4 en OWNER STORE: 256 GB a 1 TB. El Mac de escritorio más ' +
        'accesible, con garantía de 12 meses y envío a todo el país.',
    },
    pairsWith: ['OWN-AIRPODS4-WHT'],
  },
  {
    slug: 'imac-24-m4',
    name: 'iMac 24" M4',
    family: 'mac',
    tagline: 'One cable. Done.',
    summary:
      'Pantalla Retina 4,5K de 24", chip M4 y 11,5 mm de espesor. Se enchufa una sola vez y ' +
      'queda bien en cualquier lugar de la casa.',
    render: 'desktop',
    colors: IMAC_COLORS,
    storages: ['256 GB', '512 GB'],
    sizes: [],
    variants: buildVariants({
      slug: 'imac-24-m4',
      colors: IMAC_COLORS,
      tiers: ['256 GB', '512 GB'],
      tierKind: 'storage',
      basePesos: 2_090_000,
      stepPesos: 420_000,
    }),
    specs: specs(
      ['Pantalla', 'Retina 4,5K de 23,5" · 500 nits · P3'],
      ['Chip', 'M4 · CPU 10 núcleos · GPU 10 núcleos'],
      ['Memoria', '16 GB unificada'],
      ['Cámara', 'Center Stage de 12 MP'],
      ['Espesor', '11,5 mm'],
      ['Incluye', 'Magic Keyboard y Magic Mouse a tono'],
    ),
    highlights: [
      'Un solo cable para todo el equipo',
      'Teclado y mouse del mismo color incluidos',
      'Cuatro colores en vidrio satinado',
    ],
    useCases: ['everyday', 'work', 'entertainment'],
    releasedAt: '2024-11-08',
    rank: 78,
    featured: false,
    seo: {
      title: 'iMac 24" M4 — precio en Argentina y cuotas',
      description:
        'iMac 24" con chip M4 en OWNER STORE: cuatro colores, 256 GB o 512 GB. Incluye Magic ' +
        'Keyboard y Magic Mouse. Precio transferencia y 12 cuotas sin interés.',
    },
    pairsWith: ['OWN-AIRPODS4-WHT'],
  },

  /* ------------------------------ iPad ---------------------------------- */
  {
    slug: 'ipad-pro-13-m5',
    name: 'iPad Pro 13" M5',
    family: 'ipad',
    tagline: 'Thinner than the pencil.',
    summary:
      '5,1 mm con pantalla Ultra Retina XDR en tándem OLED y chip M5. Con Magic Keyboard ' +
      'reemplaza a una notebook; sin ella, es el mejor lienzo que hay.',
    render: 'tablet',
    colors: IPAD_PRO_COLORS,
    storages: ['256 GB', '512 GB', '1 TB', '2 TB'],
    sizes: [],
    variants: buildVariants({
      slug: 'ipad-pro-13-m5',
      colors: IPAD_PRO_COLORS,
      tiers: ['256 GB', '512 GB', '1 TB', '2 TB'],
      tierKind: 'storage',
      basePesos: 3_190_000,
      stepPesos: 520_000,
    }),
    specs: specs(
      ['Pantalla', 'Ultra Retina XDR de 13" · OLED en tándem · 1600 nits'],
      ['Chip', 'M5 · Neural Accelerators por núcleo de GPU'],
      ['Espesor', '5,1 mm'],
      ['Cámara', '12 MP trasera con escáner LiDAR'],
      ['Compatibilidad', 'Apple Pencil Pro · Magic Keyboard'],
      ['Conectividad', 'Thunderbolt · Wi-Fi 7'],
    ),
    highlights: [
      'OLED en tándem: negros reales y 1600 nits',
      'Thunderbolt para grabar a disco externo',
      'Apple Pencil Pro con respuesta háptica',
    ],
    useCases: ['creative', 'work', 'entertainment'],
    releasedAt: '2025-10-22',
    rank: 93,
    featured: true,
    seo: {
      title: 'iPad Pro 13" M5 — precio en Argentina y cuotas',
      description:
        'iPad Pro 13" con chip M5 y pantalla OLED en tándem. 256 GB a 2 TB en OWNER STORE. ' +
        'Precio transferencia, 12 cuotas sin interés y garantía de 12 meses.',
    },
    pairsWith: ['OWN-APPLEPENCILPRO-WHT', 'OWN-AIRPODSPRO3-WHT'],
  },
  {
    slug: 'ipad-air-11-m3',
    name: 'iPad Air 11" M3',
    family: 'ipad',
    tagline: 'The useful middle.',
    summary:
      'Chip M3, pantalla Liquid Retina de 11" y soporte para Apple Pencil Pro. Hace casi todo ' +
      'lo que hace el Pro, por bastante menos.',
    render: 'tablet',
    colors: IPAD_AIR_COLORS,
    storages: ['128 GB', '256 GB', '512 GB'],
    sizes: [],
    variants: buildVariants({
      slug: 'ipad-air-11-m3',
      colors: IPAD_AIR_COLORS,
      tiers: ['128 GB', '256 GB', '512 GB'],
      tierKind: 'storage',
      basePesos: 1_390_000,
      stepPesos: 300_000,
    }),
    specs: specs(
      ['Pantalla', 'Liquid Retina de 11" · 500 nits · P3'],
      ['Chip', 'M3 · CPU 8 núcleos · GPU 9 núcleos'],
      ['Cámara', '12 MP trasera · frontal horizontal'],
      ['Compatibilidad', 'Apple Pencil Pro · Magic Keyboard'],
      ['Batería', 'Hasta 10 h'],
      ['Conectividad', 'USB-C · Wi-Fi 6E'],
    ),
    highlights: [
      'Cámara frontal en el lado horizontal, para videollamadas',
      'Soporta Apple Pencil Pro completo',
      'Cuatro colores con terminación anodizada',
    ],
    useCases: ['everyday', 'creative', 'travel'],
    releasedAt: '2025-03-12',
    rank: 86,
    featured: false,
    seo: {
      title: 'iPad Air 11" M3 — precio en Argentina y cuotas',
      description:
        'iPad Air 11" con chip M3 en OWNER STORE: 128 GB a 512 GB en cuatro colores. Precio ' +
        'transferencia, 12 cuotas sin interés y envío a todo el país.',
    },
    pairsWith: ['OWN-APPLEPENCILPRO-WHT', 'OWN-AIRPODS4-WHT'],
  },
  {
    slug: 'ipad-11',
    name: 'iPad 11"',
    family: 'ipad',
    tagline: 'For everyone else.',
    summary:
      'El iPad de entrada, con chip A16 y 128 GB de base. Para leer, mirar, dibujar y pasarle ' +
      'a los chicos sin miedo.',
    render: 'tablet',
    colors: IPAD_COLORS,
    storages: ['128 GB', '256 GB'],
    sizes: [],
    variants: buildVariants({
      slug: 'ipad-11',
      colors: IPAD_COLORS,
      tiers: ['128 GB', '256 GB'],
      tierKind: 'storage',
      basePesos: 890_000,
      stepPesos: 220_000,
    }),
    specs: specs(
      ['Pantalla', 'Liquid Retina de 11" · 500 nits'],
      ['Chip', 'A16'],
      ['Cámara', '12 MP trasera y frontal'],
      ['Compatibilidad', 'Apple Pencil (USB-C)'],
      ['Batería', 'Hasta 10 h'],
      ['Conectividad', 'USB-C · Wi-Fi 6'],
    ),
    highlights: [
      '128 GB de almacenamiento base',
      'Cuatro colores vivos',
      'El iPad más barato para empezar',
    ],
    useCases: ['everyday', 'entertainment'],
    releasedAt: '2025-03-12',
    rank: 70,
    featured: false,
    seo: {
      title: 'iPad 11" — precio en Argentina y cuotas',
      description:
        'iPad 11" con chip A16 en OWNER STORE: 128 GB o 256 GB en cuatro colores. El iPad ' +
        'más accesible, con garantía y envío a todo el país.',
    },
    pairsWith: ['OWN-AIRPODS4-WHT'],
  },

  /* ------------------------------ Watch --------------------------------- */
  {
    slug: 'apple-watch-series-11',
    name: 'Apple Watch Series 11',
    family: 'watch',
    tagline: 'Knows before you do.',
    summary:
      'Detección de hipertensión, puntaje de sueño y 24 horas de batería. Es el Watch que ' +
      'elige casi todo el mundo, y con razón.',
    render: 'watch',
    colors: WATCH_ALU,
    storages: [],
    sizes: ['42 mm', '46 mm'],
    variants: buildVariants({
      slug: 'apple-watch-series-11',
      colors: WATCH_ALU,
      tiers: ['42 mm', '46 mm'],
      tierKind: 'size',
      basePesos: 1_190_000,
      stepPesos: 120_000,
    }),
    specs: specs(
      ['Pantalla', 'Retina LTPO3 siempre activa · 2000 nits'],
      ['Batería', 'Hasta 24 h · carga rápida'],
      ['Salud', 'ECG · oxígeno en sangre · hipertensión · puntaje de sueño'],
      ['Resistencia', '50 m · Ion-X con recubrimiento cerámico'],
      ['Caja', 'Aluminio 100 % reciclado'],
      ['Conectividad', 'GPS · opción celular'],
    ),
    highlights: [
      'Avisos de hipertensión durante 30 días',
      '24 horas reales de batería',
      'Pantalla con el doble de resistencia a rayones',
    ],
    useCases: ['everyday', 'work'],
    releasedAt: '2025-09-19',
    rank: 90,
    featured: true,
    seo: {
      title: 'Apple Watch Series 11 — precio en Argentina y cuotas',
      description:
        'Apple Watch Series 11 en OWNER STORE: 42 mm y 46 mm, tres acabados de aluminio. ' +
        'Precio transferencia, 12 cuotas sin interés y garantía de 12 meses.',
    },
    pairsWith: ['OWN-AIRPODSPRO3-WHT'],
  },
  {
    slug: 'apple-watch-ultra-3',
    name: 'Apple Watch Ultra 3',
    family: 'watch',
    tagline: 'Built for the worst day.',
    summary:
      'Titanio, 42 horas de batería y satélite para emergencias sin señal. Diseñado para ' +
      'cuando las cosas salen mal, lejos.',
    render: 'watch',
    colors: WATCH_TI,
    storages: [],
    sizes: ['49 mm'],
    variants: buildVariants({
      slug: 'apple-watch-ultra-3',
      colors: WATCH_TI,
      tiers: ['49 mm'],
      tierKind: 'size',
      basePesos: 2_390_000,
      stepPesos: 0,
    }),
    specs: specs(
      ['Pantalla', 'Retina LTPO3 de 49 mm · 3000 nits'],
      ['Batería', 'Hasta 42 h · 72 h en bajo consumo'],
      ['Emergencia', 'Mensajes vía satélite · sirena de 86 dB'],
      ['Resistencia', '100 m · WR100 · EN13319 para buceo'],
      ['Caja', 'Titanio grado 5'],
      ['Conectividad', 'GPS de doble frecuencia · celular 5G'],
    ),
    highlights: [
      'Mensajes por satélite donde no hay señal',
      '42 horas de batería, 72 en bajo consumo',
      'Pantalla de 3000 nits, legible bajo el sol',
    ],
    useCases: ['travel', 'everyday'],
    releasedAt: '2025-09-19',
    rank: 84,
    featured: false,
    seo: {
      title: 'Apple Watch Ultra 3 — precio en Argentina y cuotas',
      description:
        'Apple Watch Ultra 3 en OWNER STORE: titanio de 49 mm, satélite de emergencia y 42 h ' +
        'de batería. Precio transferencia y 12 cuotas sin interés.',
    },
    pairsWith: ['OWN-AIRPODSPRO3-WHT'],
  },
  {
    slug: 'apple-watch-se-3',
    name: 'Apple Watch SE 3',
    family: 'watch',
    tagline: 'The essentials, kept.',
    summary:
      'Pantalla siempre activa, carga rápida y las funciones de salud que importan. Es el ' +
      'primer Apple Watch de mucha gente.',
    render: 'watch',
    colors: [
      { id: 'mid', name: 'Medianoche', hex: '#232630', hexAccent: '#343743' },
      { id: 'slv', name: 'Plata', hex: '#D2D2D2', hexAccent: '#E5E5E5', light: true },
    ],
    storages: [],
    sizes: ['40 mm', '44 mm'],
    variants: buildVariants({
      slug: 'apple-watch-se-3',
      colors: [
        { id: 'mid', name: 'Medianoche', hex: '#232630', hexAccent: '#343743' },
        { id: 'slv', name: 'Plata', hex: '#D2D2D2', hexAccent: '#E5E5E5', light: true },
      ],
      tiers: ['40 mm', '44 mm'],
      tierKind: 'size',
      basePesos: 690_000,
      stepPesos: 90_000,
    }),
    specs: specs(
      ['Pantalla', 'Retina siempre activa'],
      ['Batería', 'Hasta 18 h · carga rápida'],
      ['Salud', 'Ritmo cardíaco · temperatura · puntaje de sueño'],
      ['Resistencia', '50 m'],
      ['Caja', 'Aluminio reciclado'],
      ['Conectividad', 'GPS · opción celular'],
    ),
    highlights: [
      'Pantalla siempre activa, antes solo en Series',
      'Carga rápida: 8 horas en 15 minutos',
      'El Apple Watch más accesible',
    ],
    useCases: ['everyday'],
    releasedAt: '2025-09-19',
    rank: 72,
    featured: false,
    seo: {
      title: 'Apple Watch SE 3 — precio en Argentina y cuotas',
      description:
        'Apple Watch SE 3 en OWNER STORE: 40 mm y 44 mm, pantalla siempre activa. El Apple ' +
        'Watch más accesible, con garantía y envío a todo el país.',
    },
    pairsWith: [],
  },

  /* ----------------------------- AirPods -------------------------------- */
  {
    slug: 'airpods-pro-3',
    name: 'AirPods Pro 3',
    family: 'airpods',
    tagline: 'Turn it off.',
    summary:
      'El doble de cancelación de ruido que la generación anterior, con sensor de ritmo ' +
      'cardíaco y traducción en vivo. En un colectivo, desaparece el colectivo.',
    render: 'earbuds',
    colors: WHITE_ONLY,
    storages: [],
    sizes: [],
    variants: buildVariants({
      slug: 'airpods-pro-3',
      colors: WHITE_ONLY,
      tiers: [],
      tierKind: 'none',
      basePesos: 659_000,
      stepPesos: 0,
    }),
    specs: specs(
      ['Cancelación', 'ANC adaptativa, 2× la generación anterior'],
      ['Audio', 'Espacial personalizado con seguimiento de cabeza'],
      ['Salud', 'Sensor de ritmo cardíaco'],
      ['Batería', '8 h con ANC · 24 h con el estuche'],
      ['Resistencia', 'IP57 auriculares y estuche'],
      ['Extras', 'Traducción en vivo · cinco tamaños de almohadilla'],
    ),
    highlights: [
      'El doble de cancelación que los Pro 2',
      'Sensor de ritmo cardíaco para entrenar',
      'IP57: aguantan lluvia y sudor',
    ],
    useCases: ['travel', 'everyday', 'entertainment', 'work'],
    releasedAt: '2025-09-19',
    rank: 91,
    featured: true,
    seo: {
      title: 'AirPods Pro 3 — precio en Argentina y cuotas',
      description:
        'AirPods Pro 3 en OWNER STORE: cancelación de ruido adaptativa, sensor de ritmo ' +
        'cardíaco y 8 h de batería. Precio transferencia y 12 cuotas sin interés.',
    },
    pairsWith: ['OWN-IPHONE17PRO-NAT-256GB'],
  },
  {
    slug: 'airpods-4',
    name: 'AirPods 4',
    family: 'airpods',
    tagline: 'Open, and good.',
    summary:
      'Diseño abierto, audio espacial y estuche USB-C. Para quien no quiere almohadillas de ' +
      'silicona pero sí quiere que suene bien.',
    render: 'earbuds',
    colors: WHITE_ONLY,
    storages: [],
    sizes: [],
    variants: buildVariants({
      slug: 'airpods-4',
      colors: WHITE_ONLY,
      tiers: [],
      tierKind: 'none',
      basePesos: 429_000,
      stepPesos: 0,
    }),
    specs: specs(
      ['Diseño', 'Abierto, sin almohadilla'],
      ['Audio', 'Espacial con seguimiento de cabeza'],
      ['Chip', 'H2'],
      ['Batería', '5 h · 30 h con el estuche'],
      ['Resistencia', 'IP54'],
      ['Estuche', 'Carga por USB-C'],
    ),
    highlights: [
      'No tapan el oído: cómodos muchas horas',
      '30 horas totales con el estuche',
      'Estuche con USB-C',
    ],
    useCases: ['everyday', 'entertainment'],
    releasedAt: '2024-09-20',
    rank: 76,
    featured: false,
    seo: {
      title: 'AirPods 4 — precio en Argentina y cuotas',
      description:
        'AirPods 4 en OWNER STORE: diseño abierto, audio espacial y estuche USB-C. Con ' +
        'garantía de 12 meses y envío a todo el país.',
    },
    pairsWith: ['OWN-IPHONE17-BLK-256GB'],
  },

  /* --------------------------- Accessories ------------------------------ */
  {
    slug: 'funda-silicona-iphone-17-pro',
    name: 'Funda de silicona para iPhone 17 Pro',
    family: 'accessories',
    tagline: 'Keep the shape.',
    summary:
      'Silicona con interior de microfibra y MagSafe integrado. Protege sin esconder las ' +
      'líneas del teléfono.',
    render: 'case',
    colors: CASE_COLORS,
    storages: [],
    sizes: [],
    variants: buildVariants({
      slug: 'funda-silicona-iphone-17-pro',
      colors: CASE_COLORS,
      tiers: [],
      tierKind: 'none',
      basePesos: 149_000,
      stepPesos: 0,
    }),
    specs: specs(
      ['Material', 'Silicona con interior de microfibra'],
      ['MagSafe', 'Imanes integrados'],
      ['Compatibilidad', 'iPhone 17 Pro'],
      ['Botones', 'Aluminio mecanizado'],
    ),
    highlights: ['MagSafe sin pérdida de potencia', 'Cuatro colores', 'Interior de microfibra'],
    useCases: ['everyday'],
    releasedAt: '2025-09-19',
    rank: 50,
    featured: false,
    seo: {
      title: 'Funda de silicona para iPhone 17 Pro — OWNER STORE',
      description:
        'Funda de silicona con MagSafe para iPhone 17 Pro, en cuatro colores. Original, con ' +
        'garantía y envío a todo el país.',
    },
    pairsWith: ['OWN-MAGSAFECHARGER-WHT'],
  },
  {
    slug: 'magsafe-charger',
    name: 'Cargador MagSafe 25 W',
    family: 'accessories',
    tagline: 'Set it down.',
    summary:
      'Carga magnética de 25 W con cable trenzado de un metro. Se apoya el teléfono y carga, ' +
      'sin buscar el conector.',
    render: 'puck',
    colors: WHITE_ONLY,
    storages: [],
    sizes: [],
    variants: buildVariants({
      slug: 'magsafe-charger',
      colors: WHITE_ONLY,
      tiers: [],
      tierKind: 'none',
      basePesos: 129_000,
      stepPesos: 0,
    }),
    specs: specs(
      ['Potencia', 'Hasta 25 W con adaptador de 30 W'],
      ['Cable', 'Trenzado, 1 m'],
      ['Compatibilidad', 'iPhone 12 y posteriores · Qi2'],
      ['Extras', 'Carga Qi para AirPods'],
    ),
    highlights: ['25 W con el adaptador correcto', 'Cable trenzado de 1 m', 'También carga AirPods'],
    useCases: ['everyday', 'travel'],
    releasedAt: '2025-09-19',
    rank: 48,
    featured: false,
    seo: {
      title: 'Cargador MagSafe 25 W — OWNER STORE',
      description:
        'Cargador MagSafe de 25 W con cable trenzado de 1 metro. Original, con garantía y ' +
        'envío a todo el país.',
    },
    pairsWith: [],
  },
  {
    slug: 'apple-pencil-pro',
    name: 'Apple Pencil Pro',
    family: 'accessories',
    tagline: 'Pressure, and a squeeze.',
    summary:
      'Sensor de presión, giro por rotación, gesto de apretar y respuesta háptica. Convierte ' +
      'al iPad en una herramienta de trabajo real.',
    render: 'stylus',
    colors: WHITE_ONLY,
    storages: [],
    sizes: [],
    variants: buildVariants({
      slug: 'apple-pencil-pro',
      colors: WHITE_ONLY,
      tiers: [],
      tierKind: 'none',
      basePesos: 289_000,
      stepPesos: 0,
    }),
    specs: specs(
      ['Sensores', 'Presión · inclinación · rotación · gesto de apretar'],
      ['Háptica', 'Respuesta táctil al apretar'],
      ['Carga', 'Magnética en el lateral del iPad'],
      ['Buscar', 'Compatible con la app Buscar'],
      ['Compatibilidad', 'iPad Pro M4 y posteriores · iPad Air M2 y posteriores'],
    ),
    highlights: [
      'Girá el lápiz y gira el pincel',
      'Apretá para cambiar de herramienta',
      'Aparece en Buscar si se pierde',
    ],
    useCases: ['creative', 'work'],
    releasedAt: '2024-05-15',
    rank: 60,
    featured: false,
    seo: {
      title: 'Apple Pencil Pro — precio en Argentina',
      description:
        'Apple Pencil Pro en OWNER STORE: presión, rotación, gesto de apretar y háptica. ' +
        'Compatible con iPad Pro M4 y iPad Air M2 o posteriores.',
    },
    pairsWith: ['OWN-IPADPRO13M5-BLK-256GB'],
  },
]);
