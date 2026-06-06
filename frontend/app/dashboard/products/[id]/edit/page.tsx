'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import ProductForm, { type ProductImage } from '../../_components/ProductForm';

interface Variant { name: string; price: string; stock: number; sku: string | null; }
interface Product {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  compareAtPrice: string | null;
  categoryId: string | null;
  status: 'draft' | 'active';
  tags: string[];
  images: ProductImage[];
  variants: Variant[];
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get<{ product: Product }>(`/products/${id}`).then(res => {
      if (res.success) setProduct(res.data.product);
      else setNotFound(true);
    });
  }, [id]);

  if (notFound) {
    return (
      <div>
        <p className="text-muted">Product not found.</p>
        <Link href="/dashboard/products">← Back to products</Link>
      </div>
    );
  }

  if (!product) return <div className="dashboard-loading">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link href="/dashboard/products">Products</Link>
            <span> / </span>
            <span>{product.name}</span>
          </div>
          <h1 className="page-title">Edit product</h1>
        </div>
      </div>
      <ProductForm
        productId={id}
        defaultValues={{
          name: product.name,
          description: product.description ?? '',
          basePrice: Number(product.basePrice),
          compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : '',
          categoryId: product.categoryId ?? '',
          status: product.status,
          tags: product.tags.join(', '),
          images: product.images,
          variants: product.variants.map(v => ({
            name: v.name,
            price: Number(v.price),
            stock: v.stock,
            sku: v.sku ?? '',
          })),
        }}
      />
    </div>
  );
}
