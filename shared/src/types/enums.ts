export type UserStatus = 'active' | 'suspended';

export type ShopStatus = 'draft' | 'published' | 'suspended';

export type ProductStatus = 'draft' | 'active' | 'archived';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'cod' | 'bkash' | 'nagad' | 'sslcommerz';

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export type AdminRole = 'superadmin' | 'support';
