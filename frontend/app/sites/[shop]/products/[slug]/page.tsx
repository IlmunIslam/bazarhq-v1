'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useShop, useCart } from '../../_components/StorefrontShell';

interface ProductImage { id: string; url: string; position: number; }
interface Variant {
  id: string;
  name: string;
  sku: string | null;
  price: string;
  stock: number;
}
interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: string;
  compareAtPrice: string | null;
  stock: number;
  images: ProductImage[];
  variants: Variant[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

export default function ProductDetailPage() {
  const { shop, subdomain } = useShop();
  const { add, count } = useCart();
  const params = useParams<{ shop: string; slug: string }>();
  const slug = params.slug;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetch(`${API}/storefront/${subdomain}/products/${slug}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setProduct(json.data.product);
          if (json.data.product.variants.length > 0) {
            setSelectedVariant(json.data.product.variants[0]);
          }
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [subdomain, slug]);

  if (loading) {
    return (
      <div className="sf-container sf-product-detail-loading">
        <div className="sf-pd-img-skeleton sf-skeleton" />
        <div className="sf-pd-info-skeleton">
          <div className="sf-skeleton" style={{ height: 32, marginBottom: 12 }} />
          <div className="sf-skeleton" style={{ height: 24, width: '40%', marginBottom: 24 }} />
          <div className="sf-skeleton" style={{ height: 80 }} />
        </div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="sf-container sf-empty" style={{ paddingTop: '4rem' }}>
        <p>Product not found.</p>
        <Link href="/" className="sf-back-link">← Back to store</Link>
      </div>
    );
  }

  const displayPrice = selectedVariant ? selectedVariant.price : product.basePrice;
  const displayStock = selectedVariant ? selectedVariant.stock : product.stock;
  const inStock = displayStock > 0;

  // Compare-at only applies to the base price (variants carry their own price)
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const showCompare = !selectedVariant && compareAt !== null && compareAt > Number(displayPrice);
  const discount = showCompare ? Math.round((1 - Number(displayPrice) / compareAt!) * 100) : null;

  const handleAddToCart = () => {
    add({
      productId: product.id,
      variantId: selectedVariant?.id,
      name: product.name,
      variantName: selectedVariant?.name,
      price: Number(displayPrice),
      imageUrl: product.images[0]?.url,
      quantity: qty,
      slug: product.slug,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="sf-container sf-product-detail">
      {/* Breadcrumb */}
      <nav className="sf-breadcrumb">
        <Link href="/" className="sf-breadcrumb-link">Home</Link>
        <span className="sf-breadcrumb-sep">›</span>
        <span>{product.name}</span>
      </nav>

      <div className="sf-pd-layout">
        {/* Image gallery */}
        <div className="sf-pd-gallery">
          <div className="sf-pd-main-img-wrap">
            {product.images.length > 0 ? (
              <img
                src={product.images[activeImage]?.url}
                alt={product.name}
                className="sf-pd-main-img"
              />
            ) : (
              <div className="sf-pd-main-img sf-no-img">No image</div>
            )}
            {(discount !== null || !inStock) && (
              <div className="sf-badges">
                {discount !== null && (
                  <span className="sf-badge sf-badge--sale">−{discount}%</span>
                )}
                {!inStock && (
                  <span className="sf-badge sf-badge--oos">Sold out</span>
                )}
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="sf-pd-thumbs">
              {product.images.map((img, i) => (
                <button
                  key={img.id}
                  className={`sf-pd-thumb ${i === activeImage ? 'active' : ''}`}
                  onClick={() => setActiveImage(i)}
                >
                  <img src={img.url} alt={`${product.name} ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="sf-pd-info">
          <h1 className="sf-pd-name">{product.name}</h1>

          <div className="sf-pd-price-row">
            <span className="sf-pd-price">৳{Number(displayPrice).toLocaleString()}</span>
            {showCompare && (
              <span className="sf-pd-was">৳{compareAt!.toLocaleString()}</span>
            )}
            {discount !== null && (
              <span className="sf-pd-discount">Save {discount}%</span>
            )}
            {!inStock && <span className="sf-pd-oos">Out of stock</span>}
          </div>

          {/* Variant selector */}
          {product.variants.length > 0 && (
            <div className="sf-pd-variants">
              <p className="sf-pd-label">
                Variant
                {selectedVariant && <span className="sf-pd-label-value">{selectedVariant.name}</span>}
              </p>
              <div className="sf-pd-variant-btns">
                {product.variants.map(v => (
                  <button
                    key={v.id}
                    className={`sf-pd-variant-btn ${selectedVariant?.id === v.id ? 'active' : ''} ${v.stock === 0 ? 'oos' : ''}`}
                    onClick={() => setSelectedVariant(v)}
                    disabled={v.stock === 0}
                  >
                    {v.name}
                    {v.stock === 0 && <span className="sf-pd-variant-oos"> (sold out)</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity + add to cart */}
          <div className="sf-pd-actions">
            <div className="sf-qty-control">
              <button className="sf-qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <span className="sf-qty-val">{qty}</span>
              <button
                className="sf-qty-btn"
                onClick={() => setQty(q => Math.min(displayStock || 99, q + 1))}
                disabled={!inStock}
              >+</button>
            </div>
            <button
              className={`sf-add-to-cart-btn${added ? ' sf-add-to-cart-btn--added' : ''}`}
              onClick={handleAddToCart}
              disabled={!inStock}
            >
              {added ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Added to cart
                </>
              ) : inStock ? 'Add to Cart' : 'Out of Stock'}
            </button>
          </div>

          {inStock && displayStock <= 5 && (
            <p className="sf-pd-low-stock">Only {displayStock} left in stock</p>
          )}

          {/* Description */}
          {product.description && (
            <div className="sf-pd-description">
              <p className="sf-pd-label">Description</p>
              <p className="sf-pd-desc-text">{product.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
