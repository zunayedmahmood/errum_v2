"use client";

import React, { useState, useEffect } from "react";
import settingsService, { HomepageSettings } from "@/services/settingsService";
import categoryService, { Category } from "@/services/categoryService";
import { Save, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "react-hot-toast";

export default function HomepageSettingsPage() {
  const [settings, setSettings] = useState<HomepageSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [flatCategories, setFlatCategories] = useState<{ id: number; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroPreview, setHeroPreview] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsData, categoryTree] = await Promise.all([
        settingsService.getAdminHomepageSettings(),
        categoryService.getTree(true)
      ]);
      setSettings(settingsData);
      
      const flatten = (cats: Category[], path = ""): { id: number; title: string }[] => {
        let result: { id: number; title: string }[] = [];
        cats.forEach(c => {
          const title = path ? `${path} > ${c.title}` : c.title;
          result.push({ id: c.id, title });
          if (c.all_children) {
            result = result.concat(flatten(c.all_children, title));
          }
        });
        return result;
      };
      setFlatCategories(flatten(categoryTree));
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      const formData = new FormData();
      
      // Ticker
      formData.append("ticker[enabled]", settings.ticker.enabled ? "1" : "0");
      formData.append("ticker[text]", settings.ticker.text);
      
      // Hero
      formData.append("hero_title", settings.hero.title || "");
      formData.append("hero_show_title", settings.hero.show_title ? "1" : "0");

      
      // Collections
      settings.collections.forEach((col, index) => {
        formData.append(`collections[${index}][id]`, String(col.id));
        formData.append(`collections[${index}][subtitle]`, col.subtitle || "");
      });
      
      // Hero Image
      if (heroImageFile) {
        formData.append("hero_image", heroImageFile);
      }
      
      await settingsService.updateHomepageSettings(formData);
      toast.success("Homepage settings updated successfully");
      loadData(); // reload to get new image URL
      setHeroImageFile(null);
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const addCollection = () => {
    if (!settings) return;
    setSettings({
      ...settings,
      collections: [...settings.collections, { id: flatCategories[0]?.id || 0, subtitle: "" }]
    });
  };

  const removeCollection = (index: number) => {
    if (!settings) return;
    const newCollections = [...settings.collections];
    newCollections.splice(index, 1);
    setSettings({ ...settings, collections: newCollections });
  };

  const moveCollection = (index: number, direction: 'up' | 'down') => {
    if (!settings) return;
    const newCollections = [...settings.collections];
    if (direction === 'up' && index > 0) {
      [newCollections[index - 1], newCollections[index]] = [newCollections[index], newCollections[index - 1]];
    } else if (direction === 'down' && index < newCollections.length - 1) {
      [newCollections[index + 1], newCollections[index]] = [newCollections[index], newCollections[index + 1]];
    }
    setSettings({ ...settings, collections: newCollections });
  };

  if (loading) return <div className="p-8">Loading settings...</div>;
  if (!settings) return <div className="p-8">Error loading settings</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto pb-20">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Homepage Configuration</h1>
          <p className="text-sm text-gray-500">Manage the content displayed on the e-commerce homepage.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="space-y-8">
        {/* Ticker Section */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Announcement Ticker</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="tickerEnabled"
                checked={settings.ticker.enabled}
                onChange={(e) => setSettings({ ...settings, ticker: { ...settings.ticker, enabled: e.target.checked } })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="tickerEnabled" className="text-sm font-medium text-gray-900 dark:text-white">
                Enable Ticker
              </label>
            </div>
            {settings.ticker.enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ticker Text</label>
                <input
                  type="text"
                  value={settings.ticker.text}
                  onChange={(e) => setSettings({ ...settings, ticker: { ...settings.ticker, text: e.target.value } })}
                  placeholder="e.g. FREE SHIPPING ON ORDERS OVER ৳2000"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </section>

        {/* Hero Section */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Hero Section</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="heroShowTitle"
                checked={settings.hero.show_title}
                onChange={(e) => setSettings({ ...settings, hero: { ...settings.hero, show_title: e.target.checked } })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="heroShowTitle" className="text-sm font-medium text-gray-900 dark:text-white">
                Show Hero Text
              </label>
            </div>
            
            {settings.hero.show_title && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hero Title</label>
                <textarea
                  rows={2}
                  value={settings.hero.title}
                  onChange={(e) => setSettings({ ...settings, hero: { ...settings.hero, title: e.target.value } })}
                  placeholder="e.g. Refining the Art of Lifestyle"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">Use new lines to control line breaks on the home page.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Upload New Hero Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setHeroImageFile(file);
                    setHeroPreview(URL.createObjectURL(file));
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {(heroPreview || settings.hero.image_url) && (
              <div>
                <p className="text-sm text-gray-500 mb-2">Current Image Preview:</p>
                <img
                  src={heroPreview || settings.hero.image_url}
                  alt="Hero Preview"
                  className="h-48 object-cover rounded-lg border border-gray-200 dark:border-gray-700 w-full max-w-2xl"
                />
              </div>
            )}
          </div>
        </section>

        {/* Collections Section */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Featured Collections</h2>
            <button
              onClick={addCollection}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Collection
            </button>
          </div>
          
          <div className="space-y-3">
            {settings.collections.length === 0 && (
              <p className="text-gray-500 italic text-sm">No collections selected. The homepage will not show the collections section.</p>
            )}
            {settings.collections.map((col, idx) => (
              <div key={idx} className="flex gap-4 items-start p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div className="flex flex-col gap-1 mt-1">
                  <button onClick={() => moveCollection(idx, 'up')} disabled={idx === 0} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveCollection(idx, 'down')} disabled={idx === settings.collections.length - 1} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Category / Subcategory</label>
                    <select
                      value={col.id}
                      onChange={(e) => {
                        const newCols = [...settings.collections];
                        newCols[idx].id = parseInt(e.target.value);
                        setSettings({ ...settings, collections: newCols });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value={0} disabled>Select a category</option>
                      {flatCategories.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Subtitle</label>
                    <input
                      type="text"
                      value={col.subtitle}
                      onChange={(e) => {
                        const newCols = [...settings.collections];
                        newCols[idx].subtitle = e.target.value;
                        setSettings({ ...settings, collections: newCols });
                      }}
                      placeholder="e.g. Step into the future"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <button onClick={() => removeCollection(idx)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg mt-5 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
