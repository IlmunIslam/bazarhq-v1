import ProductForm from '@/components/ProductForm';

// Create a product (Merchant stack). Thin wrapper — the shared ProductForm
// handles everything; back returns to the products list.
export default function NewProductScreen() {
  return <ProductForm />;
}
