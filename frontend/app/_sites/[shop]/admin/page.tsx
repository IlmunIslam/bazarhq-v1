interface Props {
  params: { shop: string };
}

export default function MerchantAdminPage({ params }: Props) {
  return <h1>{params.shop} — Merchant Admin</h1>;
}
