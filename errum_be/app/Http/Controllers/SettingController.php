<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Models\Category;
use App\Models\Product;
use App\Models\Promotion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    /**
     * Get homepage settings for the public storefront.
     */
    public function getHomepageSettings(Request $request)
    {
        $group = $request->query('group');
        $settings = Setting::where('group', 'homepage')->pluck('value', 'key');

        if ($group === 'global_theme') {
            return response()->json([
                'global_theme' => $this->getGlobalThemeData(),
            ]);
        }
        
        $response = [];
        if (!$group) {
            $response['global_theme'] = $this->getGlobalThemeData();
        }
        $response['section_order'] = $this->normalizeHomepageSectionOrder($settings->get('homepage_section_order', ['hero', 'featured_collections', 'new_arrivals', 'promotion_banners', 'bannered_collections', 'showcase']));

        // 1. Ticker & Hero (The "Immediate" group)
        if (!$group || $group === 'hero') {
            $response['ticker'] = array_merge([
                'enabled' => true,
                'mode' => 'moving',
                'background_color' => '#111111',
                'text_color' => '#ffffff',
                'speed' => 40,
                'phrases' => [
                    'FREE SHIPPING ON ORDERS OVER ৳2000',
                    'NEW SEASON ARRIVALS NOW LIVE',
                    'SAME DAY DELIVERY IN DHAKA CITY',
                ],
            ], $this->settingArray($settings->get('homepage_ticker')));

            $response['hero'] = array_merge([
                'images' => [
                    ['url' => '/e-commerce-hero.jpg', 'path' => null]
                ],
                'title' => 'Refining the Art of Lifestyle',
                'show_title' => true,
                'slideshow_enabled' => true,
                'autoplay_speed' => 5000,
                'text_position' => 'center',
                'text_color' => '#ffffff',
                'font_size' => 84,
                'transition_type' => 'fade',
            ], $this->settingArray($settings->get('homepage_hero')));
        }

        // 2. New Arrivals
        if (!$group || $group === 'new_arrivals') {
            $newArrivalsSetting = array_merge([
                'enabled' => false,
                'product_ids' => [],
            ], $this->settingArray($settings->get('homepage_new_arrivals')));

            $newArrivalsSetting['product_ids'] = $this->arrayValue($newArrivalsSetting['product_ids'] ?? []);

            if ($newArrivalsSetting['enabled'] && !empty($newArrivalsSetting['product_ids'])) {
                $productIds = $newArrivalsSetting['product_ids'];
                $products = Product::with(['images', 'category', 'batches' => function ($q) {
                        $q->where('is_active', true)->where('availability', true);
                    }])
                    ->whereIn('id', $productIds)
                    ->get()
                    ->sortBy(function($product) use ($productIds) {
                        return array_search($product->id, $productIds);
                    });

                $newArrivalsSetting['products'] = $products->map(function ($product) {
                    return $this->formatProductForHome($product);
                })->values();
            } else {
                $latestIds = \Illuminate\Support\Facades\DB::table('products')
                    ->whereNull('deleted_at')
                    ->where('is_archived', false)
                    ->whereExists(function ($query) {
                        $query->select(\Illuminate\Support\Facades\DB::raw(1))
                            ->from('product_batches')
                            ->whereColumn('product_batches.product_id', 'products.id')
                            ->where('product_batches.quantity', '>', 0)
                            ->where('product_batches.is_active', true)
                            ->where('product_batches.availability', true);
                    })
                    ->select(\Illuminate\Support\Facades\DB::raw('MAX(id) as id'))
                    ->groupBy('base_name')
                    ->orderBy(\Illuminate\Support\Facades\DB::raw('MAX(created_at)'), 'desc')
                    ->take(12)
                    ->pluck('id');

                $products = Product::with(['images', 'category', 'batches' => function ($q) {
                        $q->where('is_active', true)->where('availability', true);
                    }])
                    ->whereIn('id', $latestIds)
                    ->get()
                    ->sortByDesc('created_at');

                $newArrivalsSetting['products'] = $products->map(function ($product) {
                    return $this->formatProductForHome($product);
                })->values();
            }
            $response['new_arrivals'] = $newArrivalsSetting;
        }

        // 3. Collections
        if (!$group || $group === 'collections') {
            $collectionsSetting = $this->settingArray($settings->get('homepage_collections'));
            $collectionsResponse = [];
            
            if (!empty($collectionsSetting)) {
                $idsByType = collect($collectionsSetting)->groupBy('type');
                
                $categories = collect();
                if ($idsByType->has('category')) {
                    $categoryIds = $idsByType->get('category')->pluck('id')->toArray();
                    $categories = Category::whereIn('id', $categoryIds)->get()->keyBy('id');
                }
                
                $collections = collect();
                if ($idsByType->has('collection')) {
                    $collectionIds = $idsByType->get('collection')->pluck('id')->toArray();
                    $collections = \App\Models\Collection::whereIn('id', $collectionIds)->get()->keyBy('id');
                }
                
                foreach ($collectionsSetting as $item) {
                    $type = $item['type'] ?? 'category';
                    $id = $item['id'];
                    
                    if ($type === 'category' && isset($categories[$id])) {
                        $cat = $categories[$id];
                        $collectionsResponse[] = [
                            'id' => $cat->id,
                            'type' => 'category',
                            'title' => !empty($item['title']) ? $item['title'] : $cat->title,
                            'subtitle' => $item['subtitle'] ?? 'Explore Category',
                            'image' => $cat->image_url ?: '/images/placeholder-product.jpg',
                            'href' => '/e-commerce/' . ($cat->slug ?? $cat->id),
                            'show_text' => filter_var($item['show_text'] ?? true, FILTER_VALIDATE_BOOLEAN)
                        ];
                    } elseif ($type === 'collection' && isset($collections[$id])) {
                        $col = $collections[$id];
                        $collectionsResponse[] = [
                            'id' => $col->id,
                            'type' => 'collection',
                            'title' => !empty($item['title']) ? $item['title'] : $col->name,
                            'subtitle' => $item['subtitle'] ?? 'View Collection',
                            'image' => $col->thumbnail_url ?: $col->banner_url ?: '/images/placeholder-product.jpg',
                            'href' => '/e-commerce/collections/' . ($col->slug ?? $col->id),
                            'show_text' => filter_var($item['show_text'] ?? true, FILTER_VALIDATE_BOOLEAN)
                        ];
                    }
                }
            }
            $response['collections'] = $collectionsResponse;
        }

        // 4. Showcase
        if (!$group || $group === 'showcase') {
            $response['showcase'] = $this->settingArray($settings->get('homepage_showcase'));
        }

        // 5. Bannered Collections
        if (!$group || $group === 'bannered_collections') {
            $banneredSetting = $this->settingArray($settings->get('homepage_bannered_collections'));
            $banneredResponse = [];
            
            if (!empty($banneredSetting)) {
                $idsByType = collect($banneredSetting)->groupBy('type');
                
                $categories = collect();
                if ($idsByType->has('category')) {
                    $categoryIds = $idsByType->get('category')->pluck('id')->toArray();
                    $categories = Category::whereIn('id', $categoryIds)->get()->keyBy('id');
                }
                
                $collections = collect();
                if ($idsByType->has('collection')) {
                    $collectionIds = $idsByType->get('collection')->pluck('id')->toArray();
                    $collections = \App\Models\Collection::whereIn('id', $collectionIds)->get()->keyBy('id');
                }
                
                foreach ($banneredSetting as $item) {
                    $type = $item['type'] ?? 'category';
                    $id = $item['id'];
                    
                    $resItem = [
                        'id' => (int) $id,
                        'type' => $type,
                        'show_text' => filter_var($item['show_text'] ?? true, FILTER_VALIDATE_BOOLEAN),
                        'override_image' => $item['override_image'] ?? null,
                    ];

                    if ($type === 'category' && isset($categories[$id])) {
                        $cat = $categories[$id];
                        $resItem['title'] = !empty($item['title']) ? $item['title'] : $cat->title;
                        $resItem['subtitle'] = $item['subtitle'] ?? '';
                        $resItem['image'] = !empty($item['override_image']['url']) ? $item['override_image']['url'] : ($cat->banner_url ?: $cat->image_url ?: '/images/placeholder-product.jpg');
                        $resItem['href'] = '/e-commerce/' . ($cat->slug ?? $cat->id);
                        $banneredResponse[] = $resItem;
                    } elseif ($type === 'collection' && isset($collections[$id])) {
                        $col = $collections[$id];
                        $resItem['title'] = !empty($item['title']) ? $item['title'] : $col->name;
                        $resItem['subtitle'] = $item['subtitle'] ?? '';
                        $resItem['image'] = !empty($item['override_image']['url']) ? $item['override_image']['url'] : ($col->banner_url ?: $col->thumbnail_url ?: '/images/placeholder-product.jpg');
                        $resItem['href'] = '/e-commerce/collections/' . ($col->slug ?? $col->id);
                        $banneredResponse[] = $resItem;
                    }
                }
            }
            $response['bannered_collections'] = $banneredResponse;
        }

        // 6. Promotion Banners
        if (!$group || $group === 'promotion_banners') {
            $promotionBannersSetting = array_merge([
                'enabled' => false,
                'items' => [],
            ], $this->settingArray($settings->get('homepage_promotion_banners')));

            $response['promotion_banners'] = $this->formatPromotionBannersForResponse($promotionBannersSetting, true);
        }

        return response()->json($response);
    }

    /**
     * Get homepage settings for the admin panel.
     */
    public function getAdminHomepageSettings()
    {
        $settings = Setting::where('group', 'homepage')->pluck('value', 'key');
        
        $newArrivals = array_merge([
            'enabled' => false,
            'product_ids' => [],
        ], $this->settingArray($settings->get('homepage_new_arrivals')));

        $newArrivals['product_ids'] = $this->arrayValue($newArrivals['product_ids'] ?? []);

        if (!empty($newArrivals['product_ids'])) {
            $ids = $newArrivals['product_ids'];
            $newArrivals['products'] = Product::whereIn('id', $ids)
                ->with(['images', 'category', 'batches' => function ($q) {
                    $q->where('is_active', true)->where('availability', true);
                }])
                ->get()
                ->sortBy(function($model) use ($ids) {
                    return array_search($model->id, $ids);
                })
                ->map(function ($product) {
                    return $this->formatProductForHome($product);
                })
                ->values();
        }

        return response()->json([
            'global_theme' => $this->getGlobalThemeData(),
            'ticker' => array_merge([
                'enabled' => true,
                'mode' => 'moving',
                'background_color' => '#111111',
                'text_color' => '#ffffff',
                'speed' => 40,
                'phrases' => [
                    'FREE SHIPPING ON ORDERS OVER ৳2000',
                    'NEW SEASON ARRIVALS NOW LIVE',
                    'SAME DAY DELIVERY IN DHAKA CITY',
                ],
            ], $this->settingArray($settings->get('homepage_ticker'))),
            'hero' => array_merge([
                'images' => [
                    ['url' => '/e-commerce-hero.jpg', 'path' => null]
                ],
                'title' => 'Refining the Art of Lifestyle',
                'show_title' => true,
                'slideshow_enabled' => true,
                'autoplay_speed' => 5000,
                'text_position' => 'center',
                'text_color' => '#ffffff',
                'font_size' => 84,
                'transition_type' => 'fade',
            ], $this->settingArray($settings->get('homepage_hero'))),
            'collections' => $this->settingArray($settings->get('homepage_collections')),
            'showcase' => $this->settingArray($settings->get('homepage_showcase')),
            'bannered_collections' => $this->settingArray($settings->get('homepage_bannered_collections')),
            'promotion_banners' => $this->formatPromotionBannersForResponse(array_merge([
                'enabled' => false,
                'items' => [],
            ], $this->settingArray($settings->get('homepage_promotion_banners'))), false),
            'section_order' => $this->normalizeHomepageSectionOrder($settings->get('homepage_section_order', ['hero', 'featured_collections', 'new_arrivals', 'promotion_banners', 'bannered_collections', 'showcase'])),
            'new_arrivals' => $newArrivals
        ]);
    }

    /**
     * Update homepage settings from the admin panel.
     */
    public function updateHomepageSettings(Request $request)
    {
        $validated = $request->validate([
            'global_theme' => 'nullable|array',
            'global_theme.color_bg_primary' => 'nullable|string|max:50',
            'global_theme.color_bg_secondary' => 'nullable|string|max:50',
            'global_theme.color_text_primary' => 'nullable|string|max:50',
            'global_theme.color_text_secondary' => 'nullable|string|max:50',
            'global_theme.color_accent' => 'nullable|string|max:50',
            'global_theme.color_accent_text' => 'nullable|string|max:50',
            'global_theme.color_border' => 'nullable|string|max:80',
            'global_theme.color_card_bg' => 'nullable|string|max:50',
            'global_theme.font_body' => 'nullable|string|max:80',
            'global_theme.font_body_weight' => 'nullable|string|max:10',
            'global_theme.card_shadow_enabled' => 'nullable|string',
            'global_theme.card_shadow_type' => 'nullable|string|in:glow,directional',
            'global_theme.card_shadow_color' => 'nullable|string|max:80',
            'global_theme.card_shadow_direction' => 'nullable|string|in:bottom,bottom-right,bottom-left',
            'global_theme.card_shadow_intensity' => 'nullable|integer|min:0|max:100',

            'ticker' => 'nullable|array',
            'ticker.enabled' => 'nullable|string',
            'ticker.mode' => 'nullable|string|in:static,moving',
            'ticker.background_color' => 'nullable|string|max:20',
            'ticker.text_color' => 'nullable|string|max:20',
            'ticker.speed' => 'nullable|integer|min:5|max:200',
            'ticker.phrases' => 'nullable|array',
            'ticker.phrases.*' => 'nullable|string|max:255',
            
            'collections' => 'nullable|array',
            'collections.*.id' => 'required|integer',
            'collections.*.type' => 'required|string|in:category,collection',
            'collections.*.title' => 'nullable|string|max:255',
            'collections.*.subtitle' => 'nullable|string|max:255',
            'collections.*.show_text' => 'nullable|string',
            
            'showcase' => 'nullable|array',
            'showcase.*.category_id' => 'required|integer',
            'showcase.*.subcategories' => 'nullable|array',
            'showcase.*.subcategories.*' => 'integer',
            
            'hero_images' => 'nullable|array',
            'hero_images.*' => 'nullable|image|max:5120',
            'hero_images_meta' => 'nullable|string', // JSON string representing the order and state of hero images
            'hero_title' => 'nullable|string|max:500',
            'hero_show_title' => 'nullable|string',
            'hero_slideshow_enabled' => 'nullable|string',
            'hero_autoplay_speed' => 'nullable|integer|min:1000|max:30000',
            'hero_text_position' => 'nullable|string|in:top-left,top-right,bottom-left,bottom-right,center',
            'hero_text_color' => 'nullable|string|max:20',
            'hero_font_size' => 'nullable|integer|min:20',
            'hero_transition_type' => 'nullable|string|in:fade,slide',

            'new_arrivals' => 'nullable|array',
            'new_arrivals.enabled' => 'nullable|string',
            'new_arrivals.product_ids' => 'nullable|array',
            'new_arrivals.product_ids.*' => 'integer|exists:products,id',

            'bannered_collections' => 'nullable|array',
            'bannered_collections.*.id' => 'required|integer',
            'bannered_collections.*.type' => 'required|string|in:category,collection',
            'bannered_collections.*.title' => 'nullable|string|max:255',
            'bannered_collections.*.subtitle' => 'nullable|string|max:255',
            'bannered_collections.*.show_text' => 'nullable|string',
            'bannered_collections_images' => 'nullable|array',
            'bannered_collections_images.*' => 'nullable|image|max:5120',
            'bannered_collections_meta' => 'nullable|string',

            'promotion_banners_enabled' => 'nullable|string',
            'promotion_banners_images' => 'nullable|array',
            'promotion_banners_images.*' => 'nullable|image|max:5120',
            'promotion_banners_meta' => 'nullable|string',

            'section_order' => 'nullable|array',
            'section_order.*' => 'string|in:hero,featured_collections,new_arrivals,promotion_banners,bannered_collections,showcase',
        ]);

        if ($request->has('global_theme')) {
            $globalTheme = array_merge($this->globalThemeDefaults(), $this->validatedArray($validated, 'global_theme'));
            $globalTheme['card_shadow_enabled'] = filter_var($globalTheme['card_shadow_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $globalTheme['card_shadow_intensity'] = (int) ($globalTheme['card_shadow_intensity'] ?? 35);

            Setting::updateOrCreate(
                ['key' => 'global_theme'],
                ['value' => $globalTheme, 'group' => 'global']
            );
        }

        if ($request->has('ticker')) {
            $tickerData = $validated['ticker'];
            // FormData sends "1"/"0" as strings — normalize to boolean
            if (isset($tickerData['enabled'])) {
                $tickerData['enabled'] = filter_var($tickerData['enabled'], FILTER_VALIDATE_BOOLEAN);
            }
            Setting::updateOrCreate(
                ['key' => 'homepage_ticker'],
                ['value' => $tickerData, 'group' => 'homepage']
            );
        }

        if ($request->has('collections')) {
            $collectionsData = $this->validatedArray($validated, 'collections');
            foreach ($collectionsData as &$col) {
                if (isset($col['show_text'])) {
                    $col['show_text'] = filter_var($col['show_text'], FILTER_VALIDATE_BOOLEAN);
                }
            }
            unset($col);
            Setting::updateOrCreate(
                ['key' => 'homepage_collections'],
                ['value' => $collectionsData, 'group' => 'homepage']
            );
        }

        if ($request->has('showcase')) {
            Setting::updateOrCreate(
                ['key' => 'homepage_showcase'],
                ['value' => $this->validatedArray($validated, 'showcase'), 'group' => 'homepage']
            );
        }

        if ($request->has('new_arrivals')) {
            $newArrivalsData = $this->validatedArray($validated, 'new_arrivals');
            $newArrivalsData['enabled'] = filter_var($newArrivalsData['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $newArrivalsData['product_ids'] = array_values(array_filter(
                $this->arrayValue($newArrivalsData['product_ids'] ?? []),
                fn ($id) => $id !== null && $id !== ''
            ));
            Setting::updateOrCreate(
                ['key' => 'homepage_new_arrivals'],
                ['value' => $newArrivalsData, 'group' => 'homepage']
            );
        }

        if ($request->has('section_order')) {
            Setting::updateOrCreate(
                ['key' => 'homepage_section_order'],
                ['value' => $this->normalizeHomepageSectionOrder($this->validatedArray($validated, 'section_order')), 'group' => 'homepage']
            );
        }

        if ($request->has('bannered_collections_meta')) {
            $currentBannered = $this->settingArray(Setting::where('key', 'homepage_bannered_collections')->first()?->value);
            $meta = $this->jsonArrayInput($request, 'bannered_collections_meta');
            $newBannered = [];
            $uploadedFiles = $this->arrayValue($request->file('bannered_collections_images') ?? []);

            foreach ($meta as $index => $item) {
                if (!is_array($item) || empty($item['id']) || empty($item['type'])) {
                    continue;
                }
                $banneredItem = [
                    'id' => (int) $item['id'],
                    'type' => $item['type'],
                    'title' => $item['title'] ?? '',
                    'subtitle' => $item['subtitle'] ?? '',
                    'show_text' => filter_var($item['show_text'] ?? true, FILTER_VALIDATE_BOOLEAN),
                ];

                $imageType = $item['image_type'] ?? 'none';
                if ($imageType === 'existing') {
                    $banneredItem['override_image'] = $item['override_image'] ?? null;
                } elseif ($imageType === 'new' && isset($item['fileIndex'], $uploadedFiles[$item['fileIndex']])) {
                    $file = $uploadedFiles[$item['fileIndex']];
                    $path = $file->store('homepage/bannered', 'public');
                    $banneredItem['override_image'] = [
                        'url' => rtrim(config('app.url'), '/') . '/storage/' . ltrim($path, '/'),
                        'path' => $path
                    ];
                } else {
                    $banneredItem['override_image'] = null;
                }

                $newBannered[] = $banneredItem;
            }

            // Optional: Clean up old override images
            $oldPaths = collect($currentBannered)->pluck('override_image.path')->filter()->toArray();
            $newPaths = collect($newBannered)->pluck('override_image.path')->filter()->toArray();
            $toDelete = array_diff($oldPaths, $newPaths);
            foreach ($toDelete as $path) {
                Storage::disk('public')->delete($path);
            }

            Setting::updateOrCreate(
                ['key' => 'homepage_bannered_collections'],
                ['value' => $newBannered, 'group' => 'homepage']
            );
        }

        if ($request->has('promotion_banners_meta') || $request->has('promotion_banners_enabled')) {
            $currentPromotionBanners = array_merge(
                ['enabled' => false, 'items' => []],
                $this->settingArray(Setting::where('key', 'homepage_promotion_banners')->first()?->value)
            );
            $currentPromotionBanners['items'] = $this->arrayValue($currentPromotionBanners['items'] ?? []);
            $meta = $this->jsonArrayInput($request, 'promotion_banners_meta');

            $newPromotionBanners = [
                'enabled' => filter_var($request->input('promotion_banners_enabled', $currentPromotionBanners['enabled'] ?? false), FILTER_VALIDATE_BOOLEAN),
                'items' => [],
            ];
            $uploadedFiles = $this->arrayValue($request->file('promotion_banners_images') ?? []);

            $meta = array_slice($meta, 0, 3);
            foreach ($meta as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $promotionId = (int) ($item['promotion_id'] ?? 0);
                if ($promotionId <= 0 || !Promotion::whereKey($promotionId)->exists()) {
                    continue;
                }

                $bannerItem = [
                    'promotion_id' => $promotionId,
                    'timer_enabled' => filter_var($item['timer_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                ];

                $imageType = $item['image_type'] ?? 'none';
                if ($imageType === 'existing') {
                    $bannerItem['override_image'] = $item['override_image'] ?? null;
                } elseif ($imageType === 'new' && isset($item['fileIndex'], $uploadedFiles[$item['fileIndex']])) {
                    $file = $uploadedFiles[$item['fileIndex']];
                    $path = $file->store('homepage/promotion-banners', 'public');
                    $bannerItem['override_image'] = [
                        'url' => rtrim(config('app.url'), '/') . '/storage/' . ltrim($path, '/'),
                        'path' => $path,
                    ];
                } else {
                    $bannerItem['override_image'] = null;
                }

                $newPromotionBanners['items'][] = $bannerItem;
            }

            $oldPaths = collect($currentPromotionBanners['items'] ?? [])->pluck('override_image.path')->filter()->toArray();
            $newPaths = collect($newPromotionBanners['items'])->pluck('override_image.path')->filter()->toArray();
            $toDelete = array_diff($oldPaths, $newPaths);
            foreach ($toDelete as $path) {
                Storage::disk('public')->delete($path);
            }

            Setting::updateOrCreate(
                ['key' => 'homepage_promotion_banners'],
                ['value' => $newPromotionBanners, 'group' => 'homepage']
            );
        }

        if ($request->has('hero_images') || $request->has('hero_images_meta') || $request->has('hero_title') || $request->has('hero_show_title') || $request->has('hero_text_position') || $request->has('hero_transition_type')) {
            $currentHero = $this->settingArray(Setting::where('key', 'homepage_hero')->first()?->value);
            
            // Handle multiple hero images
            if ($request->has('hero_images_meta')) {
                $meta = $this->jsonArrayInput($request, 'hero_images_meta');
                $newImages = [];
                
                // Track files by index
                $uploadedFiles = $this->arrayValue($request->file('hero_images') ?? []);
                
                foreach ($meta as $item) {
                    if (!is_array($item) || empty($item['type'])) {
                        continue;
                    }
                    if ($item['type'] === 'existing') {
                        $newImages[] = [
                            'url' => $item['url'],
                            'path' => $item['path'] ?? null
                        ];
                    } elseif ($item['type'] === 'new' && isset($item['fileIndex'], $uploadedFiles[$item['fileIndex']])) {
                        $file = $uploadedFiles[$item['fileIndex']];
                        $path = $file->store('homepage', 'public');
                        $newImages[] = [
                            'url' => rtrim(config('app.url'), '/') . '/storage/' . ltrim($path, '/'),
                            'path' => $path
                        ];
                    }
                }
                
                // Clean up old images that are no longer in the list
                $oldPaths = collect($currentHero['images'] ?? [])->pluck('path')->filter()->toArray();
                $newPaths = collect($newImages)->pluck('path')->filter()->toArray();
                $toDelete = array_diff($oldPaths, $newPaths);
                
                foreach ($toDelete as $path) {
                    Storage::disk('public')->delete($path);
                }
                
                $currentHero['images'] = $newImages;
            } elseif ($request->hasFile('hero_image')) {
                // Fallback for single image upload (backward compatibility)
                $oldPath = $currentHero['image_path'] ?? null;
                if ($oldPath) {
                    Storage::disk('public')->delete($oldPath);
                }
                $path = $request->file('hero_image')->store('homepage', 'public');
                $url = rtrim(config('app.url'), '/') . '/storage/' . ltrim($path, '/');
                $currentHero['images'] = [['url' => $url, 'path' => $path]];
                $currentHero['image_url'] = $url;
                $currentHero['image_path'] = $path;
            }
            
            if ($request->has('hero_title')) {
                $currentHero['title'] = $request->input('hero_title');
            }
            
            if ($request->has('hero_show_title')) {
                $currentHero['show_title'] = filter_var($request->input('hero_show_title'), FILTER_VALIDATE_BOOLEAN);
            }

            if ($request->has('hero_slideshow_enabled')) {
                $currentHero['slideshow_enabled'] = filter_var($request->input('hero_slideshow_enabled'), FILTER_VALIDATE_BOOLEAN);
            }

            if ($request->has('hero_autoplay_speed')) {
                $currentHero['autoplay_speed'] = (int) $request->input('hero_autoplay_speed');
            }
            
            if ($request->has('hero_text_position')) {
                $currentHero['text_position'] = $request->input('hero_text_position');
            }

            if ($request->has('hero_text_color')) {
                $currentHero['text_color'] = $request->input('hero_text_color');
            }

            if ($request->has('hero_font_size')) {
                $currentHero['font_size'] = (int) $request->input('hero_font_size');
            }

            if ($request->has('hero_transition_type')) {
                $currentHero['transition_type'] = $request->input('hero_transition_type');
            }

            Setting::updateOrCreate(
                ['key' => 'homepage_hero'],
                ['value' => $currentHero, 'group' => 'homepage']
            );
        }

        return response()->json(['message' => 'Homepage settings updated successfully']);
    }

    private function arrayValue($value): array
    {
        return is_array($value) ? $value : [];
    }

    private function settingArray($value, array $default = []): array
    {
        return is_array($value) ? $value : $default;
    }

    private function validatedArray(array $validated, string $key): array
    {
        return isset($validated[$key]) && is_array($validated[$key]) ? $validated[$key] : [];
    }

    private function jsonArrayInput(Request $request, string $key): array
    {
        $decoded = json_decode($request->input($key, '[]') ?: '[]', true);

        return is_array($decoded) ? $decoded : [];
    }

    private function defaultHomepageSectionOrder(): array
    {
        return ['hero', 'featured_collections', 'new_arrivals', 'promotion_banners', 'bannered_collections', 'showcase'];
    }

    private function normalizeHomepageSectionOrder($order): array
    {
        $default = $this->defaultHomepageSectionOrder();
        $current = is_array($order) ? $order : [];
        $cleaned = array_values(array_filter($current, fn ($section) => in_array($section, $default, true)));

        foreach ($default as $section) {
            if (!in_array($section, $cleaned, true)) {
                $cleaned[] = $section;
            }
        }

        return $cleaned;
    }

    /**
     * Format configured promotion banners for admin and public storefront responses.
     */
    private function formatPromotionBannersForResponse(array $setting, bool $storefront = false): array
    {
        $enabled = filter_var($setting['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $items = array_slice($this->arrayValue($setting['items'] ?? []), 0, 3);

        if (empty($items)) {
            return [
                'enabled' => $enabled,
                'items' => [],
            ];
        }

        $promotionIds = collect($items)->pluck('promotion_id')->filter()->unique()->values()->all();
        $query = Promotion::query()->whereIn('id', $promotionIds);

        if ($storefront) {
            $query->where('is_active', true)
                ->where('is_public', true)
                ->where('start_date', '<=', now())
                ->where(function ($q) {
                    $q->whereNull('end_date')->orWhere('end_date', '>=', now());
                })
                ->where(function ($q) {
                    $q->whereNull('usage_limit')->orWhereColumn('usage_count', '<', 'usage_limit');
                });
        }

        $promotions = $query->get([
            'id',
            'code',
            'name',
            'description',
            'type',
            'discount_value',
            'start_date',
            'end_date',
            'is_active',
            'is_public',
        ])->keyBy('id');

        $formattedItems = [];
        foreach ($items as $item) {
            $promotionId = (int) ($item['promotion_id'] ?? 0);
            if (!$promotionId || !isset($promotions[$promotionId])) {
                continue;
            }

            $promotion = $promotions[$promotionId];
            $overrideImage = $item['override_image'] ?? null;
            $imageUrl = $overrideImage['url'] ?? null;

            $formattedItems[] = [
                'promotion_id' => $promotion->id,
                'timer_enabled' => filter_var($item['timer_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'image' => $imageUrl ?: '/images/placeholder-product.jpg',
                'override_image' => $overrideImage,
                'promotion' => [
                    'id' => $promotion->id,
                    'code' => $promotion->code,
                    'name' => $promotion->name,
                    'description' => $promotion->description,
                    'type' => $promotion->type,
                    'discount_value' => $promotion->discount_value,
                    'start_date' => optional($promotion->start_date)->toISOString(),
                    'end_date' => optional($promotion->end_date)->toISOString(),
                    'is_active' => (bool) $promotion->is_active,
                    'is_public' => (bool) $promotion->is_public,
                ],
            ];
        }

        return [
            'enabled' => $enabled,
            'items' => $enabled || !$storefront ? $formattedItems : [],
        ];
    }

    /**
     * Default storefront design-system tokens.
     */
    private function globalThemeDefaults(): array
    {
        return [
            'color_bg_primary' => '#ffffff',
            'color_bg_secondary' => '#f5f5f5',
            'color_text_primary' => '#111111',
            'color_text_secondary' => '#555555',
            'color_accent' => '#111111',
            'color_accent_text' => '#ffffff',
            'color_border' => 'rgba(0,0,0,0.10)',
            'color_card_bg' => '#ffffff',
            'font_body' => 'Poppins',
            'font_body_weight' => '400',
            'card_shadow_enabled' => false,
            'card_shadow_type' => 'directional',
            'card_shadow_color' => 'rgba(0,0,0,0.12)',
            'card_shadow_direction' => 'bottom',
            'card_shadow_intensity' => 35,
        ];
    }

    /**
     * Read the global ecommerce theme without affecting admin UI theme settings.
     */
    private function getGlobalThemeData(): array
    {
        $stored = Setting::where('key', 'global_theme')->where('group', 'global')->first()?->value ?? [];

        return array_merge($this->globalThemeDefaults(), $this->settingArray($stored));
    }

    /**
     * Helper to format products consistently for the home page sections.
     */
    private function formatProductForHome(Product $product): array
    {
        $activeBatches = $product->batches;
        $cheapestBatch = $activeBatches->where('quantity', '>', 0)->sortBy('sell_price')->first() 
                        ?? $activeBatches->sortBy('sell_price')->first();
        
        return [
            'id' => $product->id,
            'name' => $product->name,
            'base_name' => $product->base_name,
            'sku' => $product->sku,
            'selling_price' => $cheapestBatch ? (float) $cheapestBatch->sell_price : 0,
            'images' => $product->images->where('is_active', true)->take(2)->map(function ($image) {
                return [
                    'id' => $image->id,
                    'url' => $image->image_url,
                    'alt_text' => $image->alt_text,
                    'is_primary' => $image->is_primary,
                ];
            }),
            'category' => $product->category ? ['id' => $product->category->id, 'title' => $product->category->title] : null,
            'in_stock' => $activeBatches->sum('quantity') > 0,
            'has_variants' => Product::where('base_name', $product->base_name)->count() > 1
        ];
    }
}
