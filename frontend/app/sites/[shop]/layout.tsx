import StorefrontShell, { type ShopData, type ThemeData, type CategoryData } from './_components/StorefrontShell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

interface ShopApiResponse {
  shop: ShopData;
  theme: ThemeData;
  categories: CategoryData[];
  paymentMethods: string[];
}

async function fetchShop(subdomain: string): Promise<ShopApiResponse | null> {
  try {
    const res = await fetch(`${API}/storefront/${subdomain}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { shop: string };
}) {
  const data = await fetchShop(params.shop);

  if (!data) {
    return (
      <div className="sf-not-found">
        <h1>Store not found</h1>
        <p>This store doesn&apos;t exist or hasn&apos;t been published yet.</p>
      </div>
    );
  }

  return (
    <StorefrontShell
      shop={data.shop}
      theme={data.theme}
      categories={data.categories}
      subdomain={params.shop}
      paymentMethods={data.paymentMethods}
    >
      {children}
    </StorefrontShell>
  );
}
