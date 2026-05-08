<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    /**
     * Get homepage settings for the public storefront.
     */
    public function getHomepageSettings()
    {
        $settings = Setting::where('group', 'homepage')->pluck('value', 'key');
        
        $response = [
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
            ], $settings->get('homepage_ticker', [])),
            'hero' => array_merge([
                'images' => [
                    ['url' => '/e-commerce-hero.jpg', 'path' => null]
                ],
                'title' => 'Refining the Art of Lifestyle',
                'show_title' => true,
                'slideshow_enabled' => true,
                'autoplay_speed' => 5000,
            ], $settings->get('homepage_hero', [])),
            'collections' => [],
            'showcase' => $settings->get('homepage_showcase') // default will be null if missing, so storefront knows to fallback to "all categories"
        ];

        $collectionsSetting = $settings->get('homepage_collections', []);
        
        if (!empty($collectionsSetting)) {
            $categoryIds = collect($collectionsSetting)->pluck('id')->toArray();
            if (!empty($categoryIds)) {
                $categories = Category::whereIn('id', $categoryIds)->get()->keyBy('id');
                
                foreach ($collectionsSetting as $item) {
                    if (isset($categories[$item['id']])) {
                        $cat = $categories[$item['id']];
                        // Use accessors for absolute URLs
                        $imageUrl = $cat->image_url ?: '/images/placeholder-product.jpg';
                        
                        $response['collections'][] = [
                            'id' => $cat->id,
                            'title' => $cat->title,
                            'subtitle' => $item['subtitle'] ?? 'Explore Collection',
                            'image' => $imageUrl,
                            'href' => '/e-commerce/' . $cat->slug
                        ];
                    }
                }
            }
        }
        
        return response()->json($response);
    }

    /**
     * Get homepage settings for the admin panel.
     */
    public function getAdminHomepageSettings()
    {
        $settings = Setting::where('group', 'homepage')->pluck('value', 'key');
        return response()->json([
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
            ], $settings->get('homepage_ticker', [])),
            'hero' => array_merge([
                'images' => [
                    ['url' => '/e-commerce-hero.jpg', 'path' => null]
                ],
                'title' => 'Refining the Art of Lifestyle',
                'show_title' => true,
                'slideshow_enabled' => true,
                'autoplay_speed' => 5000,
            ], $settings->get('homepage_hero', [])),
            'collections' => $settings->get('homepage_collections', []),
            'showcase' => $settings->get('homepage_showcase', [])
        ]);
    }

    /**
     * Update homepage settings from the admin panel.
     */
    public function updateHomepageSettings(Request $request)
    {
        $validated = $request->validate([
            'ticker' => 'nullable|array',
            'ticker.enabled' => 'nullable|string',
            'ticker.mode' => 'nullable|string|in:static,moving',
            'ticker.background_color' => 'nullable|string|max:20',
            'ticker.text_color' => 'nullable|string|max:20',
            'ticker.speed' => 'nullable|integer|min:5|max:200',
            'ticker.phrases' => 'nullable|array',
            'ticker.phrases.*' => 'nullable|string|max:255',
            
            'collections' => 'nullable|array',
            'collections.*.id' => 'required|exists:categories,id',
            'collections.*.subtitle' => 'nullable|string|max:255',
            
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
        ]);

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
            Setting::updateOrCreate(
                ['key' => 'homepage_collections'],
                ['value' => $validated['collections'], 'group' => 'homepage']
            );
        }

        if ($request->has('showcase')) {
            Setting::updateOrCreate(
                ['key' => 'homepage_showcase'],
                ['value' => $validated['showcase'], 'group' => 'homepage']
            );
        }

        if ($request->has('hero_images') || $request->has('hero_images_meta') || $request->has('hero_title') || $request->has('hero_show_title')) {
            $currentHero = Setting::where('key', 'homepage_hero')->first()?->value ?? [];
            
            // Handle multiple hero images
            if ($request->has('hero_images_meta')) {
                $meta = json_decode($request->input('hero_images_meta'), true);
                $newImages = [];
                
                // Track files by index
                $uploadedFiles = $request->file('hero_images') ?? [];
                
                foreach ($meta as $item) {
                    if ($item['type'] === 'existing') {
                        $newImages[] = [
                            'url' => $item['url'],
                            'path' => $item['path'] ?? null
                        ];
                    } elseif ($item['type'] === 'new' && isset($uploadedFiles[$item['fileIndex']])) {
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

            Setting::updateOrCreate(
                ['key' => 'homepage_hero'],
                ['value' => $currentHero, 'group' => 'homepage']
            );
        }

        return response()->json(['message' => 'Homepage settings updated successfully']);
    }
}
