import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ProductForm, { type ProductFormDefaults } from '@/components/ProductForm';
import Skeleton from '@/components/Skeleton';
import { fetchProduct } from '@/lib/products-api';

// Edit a product (Merchant stack). Loads the product, maps it to the form's
// defaults (same mapping the web edit page uses), then renders the shared form.
export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [defaults, setDefaults] = useState<ProductFormDefaults | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    fetchProduct(id).then(res => {
      if (!active) return;
      if (res.success) {
        const p = res.data.product;
        setDefaults({
          name: p.name,
          description: p.description ?? '',
          basePrice: String(Number(p.basePrice)),
          compareAtPrice: p.compareAtPrice ? String(Number(p.compareAtPrice)) : '',
          categoryId: p.categoryId,
          status: p.status === 'active' ? 'active' : 'draft',
          tags: p.tags.join(', '),
          variants: p.variants.map(v => ({
            name: v.name,
            price: String(Number(v.price)),
            stock: String(v.stock),
            sku: v.sku ?? '',
          })),
          // Already ordered by sortOrder server-side, so images[0] is the primary.
          images: p.images,
        });
      } else {
        setNotFound(true);
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (notFound) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Product not found.</Text>
      </View>
    );
  }

  if (!defaults) {
    return (
      <View style={styles.loading}>
        <Skeleton style={styles.skLine} />
        <Skeleton style={styles.skLineShort} />
        <Skeleton style={styles.skBlock} />
        <Skeleton style={styles.skBlock} />
      </View>
    );
  }

  return <ProductForm productId={id} defaultValues={defaults} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  muted: { fontSize: 15, color: '#6b7280' },
  loading: { flex: 1, backgroundColor: '#ffffff', padding: 20, gap: 12 },
  skLine: { height: 16, width: '50%' },
  skLineShort: { height: 14, width: '30%' },
  skBlock: { height: 80, borderRadius: 12 },
});
