"use client";

import React, { useState, useEffect } from "react";
import settingsService, { HomepageSettings } from "@/services/settingsService";
import categoryService from "@/services/categoryService";
import { Save, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "react-hot-toast";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";

export default function HomepageSettingsPage() {
  const [settings, setSettings] = useState<HomepageSettings | null>(null);
  const [flatCategories, setFlatCategories] = useState<{ id: number; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroPreview, setHeroPreview] = useState("");
  const [heroChanged, setHeroChanged] = useState(false); // only send hero fields when they changed
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      settings.ticker.phrases.forEach((phrase, i) => {
        formData.append(`ticker[phrases][${i}]`, phrase);
      });

      // Hero — only send hero fields if something in the hero section changed
      if (heroChanged) {
        if (settings.hero.title) {
          formData.append("hero_title", settings.hero.title);
        }
        formData.append("hero_show_title", settings.hero.show_title ? "1" : "0");
        if (heroImageFile) {
          formData.append("hero_image", heroImageFile);
        }
      }

      // Collections
      if (settings.collections.length === 0) {
        formData.append("collections", ""); // Send empty string (null) to clear
      } else {
        settings.collections.forEach((col, index) => {
          formData.append(`collections[${index}][id]`, String(col.id));
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
            showcase.subcategories.forEach((subId, subIndex) => {
              formData.append(`showcase[${index}][subcategories][${subIndex}]`, String(subId));
            });
          });
        }
      }

      await settingsService.updateHomepageSettings(formData);
      toast.success("Homepage settings updated successfully");
      loadData(); // reload to get new image URL (also resets heroChanged)
      setHeroImageFile(null);
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
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
                    
                    {settings.hero.show_title && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hero Title</label>
                        <textarea
                          rows={2}
                          value={settings.hero.title}
                          onChange={(e) => {
                            setSettings({ ...settings, hero: { ...settings.hero, title: e.target.value } });
                            setHeroChanged(true);
                          }}
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
                            setHeroChanged(true);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {(heroPreview || settings.hero.image_url) && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Current Image Preview:</p>
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
                            <label className="block text-xs font-medium text-gray-500 mb-1">Category / Subcategory</label>
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
                                const newCols = settings.collections.map((c, i) =>
                                  i === idx ? { ...c, subtitle: e.target.value } : c
                                );
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
                    {settings.showcase?.map((showcaseItem, idx) => (
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
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
