interface Props {
  params: { shop: string };
}

export default function StorefrontPage({ params }: Props) {
  return <h1>{params.shop} storefront</h1>;
}
