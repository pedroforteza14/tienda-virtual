import { SpecRails } from '@/components/ui/SpecRail';
import { Reveal } from '@/components/motion/Reveal';
import { trustPoints } from '@/data/editorial';

/**
 * Trust, as spec rails.
 *
 * Deliberately the *same* visual device used for technical specifications, so
 * "garantía de 12 meses" is presented with exactly the weight of "chip A19 Pro".
 * That is the argument: our terms are a specification of the product, not a badge
 * bar underneath it.
 */
export function Trust() {
  return (
    <section aria-labelledby="trust-heading" className="u-container u-section">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal>
          <p className="u-label">Cómo trabajamos</p>
          <h2 id="trust-heading" className="u-display-tight mt-4 max-w-[16ch] text-h2">
            Comprar acá tiene{' '}
            <span className="u-editorial text-accent">respaldo</span>.
          </h2>
          <p className="u-prose mt-5 text-body text-fg-dim">
            No vendemos promesas: cada punto de abajo es verificable, y está por escrito en tu
            comprobante de compra.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <SpecRails
            specs={trustPoints.map((point) => ({
              index: point.index,
              label: point.label,
              value: `${point.value} — ${point.detail}`,
            }))}
          />
        </Reveal>
      </div>
    </section>
  );
}
