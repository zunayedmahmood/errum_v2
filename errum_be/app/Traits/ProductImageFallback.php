<?php

namespace App\Traits;

use App\Models\Product;
use Illuminate\Support\Collection;

/**
 * Provides SKU-group image fallback + merging.
 */
trait ProductImageFallback
{
    /**
     * Build a merged, de-duplicated, primary-first image list for a product.
     *
     * - Always includes "core" images from the SKU group.
     * - If the current product has image(s), its image becomes primary.
     *
     * @param  Product  $product
     * @param  array<int,string>  $mapFields
     * @return array<int, array<string, mixed>>
     */
    protected function mergedActiveImages(Product $product, array $mapFields = ['id','url','alt_text','is_primary','sort_order']): array
    {
        if (!$product->relationLoaded('images')) {
            $product->load(['images']);
        }

        $variantImages = $product->images
            ->where('is_active', true)
            ->sortBy(function ($img) {
                return [($img->is_primary ? 0 : 1), (int)($img->sort_order ?? 0), (string)($img->created_at ?? '')];
            })
            ->values();

        $coreImages = $this->findCoreImagesForSkuGroup($product);

        $primary = null;
        if ($variantImages->count() > 0) {
            $primary = $variantImages->firstWhere('is_primary', true) ?: $variantImages->first();
        } elseif ($coreImages->count() > 0) {
            $primary = $coreImages->firstWhere('is_primary', true) ?: $coreImages->first();
        }

        $merged = [];
        $seen = [];
        $push = function ($img) use (&$merged, &$seen) {
            if (!$img) return;
            $key = (string)($img->image_path ?? $img->id);
            if ($key === '') return;
            if (isset($seen[$key])) return;
            $seen[$key] = true;
            $merged[] = $img;
        };

        foreach ($variantImages as $img) { $push($img); }
        foreach ($coreImages as $img) { $push($img); }

        $primaryPath = $primary ? (string)($primary->image_path ?? '') : '';
        foreach ($merged as $img) {
            $img->is_primary = ($primaryPath !== '' && (string)($img->image_path ?? '') === $primaryPath);
        }

        usort($merged, function ($a, $b) {
            $pa = $a->is_primary ? 0 : 1;
            $pb = $b->is_primary ? 0 : 1;
            if ($pa !== $pb) return $pa <=> $pb;
            $sa = (int)($a->sort_order ?? 0);
            $sb = (int)($b->sort_order ?? 0);
            if ($sa !== $sb) return $sa <=> $sb;
            return strcmp((string)($a->created_at ?? ''), (string)($b->created_at ?? ''));
        });

        return array_map(function ($img) use ($mapFields) {
            $out = [];
            foreach ($mapFields as $field) {
                switch ($field) {
                    case 'url':
                        $out['url'] = $img->image_url;
                        break;
                    case 'image_path':
                        $out['image_path'] = $img->image_path;
                        break;
                    default:
                        $out[$field] = $img->{$field} ?? null;
                }
            }
            return $out;
        }, $merged);
    }

    /**
     * Find the best "core" image set for the SKU group.
     */
    protected function findCoreImagesForSkuGroup(Product $product): Collection
    {
        $sku = (string)($product->sku ?? '');
        if ($sku === '') return collect();

        $candidates = Product::with(['images' => function ($q) {
                $q->where('is_active', true)->orderBy('is_primary', 'desc')->orderBy('sort_order');
            }])
            ->where('sku', $sku)
            ->get();

        if ($candidates->isEmpty()) return collect();

        $best = $candidates->sortBy(function ($p) {
            $imgs = $p->images ?? collect();
            $count = $imgs->count();
            $hasPrimary = $imgs->contains(fn($i) => (bool)$i->is_primary);
            return [-$count, $hasPrimary ? 0 : 1, (string)($p->created_at ?? '')];
        })->first();

        return ($best && $best->images) ? $best->images : collect();
    }
}
