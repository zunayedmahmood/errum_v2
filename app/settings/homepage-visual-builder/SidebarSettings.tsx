"use client";

import React from "react";
import { 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  X, 
  Type, 
  Image as ImageIcon, 
  Layout, 
  Eye,
  Sliders,
  Palette
} from "lucide-react";
import { HomepageSettings } from "@/services/settingsService";

interface SidebarSettingsProps {
  settings: HomepageSettings;
  setSettings: (settings: HomepageSettings) => void;
  activeSection: string;
  flatCategories: { id: number; title: string }[];
  availableCollections: { id: number; name: string }[];
  heroImages: any[];
  setHeroImages: (imgs: any[]) => void;
  setHeroChanged: (changed: boolean) => void;
  selectedProductsData: any[];
  setSelectedProductsData: (data: any[]) => void;
  searchProducts: (q: string) => void;
  isSearching: boolean;
  searchResults: any[];
  productSearchQuery: string;
  setProductSearchQuery: (q: string) => void;
}

export default function SidebarSettings({
  settings,
  setSettings,
  activeSection,
  flatCategories,
  availableCollections,
  heroImages,
  setHeroImages,
  setHeroChanged,
  selectedProductsData,
  setSelectedProductsData,
  searchProducts,
  isSearching,
  searchResults,
  productSearchQuery,
  setProductSearchQuery,
}: SidebarSettingsProps) {

  // --- HERO HELPERS ---
  const handleAddHeroImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newImgs = [...heroImages];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newImgs.push({ type: 'new', file, preview: URL.createObjectURL(file) });
    }
    setHeroImages(newImgs);
    setHeroChanged(true);
  };

  const removeHeroImage = (idx: number) => {
    const newImgs = [...heroImages];
    newImgs.splice(idx, 1);
    setHeroImages(newImgs);
    setHeroChanged(true);
  };

  const moveHeroImage = (idx: number, dir: 'up' | 'down') => {
    const newImgs = [...heroImages];
    if (dir === 'up' && idx > 0) [newImgs[idx - 1], newImgs[idx]] = [newImgs[idx], newImgs[idx - 1]];
    else if (dir === 'down' && idx < newImgs.length - 1) [newImgs[idx + 1], newImgs[idx]] = [newImgs[idx], newImgs[idx + 1]];
    setHeroImages(newImgs);
    setHeroChanged(true);
  };

  // --- TICKER HELPERS ---
  const addPhrase = () => setSettings({ ...settings, ticker: { ...settings.ticker, phrases: [...settings.ticker.phrases, ""] } });
  const updatePhrase = (idx: number, val: string) => {
    const newPhrases = settings.ticker.phrases.map((p, i) => (i === idx ? val : p));
    setSettings({ ...settings, ticker: { ...settings.ticker, phrases: newPhrases } });
  };
  const removePhrase = (idx: number) => setSettings({ ...settings, ticker: { ...settings.ticker, phrases: settings.ticker.phrases.filter((_, i) => i !== idx) } });

  // --- COLLECTIONS HELPERS ---
  const addCollection = () => setSettings({ ...settings, collections: [...settings.collections, { id: flatCategories[0]?.id || 0, type: "category", title: "", subtitle: "", show_text: true }] });
  const removeCollection = (idx: number) => setSettings({ ...settings, collections: settings.collections.filter((_, i) => i !== idx) });
  const moveCollection = (idx: number, dir: 'up' | 'down') => {
    const newCols = [...settings.collections];
    if (dir === 'up' && idx > 0) [newCols[idx - 1], newCols[idx]] = [newCols[idx], newCols[idx - 1]];
    else if (dir === 'down' && idx < newCols.length - 1) [newCols[idx + 1], newCols[idx]] = [newCols[idx], newCols[idx + 1]];
    setSettings({ ...settings, collections: newCols });
  };

  // --- BANNERED HELPERS ---
  const updateBanneredCollection = (idx: number, updates: any) => {
    const newBannered = (settings.bannered_collections || []).map((col, i) => i === idx ? { ...col, ...updates } : col);
    setSettings({ ...settings, bannered_collections: newBannered });
  };
  const addBanneredCollection = () => {
    if ((settings.bannered_collections || []).length >= 3) return;
    setSettings({ ...settings, bannered_collections: [...(settings.bannered_collections || []), { id: flatCategories[0]?.id || 0, type: "category", title: "", subtitle: "", show_text: true }] });
  };
  const removeBanneredCollection = (idx: number) => setSettings({ ...settings, bannered_collections: (settings.bannered_collections || []).filter((_, i) => i !== idx) });
  const handleBanneredImageUpload = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateBanneredCollection(idx, { new_image_file: file, new_image_preview: URL.createObjectURL(file) });
  };

  // --- SHOWCASE HELPERS ---
  const addShowcase = () => setSettings({ ...settings, showcase: [...(settings.showcase || []), { category_id: flatCategories[0]?.id || 0, subcategories: [] }] });
  const removeShowcase = (idx: number) => setSettings({ ...settings, showcase: (settings.showcase || []).filter((_, i) => i !== idx) });
  const addSubcategoryToShowcase = (sIdx: number) => {
    const newShowcase = [...(settings.showcase || [])];
    newShowcase[sIdx].subcategories.push(flatCategories[0]?.id || 0);
    setSettings({ ...settings, showcase: newShowcase });
  };
  const updateSubcategoryInShowcase = (sIdx: number, subIdx: number, newId: number) => {
    const newShowcase = [...(settings.showcase || [])];
    newShowcase[sIdx].subcategories[subIdx] = newId;
    setSettings({ ...settings, showcase: newShowcase });
  };
  const removeSubcategoryFromShowcase = (sIdx: number, subIdx: number) => {
    const newShowcase = [...(settings.showcase || [])];
    newShowcase[sIdx].subcategories.splice(subIdx, 1);
    setSettings({ ...settings, showcase: newShowcase });
  };

  // --- NEW ARRIVALS HELPERS ---
  const toggleProductSelection = (product: any) => {
    const currentIds = [...(settings.new_arrivals?.product_ids || [])];
    const currentData = [...selectedProductsData];
    const exists = currentIds.findIndex(id => Number(id) === Number(product.id));
    if (exists !== -1) {
      currentIds.splice(exists, 1);
      const dataIdx = currentData.findIndex(p => Number(p.id) === Number(product.id));
      if (dataIdx !== -1) currentData.splice(dataIdx, 1);
    } else {
      if (currentIds.length >= 12) return;
      currentIds.push(product.id);
      currentData.push(product);
    }
    setSelectedProductsData(currentData);
    setSettings({ ...settings, new_arrivals: { ...settings.new_arrivals!, product_ids: currentIds } });
  };

  const renderTickerSettings = () => (
    <div className="space-y-6">
       <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Ticker</span>
        <input
          type="checkbox"
          checked={settings.ticker.enabled}
          onChange={(e) => setSettings({ ...settings, ticker: { ...settings.ticker, enabled: e.target.checked } })}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
        />
      </div>

      {settings.ticker.enabled && (
        <>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Display Mode</label>
              <select
                value={settings.ticker.mode || 'moving'}
                onChange={(e) => setSettings({ ...settings, ticker: { ...settings.ticker, mode: e.target.value as any } })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="moving">Scrolling Text</option>
                <option value="static">Static Centered</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Background</label>
                <input type="color" value={settings.ticker.background_color} onChange={(e) => setSettings({...settings, ticker: {...settings.ticker, background_color: e.target.value}})} className="w-full h-10 rounded-lg cursor-pointer border-none bg-transparent" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Text Color</label>
                <input type="color" value={settings.ticker.text_color} onChange={(e) => setSettings({...settings, ticker: {...settings.ticker, text_color: e.target.value}})} className="w-full h-10 rounded-lg cursor-pointer border-none bg-transparent" />
              </div>
            </div>

            {settings.ticker.mode === 'moving' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Speed: {settings.ticker.speed}s</label>
                <input type="range" min="5" max="150" value={settings.ticker.speed} onChange={(e) => setSettings({...settings, ticker: {...settings.ticker, speed: parseInt(e.target.value)}})} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Phrases</label>
              <button onClick={addPhrase} className="text-[10px] text-blue-600 font-bold flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" /> ADD</button>
            </div>
            {settings.ticker.phrases.map((phrase, i) => (
              <div key={i} className="flex gap-2 group">
                <input
                  type="text"
                  value={phrase}
                  onChange={(e) => updatePhrase(i, e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
                <button onClick={() => removePhrase(i)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderHeroSettings = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={settings.hero.show_title} onChange={(e) => {setSettings({...settings, hero: {...settings.hero, show_title: e.target.checked}}); setHeroChanged(true);}} className="w-4 h-4 text-blue-600 rounded" />
          Show Hero Text
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={settings.hero.slideshow_enabled} onChange={(e) => {setSettings({...settings, hero: {...settings.hero, slideshow_enabled: e.target.checked}}); setHeroChanged(true);}} className="w-4 h-4 text-blue-600 rounded" />
          Enable Slideshow
        </label>
      </div>

      {settings.hero.show_title && (
        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">TITLE TEXT</label>
            <textarea
              rows={3}
              value={settings.hero.title}
              onChange={(e) => {setSettings({...settings, hero: {...settings.hero, title: e.target.value}}); setHeroChanged(true);}}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">COLOR</label>
              <input type="color" value={settings.hero.text_color} onChange={(e) => {setSettings({...settings, hero: {...settings.hero, text_color: e.target.value}}); setHeroChanged(true);}} className="w-full h-10 rounded-lg cursor-pointer" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">FONT SIZE</label>
              <input type="number" value={settings.hero.font_size} onChange={(e) => {setSettings({...settings, hero: {...settings.hero, font_size: parseInt(e.target.value)}}); setHeroChanged(true);}} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-gray-500 uppercase">Hero Images</label>
          <label className="text-[10px] text-blue-600 font-bold flex items-center gap-1 cursor-pointer hover:underline">
            <Plus className="w-3 h-3" /> ADD
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddHeroImage} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {heroImages.map((img, idx) => (
            <div key={idx} className="relative aspect-video rounded-lg overflow-hidden border group">
              <img src={img.preview || img.url} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                <button onClick={() => moveHeroImage(idx, 'up')} className="p-1 bg-white/20 rounded text-white"><ArrowUp className="w-3 h-3" /></button>
                <button onClick={() => moveHeroImage(idx, 'down')} className="p-1 bg-white/20 rounded text-white"><ArrowDown className="w-3 h-3" /></button>
                <button onClick={() => removeHeroImage(idx)} className="p-1 bg-red-500 rounded text-white"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCollectionsSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase">Tiles</label>
        <button onClick={addCollection} className="text-[10px] text-blue-600 font-bold flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" /> ADD</button>
      </div>
      <div className="space-y-4">
        {settings.collections.map((col, idx) => (
          <div key={idx} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-3">
             <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400">TILE {idx + 1}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => moveCollection(idx, 'up')} className="text-gray-400 hover:text-blue-500"><ArrowUp className="w-3 h-3" /></button>
                <button onClick={() => removeCollection(idx)} className="text-red-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
            <select
              value={col.type}
              onChange={(e) => {
                const type = e.target.value as any;
                const newCols = [...settings.collections];
                newCols[idx] = { ...newCols[idx], type, id: type === 'category' ? (flatCategories[0]?.id || 0) : (availableCollections[0]?.id || 0) };
                setSettings({ ...settings, collections: newCols });
              }}
              className="w-full px-2 py-1.5 text-xs border rounded-md"
            >
              <option value="category">Category</option>
              <option value="collection">Collection</option>
            </select>
            <select
              value={col.id}
              onChange={(e) => {
                const newCols = [...settings.collections];
                newCols[idx].id = parseInt(e.target.value);
                setSettings({ ...settings, collections: newCols });
              }}
              className="w-full px-2 py-1.5 text-xs border rounded-md"
            >
              {col.type === 'category' ? flatCategories.map(c => <option key={c.id} value={c.id}>{c.title}</option>) : availableCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input
              type="text"
              placeholder="Override Title"
              value={col.title}
              onChange={(e) => {
                const newCols = [...settings.collections];
                newCols[idx].title = e.target.value;
                setSettings({ ...settings, collections: newCols });
              }}
              className="w-full px-2 py-1.5 text-xs border rounded-md"
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderNewArrivalsSettings = () => (
    <div className="space-y-6">
       <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Custom Selection</span>
        <input
          type="checkbox"
          checked={settings.new_arrivals?.enabled}
          onChange={(e) => setSettings({ ...settings, new_arrivals: { enabled: e.target.checked, product_ids: settings.new_arrivals?.product_ids || [] } })}
          className="w-4 h-4 text-blue-600 rounded"
        />
      </div>

      {settings.new_arrivals?.enabled && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={productSearchQuery}
              onChange={(e) => {setProductSearchQuery(e.target.value); searchProducts(e.target.value);}}
              placeholder="Search products..."
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg dark:bg-gray-900"
            />
            {isSearching && <div className="absolute right-3 top-2.5 animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />}
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto border rounded-lg bg-white dark:bg-gray-800 divide-y">
              {searchResults.map(p => (
                <div key={p.id} onClick={() => toggleProductSelection(p)} className="p-2 text-xs flex justify-between items-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20">
                  <span className="truncate flex-1">{p.name}</span>
                  {(settings.new_arrivals?.product_ids || []).includes(p.id) && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Selected ({settings.new_arrivals.product_ids.length}/12)</label>
            {settings.new_arrivals.product_ids.map(id => {
              const p = selectedProductsData.find(pd => pd.id === id);
              return (
                <div key={id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs">
                  <span className="truncate mr-2">{p?.name || `ID: ${id}`}</span>
                  <button onClick={() => toggleProductSelection({id})} className="text-red-400"><X className="w-3 h-3" /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderBanneredSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase">Items (Max 3)</label>
        <button onClick={addBanneredCollection} disabled={(settings.bannered_collections || []).length >= 3} className="text-[10px] text-blue-600 font-bold flex items-center gap-1 hover:underline disabled:opacity-30"><Plus className="w-3 h-3" /> ADD</button>
      </div>
      <div className="space-y-4">
        {settings.bannered_collections?.map((col: any, idx) => (
          <div key={idx} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-3">
             <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400">BANNER {idx + 1}</span>
                <button onClick={() => removeBanneredCollection(idx)} className="text-red-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
             </div>
             <select
                value={col.type}
                onChange={(e) => updateBanneredCollection(idx, { type: e.target.value, id: e.target.value === 'category' ? (flatCategories[0]?.id || 0) : (availableCollections[0]?.id || 0) })}
                className="w-full px-2 py-1.5 text-xs border rounded-md"
              >
                <option value="category">Category</option>
                <option value="collection">Collection</option>
              </select>
              <select
                value={col.id}
                onChange={(e) => updateBanneredCollection(idx, { id: parseInt(e.target.value) })}
                className="w-full px-2 py-1.5 text-xs border rounded-md"
              >
                {col.type === 'category' ? flatCategories.map(c => <option key={c.id} value={c.id}>{c.title}</option>) : availableCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="relative aspect-video rounded overflow-hidden border group bg-gray-200 dark:bg-gray-700">
                {(col.new_image_preview || col.override_image?.url) ? (
                  <img src={col.new_image_preview || col.override_image?.url} className="w-full h-full object-cover" />
                ) : (
                   <div className="flex flex-col items-center justify-center h-full text-gray-400"><Plus className="w-4 h-4" /></div>
                )}
                <input type="file" accept="image/*" onChange={(e) => handleBanneredImageUpload(idx, e)} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderShowcaseSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase">Categories</label>
        <button onClick={addShowcase} className="text-[10px] text-blue-600 font-bold flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" /> ADD</button>
      </div>
      <div className="space-y-6">
        {settings.showcase?.map((item, idx) => (
          <div key={idx} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-[10px] font-bold text-gray-400">SECTION {idx + 1}</span>
              <button onClick={() => removeShowcase(idx)} className="text-red-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
            </div>
            <div>
               <label className="block text-[10px] font-bold text-gray-500 mb-1">MAIN CATEGORY</label>
               <select
                  value={item.category_id}
                  onChange={(e) => {
                    const newS = [...settings.showcase!];
                    newS[idx].category_id = parseInt(e.target.value);
                    setSettings({...settings, showcase: newS});
                  }}
                  className="w-full px-2 py-1.5 text-xs border rounded-md"
                >
                  {flatCategories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-500">TABS (Subcategories)</label>
                <button onClick={() => addSubcategoryToShowcase(idx)} className="text-[9px] text-blue-600 font-bold hover:underline"><Plus className="w-2.5 h-2.5 inline" /> ADD</button>
              </div>
              <div className="space-y-2">
                {item.subcategories.map((subId, sIdx) => (
                  <div key={sIdx} className="flex gap-2">
                    <select
                      value={subId}
                      onChange={(e) => updateSubcategoryInShowcase(idx, sIdx, parseInt(e.target.value))}
                      className="flex-1 px-2 py-1 text-[10px] border rounded"
                    >
                      {flatCategories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <button onClick={() => removeSubcategoryFromShowcase(idx, sIdx)} className="text-red-400"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  switch (activeSection) {
    case 'ticker': return renderTickerSettings();
    case 'hero': return renderHeroSettings();
    case 'featured_collections': return renderCollectionsSettings();
    case 'new_arrivals': return renderNewArrivalsSettings();
    case 'bannered_collections': return renderBanneredSettings();
    case 'showcase': return renderShowcaseSettings();
    default: return null;
  }
}
