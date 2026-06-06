'use client';

import Link from 'next/link';
import ProductForm from '../_components/ProductForm';

export default function NewProductPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link href="/dashboard/products">Products</Link>
            <span> / </span>
            <span>Add product</span>
          </div>
          <h1 className="page-title">Add product</h1>
        </div>
      </div>
      <ProductForm />
    </div>
  );
}
