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
                'phrases' => [
                    'FREE SHIPPING ON ORDERS OVER ৳2000',
                    'NEW SEASON ARRIVALS NOW LIVE',
                    'SAME DAY DELIVERY IN DHAKA CITY',
                ],
            ], $settings->get('homepage_ticker', [])),
            'hero' => array_merge([
                'image_url' => '/e-commerce-hero.jpg',
                'title' => 'Refining the Art of Lifestyle',
                'show_title' => true
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
                'phrases' => [
                    'FREE SHIPPING ON ORDERS OVER ৳2000',
                    'NEW SEASON ARRIVALS NOW LIVE',
                    'SAME DAY DELIVERY IN DHAKA CITY',
                ],
            ], $settings->get('homepage_ticker', [])),
            'hero' => array_merge([
                'image_url' => '/e-commerce-hero.jpg',
                'title' => 'Refining the Art of Lifestyle',
                'show_title' => true
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
            'ticker.enabled' => 'nullable|string', // arrives as "1" or "0" from FormData; cast below
            'ticker.phrases' => 'nullable|array',
            'ticker.phrases.*' => 'nullable|string|max:255',
            
            'collections' => 'nullable|array',
            'collections.*.id' => 'required|exists:categories,id',
            'collections.*.subtitle' => 'nullable|string|max:255',
            
            'showcase' => 'nullable|array',
            'showcase.*.category_id' => 'required|integer',
            'showcase.*.subcategories' => 'nullable|array',
            'showcase.*.subcategories.*' => 'integer',
            
            'hero_image' => 'nullable|image|max:5120',
            'hero_title' => 'nullable|string|max:255',
            'hero_show_title' => 'nullable|string', // arrives as "1" or "0" from FormData
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

        if ($request->hasFile('hero_image') || $request->has('hero_title') || $request->has('hero_show_title')) {
            $currentHero = Setting::where('key', 'homepage_hero')->first()?->value ?? [];
            
            if ($request->hasFile('hero_image')) {
                // Delete old hero image from storage before replacing
                $oldPath = $currentHero['image_path'] ?? null;
                if ($oldPath) {
                    Storage::disk('public')->delete($oldPath);
                }
                $path = $request->file('hero_image')->store('homepage', 'public');
                $currentHero['image_url'] = rtrim(config('app.url'), '/') . '/storage/' . ltrim($path, '/');
                $currentHero['image_path'] = $path; // store relative path for future deletion
            }
            
            // Only overwrite title if it's non-empty (guards against empty-string overwrite)
            if ($request->has('hero_title') && !empty($validated['hero_title'])) {
                $currentHero['title'] = $validated['hero_title'];
            }
            
            if ($request->has('hero_show_title')) {
                $currentHero['show_title'] = $validated['hero_show_title'] === '1';
            }

            Setting::updateOrCreate(
                ['key' => 'homepage_hero'],
                ['value' => $currentHero, 'group' => 'homepage']
            );
        }

        return response()->json(['message' => 'Homepage settings updated successfully']);
    }
}
