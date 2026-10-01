import { buildNavData } from '@/components/layout/nav-data';
import { HeaderShell } from '@/components/layout/HeaderShell';

/**
 * Server wrapper: computes the mega-menu data (prices, stock, counts) and hands
 * it to the client shell. Keeps merchandising logic on the server and keeps the
 * client bundle to the interaction code.
 */
export function Header() {
  return <HeaderShell nav={buildNavData()} />;
}
