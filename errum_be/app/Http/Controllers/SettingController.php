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
            'ticker' => $settings->get('homepage_ticker', ['enabled' => true, 'text' => 'FREE SHIPPING ON ORDERS OVER ৳2000']),
            'hero' => $settings->get('homepage_hero', [
                'image_url' => '/e-commerce-hero.jpg',
                'title' => 'Refining the Art of Lifestyle',
                'show_title' => true
            ]),
            'collections' => []
        ];

        $collectionsSetting = $settings->get('homepage_collections', []);
        
        if (!empty($collectionsSetting)) {
            $categoryIds = collect($collectionsSetting)->pluck('id')->toArray();
            if (!empty($categoryIds)) {
                $categories = Category::whereIn('id', $categoryIds)->get()->keyBy('id');
                
                foreach ($collectionsSetting as $item) {
                    if (isset($categories[$item['id']])) {
                        $cat = $categories[$item['id']];
                        // Construct absolute URL for the image
                        $imageUrl = $cat->banner_image 
                            ? asset('storage/' . $cat->banner_image) 
                            : ($cat->image ? asset('storage/' . $cat->image) : '/images/placeholder-product.jpg');
                        
                        $response['collections'][] = [
                            'id' => $cat->id,
                            'title' => $cat->name,
                            'subtitle' => $item['subtitle'] ?? 'Explore Collection',
                            'image' => $imageUrl,
                            'href' => '/e-commerce/categories/' . $cat->slug
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
            'ticker' => $settings->get('homepage_ticker', ['enabled' => true, 'text' => 'FREE SHIPPING ON ORDERS OVER ৳2000']),
            'hero' => $settings->get('homepage_hero', [
                'image_url' => '/e-commerce-hero.jpg',
                'title' => 'Refining the Art of Lifestyle',
                'show_title' => true
            ]),
            'collections' => $settings->get('homepage_collections', [])
        ]);
    }

    /**
     * Update homepage settings from the admin panel.
     */
    public function updateHomepageSettings(Request $request)
    {
        $validated = $request->validate([
            'ticker' => 'nullable|array',
            'ticker.enabled' => 'boolean',
            'ticker.text' => 'nullable|string|max:255',
            
            'collections' => 'nullable|array',
            'collections.*.id' => 'required|exists:categories,id',
            'collections.*.subtitle' => 'nullable|string|max:255',
            
            'hero_image' => 'nullable|image|max:5120',
            'hero_title' => 'nullable|string|max:255',
            'hero_show_title' => 'nullable|string', // arrives as "1" or "0" from FormData
        ]);

        if ($request->has('ticker')) {
            Setting::updateOrCreate(
                ['key' => 'homepage_ticker'],
                ['value' => $validated['ticker'], 'group' => 'homepage']
            );
        }

        if ($request->has('collections')) {
            Setting::updateOrCreate(
                ['key' => 'homepage_collections'],
                ['value' => $validated['collections'], 'group' => 'homepage']
            );
        }

        if ($request->hasFile('hero_image') || $request->has('hero_title') || $request->has('hero_show_title')) {
            $currentHero = Setting::where('key', 'homepage_hero')->first()?->value ?? [];
            
            if ($request->hasFile('hero_image')) {
                $path = $request->file('hero_image')->store('homepage', 'public');
                $currentHero['image_url'] = asset('storage/' . $path);
            }
            
            if ($request->has('hero_title')) {
                $currentHero['title'] = $validated['hero_title'];
            }
            
            if ($request->has('hero_show_title')) {
                $currentHero['show_title'] = $validated['hero_show_title'] === "1";
            }

            Setting::updateOrCreate(
                ['key' => 'homepage_hero'],
                ['value' => $currentHero, 'group' => 'homepage']
            );
        }

        return response()->json(['message' => 'Homepage settings updated successfully']);
    }
}
