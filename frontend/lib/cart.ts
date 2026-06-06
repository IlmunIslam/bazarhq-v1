export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  price: number;
  imageUrl?: string;
  quantity: number;
  slug: string;
}

function storageKey(subdomain: string) {
  return `cart_${subdomain}`;
}

export function getCart(subdomain: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(subdomain)) ?? '[]') as CartItem[];
  } catch {
    return [];
  }
}

function save(subdomain: string, items: CartItem[]): void {
  localStorage.setItem(storageKey(subdomain), JSON.stringify(items));
}

function itemKey(item: Pick<CartItem, 'productId' | 'variantId'>) {
  return `${item.productId}:${item.variantId ?? ''}`;
}

export function addToCart(subdomain: string, item: CartItem): CartItem[] {
  const cart = getCart(subdomain);
  const idx = cart.findIndex(i => itemKey(i) === itemKey(item));
  if (idx >= 0) {
    cart[idx] = { ...cart[idx], quantity: cart[idx].quantity + item.quantity };
  } else {
    cart.push(item);
  }
  save(subdomain, cart);
  return [...cart];
}

export function updateQuantity(
  subdomain: string,
  productId: string,
  variantId: string | undefined,
  quantity: number,
): CartItem[] {
  const cart = getCart(subdomain);
  const idx = cart.findIndex(i => itemKey(i) === itemKey({ productId, variantId }));
  if (idx < 0) return cart;
  if (quantity <= 0) {
    cart.splice(idx, 1);
  } else {
    cart[idx] = { ...cart[idx], quantity };
  }
  save(subdomain, cart);
  return [...cart];
}

export function removeFromCart(subdomain: string, productId: string, variantId?: string): CartItem[] {
  const cart = getCart(subdomain).filter(i => itemKey(i) !== itemKey({ productId, variantId }));
  save(subdomain, cart);
  return [...cart];
}

export function clearCart(subdomain: string): void {
  if (typeof window !== 'undefined') localStorage.removeItem(storageKey(subdomain));
}
