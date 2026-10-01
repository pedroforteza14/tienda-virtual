'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  startTransition,
} from 'react';
import { apiFetch } from '@/lib/http/client';
import type { PricedCart } from '@/types/commerce';

/**
 * Client-side commerce state: the cart, the overlays, and the toast queue.
 *
 * Two deliberate choices:
 *
 *  1. **The server owns the cart.** This provider holds a *copy* for rendering
 *     and replaces it wholesale with whatever the server returns from a
 *     mutation. It never computes a total, never adjusts a price, and never
 *     reconciles — if the server clamped a quantity or dropped a sold-out line,
 *     the copy simply becomes that. There is no client-side source of truth that
 *     could disagree.
 *  2. **Optimistic item count only.** The header badge updates instantly, because
 *     waiting 200 ms for it feels broken. Money never updates optimistically:
 *     showing a total that then changes is worse than showing it 200 ms later.
 */

const EMPTY_CART: PricedCart = {
  lines: [],
  totals: {
    subtotal: 0,
    promoDiscount: 0,
    netSubtotal: 0,
    transferDiscount: 0,
    shipping: 0,
    freeShippingApplied: false,
    cardTotal: 0,
    transferTotal: 0,
    total: 0,
    instalments: null,
  },
  itemCount: 0,
  notices: [],
  promo: null,
};

export interface Toast {
  id: number;
  tone: 'info' | 'ok' | 'err';
  message: string;
}

interface CommerceValue {
  cart: PricedCart;
  /** False until the first server read lands. The badge renders nothing until
   *  then, so a returning customer never sees "0" flash to "3". */
  loaded: boolean;
  /** Optimistic count, for the header badge only. */
  itemCount: number;
  pending: boolean;
  addToCart: (sku: string, qty?: number) => Promise<boolean>;
  setQty: (sku: string, qty: number) => Promise<void>;
  removeLine: (sku: string) => Promise<void>;
  applyPromo: (code: string | null) => Promise<void>;
  refresh: () => Promise<void>;

  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;

  toasts: Toast[];
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

const CommerceContext = createContext<CommerceValue | null>(null);

/**
 * The cart is fetched on mount rather than injected by the server.
 *
 * That is a deliberate performance trade: reading `cookies()` in the root layout
 * would opt **every** page out of static rendering, including the home page and
 * the whole catalogue, which are otherwise pure content. One small client fetch
 * buys fully static, CDN-cacheable pages everywhere — and the cart badge simply
 * renders nothing until the real count arrives, so nothing flickers.
 */
export function CommerceProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<PricedCart>(EMPTY_CART);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [optimisticCount, setOptimisticCount] = useOptimistic(
    cart.itemCount,
    (_current: number, next: number) => next,
  );

  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = (toastId.current += 1);
      // Cap the queue: three stacked toasts is already too many.
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismissToast(id), 5200);
    },
    [dismissToast],
  );

  /** Replace local state with the server's cart, surfacing its notices. */
  const absorb = useCallback(
    (next: PricedCart) => {
      setCart(next);
      for (const notice of next.notices) toast(notice, 'info');
    },
    [toast],
  );

  const mutateCart = useCallback(
    async (path: string, body: unknown, optimistic?: number): Promise<boolean> => {
      setPending(true);
      if (optimistic !== undefined) {
        startTransition(() => setOptimisticCount(optimistic));
      }
      try {
        const result = await apiFetch<{ cart: PricedCart }>(path, { method: 'POST', body });
        if (!result.ok) {
          toast(result.message, 'err');
          return false;
        }
        absorb(result.data.cart);
        return true;
      } finally {
        setPending(false);
      }
    },
    [absorb, setOptimisticCount, toast],
  );

  const addToCart = useCallback(
    async (sku: string, qty = 1) => {
      const ok = await mutateCart('/api/cart', { sku, qty }, cart.itemCount + qty);
      if (ok) setCartOpen(true);
      return ok;
    },
    [cart.itemCount, mutateCart],
  );

  const setQty = useCallback(
    async (sku: string, qty: number) => {
      await mutateCart('/api/cart/update', { sku, qty });
    },
    [mutateCart],
  );

  const removeLine = useCallback(
    async (sku: string) => {
      await mutateCart('/api/cart/remove', { sku });
    },
    [mutateCart],
  );

  const applyPromo = useCallback(
    async (code: string | null) => {
      await mutateCart('/api/cart/promo', { code });
    },
    [mutateCart],
  );

  const refresh = useCallback(async () => {
    const result = await apiFetch<{ cart: PricedCart }>('/api/cart');
    if (result.ok) setCart(result.data.cart);
    setLoaded(true);
  }, []);

  /** One read on mount. `GET /api/cart` issues no session and sets no cookie, so
   *  this costs a brand-new visitor nothing but an empty response. */
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** One overlay at a time — two stacked modals is a focus-trap fight. */
  useEffect(() => {
    if (cartOpen) {
      setSearchOpen(false);
      setMenuOpen(false);
    }
  }, [cartOpen]);

  useEffect(() => {
    if (searchOpen) {
      setCartOpen(false);
      setMenuOpen(false);
    }
  }, [searchOpen]);

  /** ⌘K / Ctrl-K opens search: the shortcut people already expect. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<CommerceValue>(
    () => ({
      cart,
      loaded,
      itemCount: optimisticCount,
      pending,
      addToCart,
      setQty,
      removeLine,
      applyPromo,
      refresh,
      cartOpen,
      setCartOpen,
      searchOpen,
      setSearchOpen,
      menuOpen,
      setMenuOpen,
      toasts,
      toast,
      dismissToast,
    }),
    [
      cart,
      loaded,
      optimisticCount,
      pending,
      addToCart,
      setQty,
      removeLine,
      applyPromo,
      refresh,
      cartOpen,
      searchOpen,
      menuOpen,
      toasts,
      toast,
      dismissToast,
    ],
  );

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce(): CommerceValue {
  const context = useContext(CommerceContext);
  if (!context) throw new Error('useCommerce must be used inside <CommerceProvider>');
  return context;
}

export { EMPTY_CART };
