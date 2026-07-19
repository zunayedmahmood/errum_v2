import type { CatalogCategory } from '@/services/catalogService';

export interface HardcodedCategoryArtwork {
  name: string;
  slug: string;
  image: string;
  aliases?: string[];
}

/**
 * Approved category artwork supplied for the ERRUM storefront.
 *
 * Keep this list deliberately explicit: categories that are not present here
 * continue to use the image supplied by the catalog API. This avoids silently
 * assigning an unrelated hardcoded image to a new category.
 */
export const HARDCODED_CATEGORY_ARTWORK: HardcodedCategoryArtwork[] = [
  { name: 'Sneakers', slug: 'sneakers', image: '/ecommerce/category-images/sneakers.webp', aliases: ['sneaker'] },
  { name: 'Perfume Fragrance', slug: 'perfume-fragrance', image: '/ecommerce/category-images/perfume-fragrance.webp', aliases: ['perfume', 'fragrance'] },
  { name: 'Watch', slug: 'watch', image: '/ecommerce/category-images/watch.webp', aliases: ['watches'] },
  { name: 'Clothing', slug: 'clothing', image: '/ecommerce/category-images/clothing.webp', aliases: ['clothes'] },
  { name: 'Fashion Accessories', slug: 'fashion-accessories', image: '/ecommerce/category-images/fashion-accessories.webp', aliases: ['accessories', 'accessory'] },
  { name: 'Imported Slides', slug: 'imported-slides', image: '/ecommerce/category-images/imported-slides.webp', aliases: ['slides'] },
  { name: 'Shoe Care', slug: 'shoe-care', image: '/ecommerce/category-images/shoe-care.webp', aliases: ['shoecare'] },
  { name: 'Thobe', slug: 'thobe', image: '/ecommerce/category-images/thobe.webp', aliases: ['thobes'] },
  { name: 'Winter Collection', slug: 'winter-collection', image: '/ecommerce/category-images/winter-collection.webp', aliases: ['winter'] },
];

export const normalizeCategorySlug = (value: string): string => value
  .toLowerCase()
  .trim()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-');

const artworkByKey = new Map<string, HardcodedCategoryArtwork>();
HARDCODED_CATEGORY_ARTWORK.forEach((item) => {
  [item.slug, item.name, ...(item.aliases || [])].forEach((key) => {
    artworkByKey.set(normalizeCategorySlug(key), item);
  });
});

export const getHardcodedCategoryArtwork = (
  categoryOrSlug?: CatalogCategory | string | null,
): HardcodedCategoryArtwork | undefined => {
  if (!categoryOrSlug) return undefined;

  if (typeof categoryOrSlug === 'string') {
    return artworkByKey.get(normalizeCategorySlug(decodeURIComponent(categoryOrSlug)));
  }

  const slugMatch = categoryOrSlug.slug
    ? artworkByKey.get(normalizeCategorySlug(categoryOrSlug.slug))
    : undefined;

  return slugMatch || artworkByKey.get(normalizeCategorySlug(categoryOrSlug.name));
};

export const getHardcodedCategoryImage = (
  categoryOrSlug?: CatalogCategory | string | null,
): string | undefined => getHardcodedCategoryArtwork(categoryOrSlug)?.image;
