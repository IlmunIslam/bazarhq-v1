import dotenv from 'dotenv';
import path from 'path';

// On Render the seed runs with env vars already injected via the dashboard; only
// fall back to a local .env in development, and never override process.env.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });
}

import { Prisma, type SpecDataType } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Sprint C0 — starter marketplace taxonomy.
//
// Seeds a small Bangladesh-market category tree with a spec template on each
// leaf, so the C1 admin UI and the C3 merchant form have something real to work
// against from day one. It is a STARTING POINT, not a fixed list: everything
// here is editable through the admin UI once C1 lands.
//
// IDEMPOTENT — safe to re-run:
//   • categories are upserted on their unique `slug`
//   • spec fields are upserted on the unique (categoryId, key)
//   • nothing is ever deleted, and existing rows are updated in place rather
//     than duplicated
//
// Re-running therefore repairs drift (a renamed label comes back) without
// touching merchant data or any spec VALUES already entered against these
// fields — `product_specs` rows key off specFieldId, which is preserved by the
// upsert. Categories an admin has since deactivated stay deactivated: the
// upsert deliberately does not reset `isActive`.

interface SpecSeed {
  key: string;
  label: string;
  unit?: string;
  dataType: SpecDataType;
  options?: string[];
  isComparable?: boolean;
}

interface LeafSeed {
  slug: string;
  name: string;
  specs: SpecSeed[];
}

interface TopSeed {
  slug: string;
  name: string;
  children: LeafSeed[];
}

// Two levels only (parent → leaf); spec templates hang off leaves. See the
// depth note in prisma/schema.prisma and docs/comparison-feature-plan.md §2.
const TAXONOMY: TopSeed[] = [
  {
    slug: 'electronics',
    name: 'Electronics',
    children: [
      {
        slug: 'mobile-phones',
        name: 'Mobile Phones',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'ram_gb', label: 'RAM', unit: 'GB', dataType: 'number' },
          { key: 'storage_gb', label: 'Storage', unit: 'GB', dataType: 'number' },
          { key: 'screen_size_in', label: 'Screen size', unit: 'inch', dataType: 'number' },
          { key: 'battery_mah', label: 'Battery', unit: 'mAh', dataType: 'number' },
          { key: 'rear_camera_mp', label: 'Rear camera', unit: 'MP', dataType: 'number' },
          { key: 'network', label: 'Network', dataType: 'enum', options: ['3G', '4G', '5G'] },
          { key: 'dual_sim', label: 'Dual SIM', dataType: 'boolean' },
          { key: 'warranty_months', label: 'Warranty', unit: 'months', dataType: 'number' },
        ],
      },
      {
        slug: 'laptops',
        name: 'Laptops',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'processor', label: 'Processor', dataType: 'text' },
          { key: 'ram_gb', label: 'RAM', unit: 'GB', dataType: 'number' },
          { key: 'storage_gb', label: 'Storage', unit: 'GB', dataType: 'number' },
          { key: 'storage_type', label: 'Storage type', dataType: 'enum', options: ['HDD', 'SSD', 'Hybrid'] },
          { key: 'screen_size_in', label: 'Screen size', unit: 'inch', dataType: 'number' },
          { key: 'graphics', label: 'Graphics', dataType: 'text' },
          { key: 'warranty_months', label: 'Warranty', unit: 'months', dataType: 'number' },
        ],
      },
      {
        slug: 'headphones-audio',
        name: 'Headphones & Audio',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'type', label: 'Type', dataType: 'enum', options: ['In-ear', 'On-ear', 'Over-ear', 'Speaker'] },
          { key: 'wireless', label: 'Wireless', dataType: 'boolean' },
          { key: 'battery_hours', label: 'Battery life', unit: 'hours', dataType: 'number' },
          { key: 'noise_cancelling', label: 'Noise cancelling', dataType: 'boolean' },
        ],
      },
    ],
  },
  {
    slug: 'clothing',
    name: 'Clothing',
    children: [
      {
        slug: 'mens-clothing',
        name: "Men's Clothing",
        specs: [
          { key: 'material', label: 'Material', dataType: 'text' },
          { key: 'size', label: 'Size', dataType: 'enum', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
          { key: 'fit', label: 'Fit', dataType: 'enum', options: ['Slim', 'Regular', 'Loose'] },
          { key: 'colour', label: 'Colour', dataType: 'text' },
          { key: 'sleeve', label: 'Sleeve', dataType: 'enum', options: ['Full', 'Half', 'Sleeveless'] },
          { key: 'wash_care', label: 'Wash care', dataType: 'text', isComparable: false },
        ],
      },
      {
        slug: 'womens-clothing',
        name: "Women's Clothing",
        specs: [
          { key: 'material', label: 'Material', dataType: 'text' },
          { key: 'size', label: 'Size', dataType: 'enum', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
          { key: 'fit', label: 'Fit', dataType: 'enum', options: ['Slim', 'Regular', 'Loose'] },
          { key: 'colour', label: 'Colour', dataType: 'text' },
          { key: 'work_type', label: 'Work type', dataType: 'text' },
          { key: 'wash_care', label: 'Wash care', dataType: 'text', isComparable: false },
        ],
      },
      {
        slug: 'footwear',
        name: 'Footwear',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'material', label: 'Material', dataType: 'text' },
          { key: 'size_eu', label: 'Size (EU)', dataType: 'number' },
          { key: 'colour', label: 'Colour', dataType: 'text' },
          { key: 'closure', label: 'Closure', dataType: 'enum', options: ['Lace-up', 'Slip-on', 'Velcro', 'Buckle'] },
        ],
      },
    ],
  },
  {
    slug: 'home-kitchen',
    name: 'Home & Kitchen',
    children: [
      {
        slug: 'cookware',
        name: 'Cookware',
        specs: [
          { key: 'material', label: 'Material', dataType: 'text' },
          { key: 'capacity_l', label: 'Capacity', unit: 'L', dataType: 'number' },
          { key: 'induction_safe', label: 'Induction safe', dataType: 'boolean' },
          { key: 'non_stick', label: 'Non-stick', dataType: 'boolean' },
          { key: 'pieces', label: 'Pieces in set', dataType: 'number' },
        ],
      },
      {
        slug: 'home-appliances',
        name: 'Home Appliances',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'power_w', label: 'Power', unit: 'W', dataType: 'number' },
          { key: 'capacity_l', label: 'Capacity', unit: 'L', dataType: 'number' },
          { key: 'voltage', label: 'Voltage', unit: 'V', dataType: 'number' },
          { key: 'warranty_months', label: 'Warranty', unit: 'months', dataType: 'number' },
        ],
      },
    ],
  },
  {
    slug: 'beauty-personal-care',
    name: 'Beauty & Personal Care',
    children: [
      {
        slug: 'skincare',
        name: 'Skincare',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'volume_ml', label: 'Volume', unit: 'ml', dataType: 'number' },
          { key: 'skin_type', label: 'Skin type', dataType: 'enum', options: ['Oily', 'Dry', 'Combination', 'Sensitive', 'All'] },
          { key: 'spf', label: 'SPF', dataType: 'number' },
          { key: 'key_ingredients', label: 'Key ingredients', dataType: 'text', isComparable: false },
        ],
      },
      {
        slug: 'fragrance',
        name: 'Fragrance',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'volume_ml', label: 'Volume', unit: 'ml', dataType: 'number' },
          { key: 'scent_family', label: 'Scent family', dataType: 'enum', options: ['Floral', 'Woody', 'Oriental', 'Fresh', 'Attar'] },
          { key: 'alcohol_free', label: 'Alcohol free', dataType: 'boolean' },
        ],
      },
    ],
  },
  {
    slug: 'groceries',
    name: 'Groceries',
    children: [
      {
        slug: 'packaged-food',
        name: 'Packaged Food',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'net_weight_g', label: 'Net weight', unit: 'g', dataType: 'number' },
          { key: 'organic', label: 'Organic', dataType: 'boolean' },
          { key: 'shelf_life_months', label: 'Shelf life', unit: 'months', dataType: 'number' },
        ],
      },
      {
        slug: 'tea-coffee',
        name: 'Tea & Coffee',
        specs: [
          { key: 'brand', label: 'Brand', dataType: 'text' },
          { key: 'type', label: 'Type', dataType: 'enum', options: ['Black tea', 'Green tea', 'Herbal', 'Ground coffee', 'Instant coffee'] },
          { key: 'net_weight_g', label: 'Net weight', unit: 'g', dataType: 'number' },
          { key: 'caffeine_free', label: 'Caffeine free', dataType: 'boolean' },
        ],
      },
    ],
  },
];

async function seedLeaf(parentId: string, leaf: LeafSeed, sortOrder: number) {
  const category = await prisma.category.upsert({
    where: { slug: leaf.slug },
    // Re-running repairs the name/parent/order but deliberately leaves
    // `isActive` alone, so a category an admin has retired stays retired.
    update: { name: leaf.name, parentId, sortOrder },
    create: { slug: leaf.slug, name: leaf.name, parentId, sortOrder },
  });

  for (const [i, spec] of leaf.specs.entries()) {
    const data = {
      label: spec.label,
      unit: spec.unit ?? null,
      dataType: spec.dataType,
      options: spec.options ?? [],
      sortOrder: i,
      isComparable: spec.isComparable ?? true,
    };
    await prisma.specField.upsert({
      where: { categoryId_key: { categoryId: category.id, key: spec.key } },
      // The upsert preserves the row's id, so any product_specs already keyed to
      // this field keep pointing at it.
      update: data,
      create: { categoryId: category.id, key: spec.key, ...data },
    });
  }

  return leaf.specs.length;
}

async function main() {
  let categories = 0;
  let fields = 0;

  for (const [i, top] of TAXONOMY.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: top.slug },
      update: { name: top.name, sortOrder: i },
      create: { slug: top.slug, name: top.name, sortOrder: i },
    });
    categories++;

    for (const [j, leaf] of top.children.entries()) {
      fields += await seedLeaf(parent.id, leaf, j);
      categories++;
    }
  }

  console.log(`Taxonomy seeded: ${categories} categories, ${fields} spec fields.`);
  console.log('Re-running is safe — categories and spec fields are upserted, never duplicated.');
}

main()
  .catch(err => {
    // A missing table is the expected failure when the C0 SQL has not been
    // applied yet; say so plainly rather than dumping a raw Prisma error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021') {
      console.error(
        'The taxonomy tables do not exist yet. Apply api/prisma/sql/c0_taxonomy.sql first.'
      );
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
