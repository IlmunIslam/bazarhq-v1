import AsyncStorage from '@react-native-async-storage/async-storage';

// Ported from frontend/lib/cart.ts. Same CartItem shape, same storage key
// (`cart_${subdomain}`) and same item identity (`productId:variantId`), so the
// mobile cart stays compatible with the web cart and — importantly — with the
// checkout API: POST /orders/guest takes items as { productId, variantId,
// quantity }, which this shape carries. The rest of the fields (name, price,
// imageUrl, slug) are a display snapshot for the cart UI.
//
// The only real difference from web is async: localStorage is synchronous but
// AsyncStorage returns Promises, so every helper here is async.

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

export async function getCart(subdomain: string): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(subdomain));
    return JSON.parse(raw ?? '[]') as CartItem[];
  } catch {
    return [];
  }
}

async function save(subdomain: string, items: CartItem[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(subdomain), JSON.stringify(items));
}

function itemKey(item: Pick<CartItem, 'productId' | 'variantId'>) {
  return `${item.productId}:${item.variantId ?? ''}`;
}

export async function addToCart(subdomain: string, item: CartItem): Promise<CartItem[]> {
  const cart = await getCart(subdomain);
  const idx = cart.findIndex(i => itemKey(i) === itemKey(item));
  if (idx >= 0) {
    cart[idx] = { ...cart[idx], quantity: cart[idx].quantity + item.quantity };
  } else {
    cart.push(item);
  }
  await save(subdomain, cart);
  return [...cart];
}

export async function updateQuantity(
  subdomain: string,
  productId: string,
  variantId: string | undefined,
  quantity: number,
): Promise<CartItem[]> {
  const cart = await getCart(subdomain);
  const idx = cart.findIndex(i => itemKey(i) === itemKey({ productId, variantId }));
  if (idx < 0) return cart;
  if (quantity <= 0) {
    cart.splice(idx, 1);
  } else {
    cart[idx] = { ...cart[idx], quantity };
  }
  await save(subdomain, cart);
  return [...cart];
}

export async function removeFromCart(
  subdomain: string,
  productId: string,
  variantId?: string,
): Promise<CartItem[]> {
  const cart = (await getCart(subdomain)).filter(
    i => itemKey(i) !== itemKey({ productId, variantId }),
  );
  await save(subdomain, cart);
  return [...cart];
}

export async function clearCart(subdomain: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(subdomain));
}
