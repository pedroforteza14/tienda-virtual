import { ImageResponse } from 'next/og';
import { site } from '@/config/site';

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The social card.
 *
 * Generated at build time rather than designed in Figma and exported, so it can
 * never drift from the brand tokens. It carries the two things that make the
 * identity recognisable at thumbnail size — the brass aperture and the warm
 * ink/bone pairing — and nothing else.
 *
 * System fonts only: loading a webfont here would add a network fetch to every
 * card render for a gain nobody sees at 1200×630.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0b0b0c',
          padding: '72px 80px',
          position: 'relative',
          fontFamily: 'sans-serif',
        }}
      >
        {/* The aperture, cropped by the frame — the same device as the hero. */}
        <div
          style={{
            position: 'absolute',
            right: -120,
            top: -60,
            width: 620,
            height: 620,
            borderRadius: 620,
            border: '2px solid #b58a4a',
            opacity: 0.55,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: -60,
            top: 20,
            width: 500,
            height: 500,
            borderRadius: 500,
            border: '1px solid #b58a4a',
            opacity: 0.25,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 18,
              border: '2px solid #b58a4a',
            }}
          />
          <div
            style={{
              fontSize: 28,
              letterSpacing: 6,
              color: '#f2ede4',
              fontWeight: 700,
            }}
          >
            OWNER STORE
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              fontSize: 104,
              lineHeight: 0.92,
              letterSpacing: -4,
              color: '#f2ede4',
              fontWeight: 800,
              textTransform: 'uppercase',
            }}
          >
            Technology
          </div>
          <div
            style={{
              fontSize: 104,
              lineHeight: 0.92,
              letterSpacing: -4,
              color: '#b58a4a',
              fontWeight: 800,
              textTransform: 'uppercase',
            }}
          >
            Redefined
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 40,
            fontSize: 22,
            color: '#a8a29a',
            letterSpacing: 1,
            borderTop: '1px solid rgba(242,237,228,0.14)',
            paddingTop: 28,
          }}
        >
          <span>iPhone · Mac · iPad · Watch · AirPods</span>
          <span style={{ color: '#6b6760' }}>Argentina</span>
        </div>
      </div>
    ),
    size,
  );
}
