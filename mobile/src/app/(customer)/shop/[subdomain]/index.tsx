import { useLocalSearchParams, useRouter } from 'expo-router';

import StorefrontView from '@/components/StorefrontView';

// One shop's storefront home in the CUSTOMER stack. Thin wrapper over the shared
// StorefrontView: products are interactive and navigate to this shop's product
// detail. (The merchant tab renders the same StorefrontView read-only.)
export default function ShopHomeScreen() {
  const { subdomain } = useLocalSearchParams<{ subdomain: string }>();
  const router = useRouter();

  return (
    <StorefrontView
      subdomain={subdomain}
      onProductPress={slug =>
        router.push({ pathname: '/shop/[subdomain]/product/[slug]', params: { subdomain, slug } })
      }
    />
  );
}
