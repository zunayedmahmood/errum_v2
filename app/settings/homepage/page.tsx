"use client";

import React, { useState, useEffect } from "react";
import settingsService, { HomepageSettings } from "@/services/settingsService";
import categoryService from "@/services/categoryService";
import { Save, Plus, Trash2, ArrowUp, ArrowDown, Search, X } from "lucide-react";
import { toast } from "react-hot-toast";
import catalogService from "@/services/catalogService";
import collectionService from "@/services/collectionService";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";

export default function HomepageSettingsPage() {
  const [settings, setSettings] = useState<HomepageSettings | null>(null);
  const [flatCategories, setFlatCategories] = useState<{ id: number; title: string }[]>([]);
  const [availableCollections, setAvailableCollections] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroImages, setHeroImages] = useState<{
    type: 'existing' | 'new';
    url?: string;
    path?: string;
    file?: File;
    preview?: string;
  }[]>([]);
  const [heroChanged, setHeroChanged] = useState(false);
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // New Arrivals Search State
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProductsData, setSelectedProductsData] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsData, categoryTree, collectionsData] = await Promise.all([
        settingsService.getAdminHomepageSettings(),
        categoryService.getTree(true),
        collectionService.getAll({ per_page: 100 })
      ]);

      // Normalize settings to prevent "length of undefined" errors
      const normalized: HomepageSettings = {
        ...settingsData,
        ticker: {
          enabled: settingsData.ticker?.enabled ?? true,
          mode: settingsData.ticker?.mode ?? 'moving',
          phrases: settingsData.ticker?.phrases || [],
          background_color: settingsData.ticker?.background_color ?? '#111111',
          text_color: settingsData.ticker?.text_color ?? '#ffffff',
          speed: settingsData.ticker?.speed ?? 40
        },
        hero: {
          images: settingsData.hero?.images || [],
          title: settingsData.hero?.title || "",
          show_title: settingsData.hero?.show_title ?? true,
          slideshow_enabled: settingsData.hero?.slideshow_enabled ?? true,
          autoplay_speed: settingsData.hero?.autoplay_speed ?? 5000,
          text_position: settingsData.hero?.text_position || 'center',
          text_color: settingsData.hero?.text_color || '#ffffff',
          font_size: settingsData.hero?.font_size || 84,
          transition_type: settingsData.hero?.transition_type || 'fade',
        },
        collections: settingsData.collections || [],
        showcase: (settingsData.showcase || []).map((item: any) => ({
          ...item,
          subcategories: item.subcategories || []
        })),
        new_arrivals: {
          enabled: settingsData.new_arrivals?.enabled ?? false,
          product_ids: (settingsData.new_arrivals?.product_ids || []).map((id: any) => Number(id))
        }
      };

      if (settingsData.new_arrivals?.products) {
        setSelectedProductsData(settingsData.new_arrivals.products);
      } else if (normalized.new_arrivals?.product_ids.length > 0) {
        // Fallback: fetch products if backend didn't hydrate them
        catalogService.getProducts({ 
          product_ids: normalized.new_arrivals.product_ids 
        } as any).then(res => {
          if (res.products) setSelectedProductsData(res.products);
        });
      }

      setSettings(normalized);
      setHeroImages((normalized.hero.images || []).map(img => ({ type: 'existing', url: img.url, path: img.path })));
      setHeroChanged(false); // reset dirty flag on fresh load
      
      const flatten = (cats: typeof categoryTree, path = ""): { id: number; title: string }[] => {
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
      setAvailableCollections(Array.isArray(collectionsData.data) ? collectionsData.data : []);
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

      // Ticker — serialize phrases array
      formData.append("ticker[enabled]", settings.ticker.enabled ? "1" : "0");
      formData.append("ticker[mode]", settings.ticker.mode || "moving");
      formData.append("ticker[background_color]", settings.ticker.background_color || "#111111");
      formData.append("ticker[text_color]", settings.ticker.text_color || "#ffffff");
      formData.append("ticker[speed]", String(settings.ticker.speed || 40));
      (settings.ticker.phrases || []).forEach((phrase, i) => {
        formData.append(`ticker[phrases][${i}]`, phrase);
      });

      // Hero — only send hero fields if something in the hero section changed
      if (heroChanged) {
        formData.append("hero_title", settings.hero.title || "");
        formData.append("hero_show_title", settings.hero.show_title ? "1" : "0");
        formData.append("hero_slideshow_enabled", settings.hero.slideshow_enabled ? "1" : "0");
        formData.append("hero_autoplay_speed", String(settings.hero.autoplay_speed || 5000));
        formData.append("hero_text_position", settings.hero.text_position || "center");
        formData.append("hero_text_color", settings.hero.text_color || "#ffffff");
        formData.append("hero_font_size", String(settings.hero.font_size || 84));
        formData.append("hero_transition_type", settings.hero.transition_type || "fade");
        
        const meta: any[] = [];
        let fileIndex = 0;
        
        heroImages.forEach((img) => {
          if (img.type === 'existing') {
            meta.push({ type: 'existing', url: img.url, path: img.path });
          } else if (img.type === 'new' && img.file) {
            meta.push({ type: 'new', fileIndex });
            formData.append(`hero_images[${fileIndex}]`, img.file);
            fileIndex++;
          }
        });
        
        formData.append("hero_images_meta", JSON.stringify(meta));
      }

      // Collections
      if (!settings.collections || settings.collections.length === 0) {
        formData.append("collections", ""); // Send empty string (null) to clear
      } else {
        settings.collections.forEach((col, index) => {
          formData.append(`collections[${index}][id]`, String(col.id));
          formData.append(`collections[${index}][type]`, col.type || "category");
          formData.append(`collections[${index}][title]`, col.title || "");
          formData.append(`collections[${index}][subtitle]`, col.subtitle || "");
        });
      }

      // Showcase
      if (settings.showcase) {
        if (settings.showcase.length === 0) {
          formData.append("showcase", ""); // Clear
        } else {
          settings.showcase.forEach((showcase, index) => {
            formData.append(`showcase[${index}][category_id]`, String(showcase.category_id));
            (showcase.subcategories || []).forEach((subId, subIndex) => {
              formData.append(`showcase[${index}][subcategories][${subIndex}]`, String(subId));
            });
          });
        }
      }

      // New Arrivals
      if (settings.new_arrivals) {
        formData.append("new_arrivals[enabled]", settings.new_arrivals.enabled ? "1" : "0");
        if (settings.new_arrivals.product_ids.length === 0) {
          formData.append("new_arrivals[product_ids]", "");
        } else {
          settings.new_arrivals.product_ids.forEach((id, index) => {
            formData.append(`new_arrivals[product_ids][${index}]`, String(id));
          });
        }
      }

      await settingsService.updateHomepageSettings(formData);
      toast.success("Homepage settings updated successfully");
      loadData(); // reload to get new image URL (also resets heroChanged)
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Helpers for Hero Images
  const handleAddHeroImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newImgs = [...heroImages];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newImgs.push({
        type: 'new',
        file,
        preview: URL.createObjectURL(file)
      });
    }
    setHeroImages(newImgs);
    setHeroChanged(true);
    e.target.value = ''; // reset input
  };

  const removeHeroImage = (index: number) => {
    const newImgs = [...heroImages];
    newImgs.splice(index, 1);
    setHeroImages(newImgs);
    setHeroChanged(true);
  };

  const moveHeroImage = (index: number, direction: 'up' | 'down') => {
    const newImgs = [...heroImages];
    if (direction === 'up' && index > 0) {
      [newImgs[index - 1], newImgs[index]] = [newImgs[index], newImgs[index - 1]];
    } else if (direction === 'down' && index < newImgs.length - 1) {
      [newImgs[index + 1], newImgs[index]] = [newImgs[index], newImgs[index + 1]];
    }
    setHeroImages(newImgs);
    setHeroChanged(true);
  };

  // Helpers for ticker phrases
  const addPhrase = () => {
    if (!settings) return;
    setSettings({ ...settings, ticker: { ...settings.ticker, phrases: [...settings.ticker.phrases, ""] } });
  };

  const updatePhrase = (index: number, value: string) => {
    if (!settings) return;
    const newPhrases = settings.ticker.phrases.map((p, i) => (i === index ? value : p));
    setSettings({ ...settings, ticker: { ...settings.ticker, phrases: newPhrases } });
  };

  const removePhrase = (index: number) => {
    if (!settings) return;
    const newPhrases = settings.ticker.phrases.filter((_, i) => i !== index);
    setSettings({ ...settings, ticker: { ...settings.ticker, phrases: newPhrases } });
  };

  // Helpers for showcase
  const addShowcase = () => {
    if (!settings) return;
    setSettings({
      ...settings,
      showcase: [...(settings.showcase || []), { category_id: flatCategories[0]?.id || 0, subcategories: [] }]
    });
  };

  const removeShowcase = (index: number) => {
    if (!settings) return;
    const newShowcase = [...(settings.showcase || [])];
    newShowcase.splice(index, 1);
    setSettings({ ...settings, showcase: newShowcase });
  };

  const moveShowcase = (index: number, direction: 'up' | 'down') => {
    if (!settings) return;
    const newShowcase = [...(settings.showcase || [])];
    if (direction === 'up' && index > 0) {
      [newShowcase[index - 1], newShowcase[index]] = [newShowcase[index], newShowcase[index - 1]];
    } else if (direction === 'down' && index < newShowcase.length - 1) {
      [newShowcase[index + 1], newShowcase[index]] = [newShowcase[index], newShowcase[index + 1]];
    }
    setSettings({ ...settings, showcase: newShowcase });
  };

  const addSubcategoryToShowcase = (showcaseIndex: number) => {
    if (!settings) return;
    const newShowcase = [...(settings.showcase || [])];
    newShowcase[showcaseIndex].subcategories.push(flatCategories[0]?.id || 0);
    setSettings({ ...settings, showcase: newShowcase });
  };

  const updateSubcategoryInShowcase = (showcaseIndex: number, subIndex: number, newId: number) => {
    if (!settings) return;
    const newShowcase = [...(settings.showcase || [])];
    newShowcase[showcaseIndex].subcategories[subIndex] = newId;
    setSettings({ ...settings, showcase: newShowcase });
  };

  const removeSubcategoryFromShowcase = (showcaseIndex: number, subIndex: number) => {
    if (!settings) return;
    const newShowcase = [...(settings.showcase || [])];
    newShowcase[showcaseIndex].subcategories.splice(subIndex, 1);
    setSettings({ ...settings, showcase: newShowcase });
  };

  const moveSubcategoryInShowcase = (showcaseIndex: number, subIndex: number, direction: 'up' | 'down') => {
    if (!settings) return;
    const newShowcase = [...(settings.showcase || [])];
    const subs = newShowcase[showcaseIndex].subcategories;
    if (direction === 'up' && subIndex > 0) {
      [subs[subIndex - 1], subs[subIndex]] = [subs[subIndex], subs[subIndex - 1]];
    } else if (direction === 'down' && subIndex < subs.length - 1) {
      [subs[subIndex + 1], subs[subIndex]] = [subs[subIndex], subs[subIndex + 1]];
    }
    setSettings({ ...settings, showcase: newShowcase });
  };

  const addCollection = () => {
    if (!settings) return;
    setSettings({
      ...settings,
      collections: [...settings.collections, { id: flatCategories[0]?.id || 0, type: "category", title: "", subtitle: "" }]
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

  // Helpers for New Arrivals
  const searchProducts = async (q: string) => {
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const response = await catalogService.getProducts({
        search: q,
        group_by_sku: true,
        per_page: 30 // increased for better selection
      });
      
      const displayProducts = response.grouped_products?.length
        ? response.grouped_products.map(gp => gp.main_variant)
        : response.products;

      setSearchResults(displayProducts || []);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleProductSelection = (product: any) => {
    if (!settings || !settings.new_arrivals) return;
    
    const currentIds = [...settings.new_arrivals.product_ids];
    const currentData = [...selectedProductsData];
    const exists = currentIds.findIndex(id => Number(id) === Number(product.id));
    
    if (exists !== -1) {
      currentIds.splice(exists, 1);
      const dataIdx = currentData.findIndex(p => Number(p.id) === Number(product.id));
      if (dataIdx !== -1) currentData.splice(dataIdx, 1);
    } else {
      if (currentIds.length >= 12) {
        toast.error("You can select up to 12 products for New Arrivals");
        return;
      }
      currentIds.push(product.id);
      currentData.push(product);
    }
    
    setSelectedProductsData(currentData);
    setSettings({
      ...settings,
      new_arrivals: {
        ...settings.new_arrivals,
        product_ids: currentIds
      }
    });
  };

  const removeSelectedProduct = (id: number) => {
    if (!settings || !settings.new_arrivals) return;
    const currentIds = settings.new_arrivals.product_ids.filter(pid => Number(pid) !== Number(id));
    setSelectedProductsData(prev => prev.filter(p => Number(p.id) !== Number(id)));
    setSettings({
      ...settings,
      new_arrivals: {
        ...settings.new_arrivals,
        product_ids: currentIds
      }
    });
  };

  if (loading) return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <div className="p-8 dark:text-white">Loading settings...</div>
        </div>
      </div>
    </div>
  );

  if (!settings) return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <div className="p-8 dark:text-white text-red-500">Error loading settings</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto pb-20">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Homepage Configuration</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Manage the content displayed on the e-commerce homepage.</p>
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
                    <div className="flex flex-wrap items-center gap-6">
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
                        <>
                          <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ticker Mode:</label>
                            <select
                              value={settings.ticker.mode || 'moving'}
                              onChange={(e) => setSettings({ ...settings, ticker: { ...settings.ticker, mode: e.target.value as 'static' | 'moving' } })}
                              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="moving">Moving / Scrolling</option>
                              <option value="static">Static / Centered</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">BG Color:</label>
                              <input
                                type="color"
                                value={settings.ticker.background_color}
                                onChange={(e) => setSettings({ ...settings, ticker: { ...settings.ticker, background_color: e.target.value } })}
                                className="w-8 h-8 rounded cursor-pointer border-none bg-transparent"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Text Color:</label>
                              <input
                                type="color"
                                value={settings.ticker.text_color}
                                onChange={(e) => setSettings({ ...settings, ticker: { ...settings.ticker, text_color: e.target.value } })}
                                className="w-8 h-8 rounded cursor-pointer border-none bg-transparent"
                              />
                            </div>
                            {settings.ticker.mode === 'moving' && (
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Speed:</label>
                                <input
                                  type="range"
                                  min="5"
                                  max="150"
                                  step="5"
                                  value={settings.ticker.speed}
                                  onChange={(e) => setSettings({ ...settings, ticker: { ...settings.ticker, speed: parseInt(e.target.value) } })}
                                  className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                />
                                <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{settings.ticker.speed}s</span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    {settings.ticker.enabled && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ticker Phrases</label>
                          <button
                            onClick={addPhrase}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium"
                          >
                            <Plus className="w-3 h-3" /> Add Phrase
                          </button>
                        </div>
                        {settings.ticker.phrases.length === 0 && (
                          <p className="text-gray-400 italic text-xs">No phrases. Add at least one.</p>
                        )}
                        {settings.ticker.phrases.map((phrase, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              type="text"
                              value={phrase}
                              onChange={(e) => updatePhrase(i, e.target.value)}
                              placeholder={`Phrase ${i + 1}, e.g. FREE SHIPPING ON ORDERS OVER ৳2000`}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <button
                              onClick={() => removePhrase(i)}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Remove phrase"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                {/* Hero Section */}
                <section className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Hero Section</h2>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="heroShowTitle"
                            checked={settings.hero.show_title}
                            onChange={(e) => {
                              setSettings({ ...settings, hero: { ...settings.hero, show_title: e.target.checked } });
                              setHeroChanged(true);
                            }}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="heroShowTitle" className="text-sm font-medium text-gray-900 dark:text-white">
                            Show Hero Text
                          </label>
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="heroSlideshowEnabled"
                            checked={settings.hero.slideshow_enabled}
                            onChange={(e) => {
                              setSettings({ ...settings, hero: { ...settings.hero, slideshow_enabled: e.target.checked } });
                              setHeroChanged(true);
                            }}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="heroSlideshowEnabled" className="text-sm font-medium text-gray-900 dark:text-white">
                            Enable Slideshow (Autoplay)
                          </label>
                        </div>

                        {settings.hero.slideshow_enabled && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Autoplay Speed (ms)</label>
                            <input
                              type="number"
                              min={1000}
                              max={30000}
                              step={500}
                              value={settings.hero.autoplay_speed}
                              onChange={(e) => {
                                setSettings({ ...settings, hero: { ...settings.hero, autoplay_speed: parseInt(e.target.value) || 5000 } });
                                setHeroChanged(true);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        {settings.hero.show_title && (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hero Title</label>
                              <textarea
                                rows={3}
                                value={settings.hero.title}
                                onChange={(e) => {
                                  setSettings({ ...settings, hero: { ...settings.hero, title: e.target.value } });
                                  setHeroChanged(true);
                                }}
                                placeholder="e.g. Refining the Art of Lifestyle"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                              <p className="mt-1 text-[10px] text-gray-400">Use new lines to control line breaks on the home page.</p>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text Position (Desktop)</label>
                              <select
                                value={settings.hero.text_position || 'center'}
                                onChange={(e) => {
                                  setSettings({ ...settings, hero: { ...settings.hero, text_position: e.target.value } });
                                  setHeroChanged(true);
                                }}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="center">Center (Default)</option>
                                <option value="top-left">Top Left</option>
                                <option value="top-right">Top Right</option>
                                <option value="bottom-left">Bottom Left</option>
                                <option value="bottom-right">Bottom Right</option>
                              </select>
                              <p className="mt-1 text-[10px] text-gray-400">Position applies to desktop view only. Mobile always uses center center.</p>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Transition Effect</label>
                              <select
                                value={settings.hero.transition_type || 'fade'}
                                onChange={(e) => {
                                  setSettings({ ...settings, hero: { ...settings.hero, transition_type: e.target.value as 'fade' | 'slide' } });
                                  setHeroChanged(true);
                                }}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="fade">Fade In (Current)</option>
                                <option value="slide">Slide In (Right to Left)</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text Color</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={settings.hero.text_color || '#ffffff'}
                                    onChange={(e) => {
                                      setSettings({ ...settings, hero: { ...settings.hero, text_color: e.target.value } });
                                      setHeroChanged(true);
                                    }}
                                    className="w-10 h-10 p-1 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-white dark:bg-gray-900"
                                  />
                                  <input
                                    type="text"
                                    value={settings.hero.text_color || '#ffffff'}
                                    onChange={(e) => {
                                      setSettings({ ...settings, hero: { ...settings.hero, text_color: e.target.value } });
                                      setHeroChanged(true);
                                    }}
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Font Size</label>
                                <input
                                  type="number"
                                  min={20}
                                  value={settings.hero.font_size || 84}
                                  onChange={(e) => {
                                    setSettings({ ...settings, hero: { ...settings.hero, font_size: parseInt(e.target.value) || 84 } });
                                    setHeroChanged(true);
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                                <p className="mt-1 text-[10px] text-gray-400">Desktop font size. Scaled responsively.</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hero Images (Slider)</label>
                        <label className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium cursor-pointer">
                          <Plus className="w-3 h-3" /> Add Image
                          <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddHeroImage} />
                        </label>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {heroImages.map((img, idx) => (
                          <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 aspect-video bg-gray-100 dark:bg-gray-900">
                            <img
                              src={img.preview || img.url}
                              alt={`Hero ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                onClick={() => moveHeroImage(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1.5 bg-white/20 hover:bg-white/40 rounded text-white disabled:opacity-20"
                                title="Move up"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => moveHeroImage(idx, 'down')}
                                disabled={idx === heroImages.length - 1}
                                className="p-1.5 bg-white/20 hover:bg-white/40 rounded text-white disabled:opacity-20"
                                title="Move down"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => removeHeroImage(idx)}
                                className="p-1.5 bg-red-500/80 hover:bg-red-500 rounded text-white"
                                title="Remove image"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white font-bold uppercase tracking-wider">
                              {idx + 1}
                            </div>
                          </div>
                        ))}
                        {heroImages.length === 0 && (
                          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg aspect-video">
                            <p className="text-sm text-gray-500 italic">No images.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Collections Section */}
                <section className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Featured Collections</h2>
                    <button
                      onClick={addCollection}
                      disabled={flatCategories.length === 0}
                      title={flatCategories.length === 0 ? "Loading categories..." : "Add a collection tile"}
                      className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      Add Collection
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {settings.collections.length === 0 && (
                      <p className="text-gray-500 dark:text-gray-400 italic text-sm">No collections selected. The homepage will not show the collections section.</p>
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
                            <label className="block text-xs font-medium text-gray-500 mb-1">Entity Type</label>
                            <select
                              value={col.type || 'category'}
                              onChange={(e) => {
                                const type = e.target.value as 'category' | 'collection';
                                const newCols = settings.collections.map((c, i) =>
                                  i === idx ? { ...c, type, id: type === 'category' ? (flatCategories[0]?.id || 0) : (availableCollections[0]?.id || 0) } : c
                                );
                                setSettings({ ...settings, collections: newCols });
                              }}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                              <option value="category">Category</option>
                              <option value="collection">Collection</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Target Item</label>
                            <select
                              value={col.id}
                              onChange={(e) => {
                                const newCols = settings.collections.map((c, i) =>
                                  i === idx ? { ...c, id: parseInt(e.target.value) } : c
                                );
                                setSettings({ ...settings, collections: newCols });
                              }}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                              {col.type === 'collection' ? (
                                <>
                                  <option value={0} disabled>Select a collection</option>
                                  {availableCollections.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </>
                              ) : (
                                <>
                                  <option value={0} disabled>Select a category</option>
                                  {flatCategories.map(c => (
                                    <option key={c.id} value={c.id}>{c.title}</option>
                                  ))}
                                </>
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Override Title (Optional)</label>
                            <input
                              type="text"
                              value={col.title}
                              onChange={(e) => {
                                const newCols = settings.collections.map((c, i) =>
                                  i === idx ? { ...c, title: e.target.value } : c
                                );
                                setSettings({ ...settings, collections: newCols });
                              }}
                              placeholder="Leave blank to use item name"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Subtitle</label>
                            <input
                              type="text"
                              value={col.subtitle}
                              onChange={(e) => {
                                const newCols = settings.collections.map((c, i) =>
                                  i === idx ? { ...c, subtitle: e.target.value } : c
                                );
                                setSettings({ ...settings, collections: newCols });
                              }}
                              placeholder="e.g. View Collection"
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

                {/* Showcase Section */}
                <section className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mt-8">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Homepage Showcase (Categories)</h2>
                    <button
                      onClick={addShowcase}
                      disabled={flatCategories.length === 0}
                      title={flatCategories.length === 0 ? "Loading categories..." : "Add a showcase section"}
                      className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      Add Section
                    </button>
                  </div>

                  <div className="space-y-6">
                    {(!settings.showcase || settings.showcase.length === 0) && (
                      <p className="text-gray-500 dark:text-gray-400 italic text-sm">No showcase sections defined. The homepage will default to showing all top-level categories if this is unconfigured.</p>
                    )}
                    {settings.showcase?.map((showcaseItem, idx) => {
                      return (
                        <div key={idx} className="flex gap-4 items-start p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                          <div className="flex flex-col gap-1 mt-1">
                            <button onClick={() => moveShowcase(idx, 'up')} disabled={idx === 0} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30">
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button onClick={() => moveShowcase(idx, 'down')} disabled={idx === settings.showcase!.length - 1} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30">
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="flex-1 space-y-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Main Category (Section Title)</label>
                              <select
                                value={showcaseItem.category_id}
                                onChange={(e) => {
                                  const newShowcase = [...settings.showcase!];
                                  newShowcase[idx].category_id = parseInt(e.target.value);
                                  setSettings({ ...settings, showcase: newShowcase });
                                }}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                              >
                                <option value={0} disabled>Select a category</option>
                                {flatCategories.map(c => (
                                  <option key={c.id} value={c.id}>{c.title}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                              <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-medium text-gray-500">Subcategories (Tabs)</label>
                                <button onClick={() => addSubcategoryToShowcase(idx)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Tab
                                </button>
                              </div>
                              
                              <div className="space-y-2">
                                {showcaseItem.subcategories.length === 0 && (
                                  <p className="text-xs text-gray-400 italic">No explicit subcategories selected. The storefront will automatically display the parent category's children.</p>
                                )}
                                {showcaseItem.subcategories.map((subId, subIdx) => (
                                  <div key={subIdx} className="flex items-center gap-2">
                                    <div className="flex flex-col gap-0">
                                      <button onClick={() => moveSubcategoryInShowcase(idx, subIdx, 'up')} disabled={subIdx === 0} className="text-gray-400 hover:text-blue-600 disabled:opacity-30">
                                        <ArrowUp className="w-3 h-3" />
                                      </button>
                                      <button onClick={() => moveSubcategoryInShowcase(idx, subIdx, 'down')} disabled={subIdx === showcaseItem.subcategories.length - 1} className="text-gray-400 hover:text-blue-600 disabled:opacity-30">
                                        <ArrowDown className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <select
                                      value={subId}
                                      onChange={(e) => updateSubcategoryInShowcase(idx, subIdx, parseInt(e.target.value))}
                                      className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
                                    >
                                      <option value={0} disabled>Select subcategory</option>
                                      {flatCategories.map(c => (
                                        <option key={c.id} value={c.id}>{c.title}</option>
                                      ))}
                                    </select>
                                    <button onClick={() => removeSubcategoryFromShowcase(idx, subIdx)} className="text-red-400 hover:text-red-600 p-1">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <button onClick={() => removeShowcase(idx)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* New Arrivals Section */}
                <section className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mt-8">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Arrivals Section</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">If enabled, you can manually select up to 12 products. Otherwise, it will show the latest products.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="newArrivalsEnabled"
                        checked={settings.new_arrivals?.enabled}
                        onChange={(e) => setSettings({ 
                          ...settings, 
                          new_arrivals: { 
                            enabled: e.target.checked, 
                            product_ids: settings.new_arrivals?.product_ids || [] 
                          } 
                        })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="newArrivalsEnabled" className="text-sm font-medium text-gray-900 dark:text-white">
                        Use Custom Selection
                      </label>
                    </div>
                  </div>

                  {settings.new_arrivals?.enabled && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      {/* Search Input */}
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          value={productSearchQuery}
                          onChange={(e) => {
                            setProductSearchQuery(e.target.value);
                            searchProducts(e.target.value);
                          }}
                          placeholder="Search products by name, SKU or ID..."
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm transition-all"
                        />
                        {isSearching && (
                          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                          </div>
                        )}
                      </div>

                      {/* Search Results Dropdown-like */}
                      {searchResults.length > 0 && (
                        <div className="mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-10 max-h-60 overflow-y-auto">
                          {searchResults.map((product) => {
                            const isSelected = settings.new_arrivals?.product_ids.includes(product.id);
                            return (
                              <div
                                key={product.id}
                                onClick={() => toggleProductSelection(product)}
                                className={`flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                              >
                                <div className="flex items-center gap-3">
                                  {product.images?.[0] ? (
                                    <img src={product.images[0].url} alt="" className="w-10 h-10 object-cover rounded border border-gray-200 dark:border-gray-600" />
                                  ) : (
                                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-[10px] text-gray-400">No Image</div>
                                  )}
                                  <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{product.base_name || product.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">SKU: {product.sku} • Price: ৳{product.selling_price}</p>
                                  </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                  {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Selected Products Grid */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Selected Products ({settings.new_arrivals.product_ids.length}/12)
                          </label>
                          {settings.new_arrivals.product_ids.length > 0 && (
                            <button 
                              onClick={() => setSettings({...settings, new_arrivals: { ...settings.new_arrivals!, product_ids: [] }})}
                              className="text-xs text-red-500 hover:underline"
                            >
                              Clear All
                            </button>
                          )}
                        </div>
                        
                        {settings.new_arrivals.product_ids.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/20">
                            <p className="text-sm text-gray-400">No products selected. Search and select products above.</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {settings.new_arrivals.product_ids.map((productId, idx) => {
                              const product = selectedProductsData.find(p => Number(p.id) === Number(productId)) || searchResults.find(p => Number(p.id) === Number(productId));
                              return (
                                <div key={productId} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <span className="text-xs font-bold text-gray-400 w-4">{idx + 1}</span>
                                    {product?.images?.[0] && (
                                      <img src={product.images[0].url} alt="" className="w-8 h-8 object-cover rounded border border-gray-100 dark:border-gray-700" />
                                    )}
                                    <p className="text-xs font-medium text-gray-900 dark:text-white line-clamp-2 leading-relaxed">
                                      {product ? (product.base_name || product.name) : "Loading..."}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => removeSelectedProduct(productId)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
