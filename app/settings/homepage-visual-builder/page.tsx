"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Settings, 
  Menu, 
  Save, 
  Smartphone, 
  Monitor, 
  ChevronRight,
  MousePointer2,
  X,
  Move,
  Sliders,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { toast } from "react-hot-toast";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";
import settingsService, { HomepageSettings } from "@/services/settingsService";
import categoryService from "@/services/categoryService";
import collectionService from "@/services/collectionService";
import catalogService from "@/services/catalogService";

// Import Mimic Components for Visual Builder (Pure components, no context/auth/router)
import MimicHeroSection from './mimic/MimicHeroSection';
import MimicAnnouncementTicker from './mimic/MimicAnnouncementTicker';
import MimicCollectionTiles from './mimic/MimicCollectionTiles';
import MimicNewArrivals from './mimic/MimicNewArrivals';
import MimicSubcategoryProductTabs from './mimic/MimicSubcategoryProductTabs';
import MimicBanneredCollections from './mimic/MimicBanneredCollections';
import { toAbsoluteAssetUrl } from '@/lib/urlUtils';

// Import Sidebar Settings Sub-component
import SidebarSettings from "./SidebarSettings";

// Types
type SectionKey = 'hero' | 'featured_collections' | 'new_arrivals' | 'bannered_collections' | 'showcase' | 'ticker' | 'layout';

const SECTION_NAMES: Record<string, string> = {
  hero: "Hero Slider",
  featured_collections: "Featured Collections",
  new_arrivals: "New Arrivals",
  bannered_collections: "Bannered Collections",
  showcase: "Category Showcase",
  ticker: "Announcement Ticker"
};

export default function HomepageVisualBuilder() {
  const { darkMode } = useTheme();
  
  // Layout State
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const [settingsSidebarOpen, setSettingsSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('desktop');
  
  // Data State
  const [settings, setSettings] = useState<HomepageSettings | null>(null);
  const [previewSettings, setPreviewSettings] = useState<HomepageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Hero Specific
  const [heroImages, setHeroImages] = useState<any[]>([]);
  const [heroChanged, setHeroChanged] = useState(false);
  
  // New Arrivals Specific
  const [selectedProductsData, setSelectedProductsData] = useState<any[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Meta Data
  const [flatCategories, setFlatCategories] = useState<{ id: number; title: string }[]>([]);
  const [availableCollections, setAvailableCollections] = useState<{ id: number; name: string }[]>([]);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsData, categoryTree, collectionsData] = await Promise.all([
        settingsService.getAdminHomepageSettings(),
        categoryService.getTree(true),
        collectionService.getAll({ per_page: 100 })
      ]);

      // Normalize settings
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
        collections: (settingsData.collections || []).map((col: any) => ({
          ...col,
          show_text: col.show_text ?? true
        })),
        showcase: (settingsData.showcase || []).map((item: any) => ({
          ...item,
          subcategories: item.subcategories || []
        })),
        new_arrivals: {
          enabled: settingsData.new_arrivals?.enabled ?? false,
          product_ids: (settingsData.new_arrivals?.product_ids || []).map((id: any) => Number(id))
        },
        bannered_collections: (settingsData.bannered_collections || []).map((col: any) => ({
          ...col,
          show_text: col.show_text ?? true
        })),
        section_order: settingsData.section_order || ['hero', 'featured_collections', 'new_arrivals', 'bannered_collections', 'showcase']
      };

      setSettings(normalized);
      setPreviewSettings(normalized);
      setHeroImages((normalized.hero.images || []).map(img => ({ type: 'existing', url: img.url, path: img.path })));
      setHeroChanged(false);

      if (settingsData.new_arrivals?.products) {
        setSelectedProductsData(settingsData.new_arrivals.products);
      }

      // Flatten categories for selects
      const flatten = (cats: any[], path = ""): { id: number; title: string }[] => {
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Debounce preview update
  useEffect(() => {
    if (!settings) return;
    const timeout = setTimeout(() => {
      setPreviewSettings(settings);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [settings]);

  // Search Logic
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
        per_page: 20
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

  // Handlers
  const toggleAdminSidebar = () => {
    const newState = !adminSidebarOpen;
    setAdminSidebarOpen(newState);
    if (newState) setSettingsSidebarOpen(false);
  };

  const toggleSettingsSidebar = () => {
    setSettingsSidebarOpen(!settingsSidebarOpen);
  };

  const selectSection = (section: SectionKey) => {
    setActiveSection(section);
    setSettingsSidebarOpen(true);
    setAdminSidebarOpen(false);
  };

  const moveSection = (idx: number, direction: 'up' | 'down') => {
    if (!settings || !settings.section_order) return;
    const newOrder = [...settings.section_order];
    if (direction === 'up' && idx > 0) [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    else if (direction === 'down' && idx < newOrder.length - 1) [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
    setSettings({ ...settings, section_order: newOrder });
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      const formData = new FormData();

      // Ticker
      formData.append("ticker[enabled]", settings.ticker.enabled ? "1" : "0");
      formData.append("ticker[mode]", settings.ticker.mode || "moving");
      formData.append("ticker[background_color]", settings.ticker.background_color || "#111111");
      formData.append("ticker[text_color]", settings.ticker.text_color || "#ffffff");
      formData.append("ticker[speed]", String(settings.ticker.speed || 40));
      (settings.ticker.phrases || []).forEach((phrase, i) => formData.append(`ticker[phrases][${i}]`, phrase));

      // Hero
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
          if (img.type === 'existing') meta.push({ type: 'existing', url: img.url, path: img.path });
          else if (img.type === 'new' && img.file) {
            meta.push({ type: 'new', fileIndex });
            formData.append(`hero_images[${fileIndex}]`, img.file);
            fileIndex++;
          }
        });
        formData.append("hero_images_meta", JSON.stringify(meta));
      }

      // Collections
      if (!settings.collections || settings.collections.length === 0) formData.append("collections", "");
      else {
        settings.collections.forEach((col, index) => {
          formData.append(`collections[${index}][id]`, String(col.id));
          formData.append(`collections[${index}][type]`, col.type || "category");
          formData.append(`collections[${index}][title]`, col.title || "");
          formData.append(`collections[${index}][subtitle]`, col.subtitle || "");
          formData.append(`collections[${index}][show_text]`, col.show_text ? "1" : "0");
        });
      }

      // Showcase
      if (settings.showcase && settings.showcase.length > 0) {
        settings.showcase.forEach((showcase, index) => {
          formData.append(`showcase[${index}][category_id]`, String(showcase.category_id));
          (showcase.subcategories || []).forEach((subId, subIndex) => formData.append(`showcase[${index}][subcategories][${subIndex}]`, String(subId)));
        });
      } else formData.append("showcase", "");

      // New Arrivals
      formData.append("new_arrivals[enabled]", settings.new_arrivals?.enabled ? "1" : "0");
      if (settings.new_arrivals?.product_ids.length === 0) formData.append("new_arrivals[product_ids]", "");
      else settings.new_arrivals?.product_ids.forEach((id, index) => formData.append(`new_arrivals[product_ids][${index}]`, String(id)));

      // Bannered Collections
      if (settings.bannered_collections) {
        const banneredMeta: any[] = [];
        let banneredFileIndex = 0;
        settings.bannered_collections.forEach((col: any) => {
          const itemMeta: any = { id: col.id, type: col.type, title: col.title || "", subtitle: col.subtitle || "", show_text: col.show_text ?? true };
          if (col.new_image_file) {
            itemMeta.image_type = 'new';
            itemMeta.fileIndex = banneredFileIndex;
            formData.append(`bannered_collections_images[${banneredFileIndex}]`, col.new_image_file);
            banneredFileIndex++;
          } else if (col.override_image) {
            itemMeta.image_type = 'existing';
            itemMeta.override_image = col.override_image;
          } else itemMeta.image_type = 'none';
          banneredMeta.push(itemMeta);
        });
        formData.append("bannered_collections_meta", JSON.stringify(banneredMeta));
      }

      // Section Order
      settings.section_order.forEach((section, index) => formData.append(`section_order[${index}]`, section));

      await settingsService.updateHomepageSettings(formData);
      toast.success("Homepage design saved!");
      loadData();
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Failed to save design");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center dark:bg-gray-900 dark:text-white">Loading Visual Builder...</div>;

  return (
    <div className={`flex h-screen overflow-hidden ${darkMode ? 'dark' : ''}`}>
      {/* 1. Admin Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static ${adminSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar isOpen={adminSidebarOpen} setIsOpen={setAdminSidebarOpen} />
      </div>

      {/* 2. Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-100 dark:bg-gray-950 overflow-hidden relative">
        {/* Top Control Bar */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0 z-40 shadow-sm">
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleAdminSidebar}
              className={`p-2 rounded-lg transition-colors ${adminSidebarOpen ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Menu className="w-5 h-5" />
            </button>
            <button 
              onClick={toggleSettingsSidebar}
              className={`p-2 rounded-lg transition-colors ${settingsSidebarOpen ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Settings className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2" />
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white leading-none">Homepage Builder</h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-tighter font-bold">Live Editor</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
              <button onClick={() => setViewport('desktop')} className={`p-1.5 rounded-md transition-all ${viewport === 'desktop' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600'}`}><Monitor className="w-4 h-4" /></button>
              <button onClick={() => setViewport('mobile')} className={`p-1.5 rounded-md transition-all ${viewport === 'mobile' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600'}`}><Smartphone className="w-4 h-4" /></button>
            </div>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
          </div>
        </header>

        {/* Builder Canvas */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-gray-50 dark:bg-gray-950/50 scrollbar-thin">
          <div className={`transition-all duration-500 bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden ${viewport === 'mobile' ? 'w-[375px] h-[750px]' : 'w-full max-w-6xl'}`}>
             <div className="h-full overflow-y-auto relative scrollbar-hide">
              {previewSettings && (
                <div className="homepage-mimic relative overflow-hidden">
                    <SectionWrapper id="ticker" active={activeSection === 'ticker'} onSelect={() => selectSection('ticker')} title="Ticker">
                    {previewSettings.ticker.enabled && (
                      <MimicAnnouncementTicker {...previewSettings.ticker} />
                    )}
                  </SectionWrapper>
                  <PreviewNavbar />
                  {previewSettings.section_order.map((sectionKey) => {
                    switch (sectionKey) {
                      case 'hero': return (
                        <SectionWrapper key="hero" id="hero" active={activeSection === 'hero'} onSelect={() => selectSection('hero')} title="Hero">
                          <MimicHeroSection 
                            {...previewSettings.hero}
                            images={previewSettings.hero.images.map((img: any) => ({ ...img, url: toAbsoluteAssetUrl(img.url) }))} 
                          />
                        </SectionWrapper>
                      );
                      case 'featured_collections': return (
                        <SectionWrapper key="featured_collections" id="featured_collections" active={activeSection === 'featured_collections'} onSelect={() => selectSection('featured_collections')} title="Collections">
                          {previewSettings.collections.length > 0 && <MimicCollectionTiles collections={previewSettings.collections.map((c: any) => ({ ...c, image: toAbsoluteAssetUrl(c.image) })) as any} />}
                        </SectionWrapper>
                      );
                      case 'new_arrivals': return (
                        <SectionWrapper key="new_arrivals" id="new_arrivals" active={activeSection === 'new_arrivals'} onSelect={() => selectSection('new_arrivals')} title="New Arrivals">
                          <MimicNewArrivals limit={12} customProducts={[]} />
                        </SectionWrapper>
                      );
                      case 'bannered_collections': return (
                        <SectionWrapper key="bannered_collections" id="bannered_collections" active={activeSection === 'bannered_collections'} onSelect={() => selectSection('bannered_collections')} title="Banners">
                          {previewSettings.bannered_collections.length > 0 && <MimicBanneredCollections items={previewSettings.bannered_collections.map((c: any) => ({ ...c, image: toAbsoluteAssetUrl(c.image) })) as any} />}
                        </SectionWrapper>
                      );
                      case 'showcase': return (
                        <SectionWrapper key="showcase" id="showcase" active={activeSection === 'showcase'} onSelect={() => selectSection('showcase')} title="Showcase">
                          {previewSettings.showcase.map((item: any, idx: number) => <MimicSubcategoryProductTabs key={idx} categoryId={item.category_id} subcategoryIds={item.subcategories} />)}
                        </SectionWrapper>
                      );
                      default: return null;
                    }
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Settings Sidebar */}
      <div className={`w-[340px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col z-40 transition-all duration-300 ${settingsSidebarOpen ? 'translate-x-0' : 'translate-x-full absolute right-0 inset-y-0 shadow-2xl'}`}>
        <div className="h-16 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400"><Sliders className="w-4 h-4" /></div>
            <h2 className="font-bold text-gray-900 dark:text-white text-sm">DESIGN EDITOR</h2>
          </div>
          <button onClick={toggleSettingsSidebar} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {!activeSection ? (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed font-medium">Click on any section in the preview to customize it, or select from the list below.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-2 block tracking-widest">Available Sections</label>
                {(['layout', 'ticker', 'hero', 'featured_collections', 'new_arrivals', 'bannered_collections', 'showcase'] as SectionKey[]).map((key) => (
                   <button 
                    key={key}
                    onClick={() => selectSection(key)}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/5 transition-all text-left group"
                   >
                     <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 group-hover:text-blue-600 transition-colors">
                         {key === 'layout' ? <Move className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                       </div>
                       <span className="text-sm font-bold text-gray-700 dark:text-gray-200 capitalize">{key.replace('_', ' ')}</span>
                     </div>
                     <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                   </button>
                ))}
              </div>
            </div>
          ) : activeSection === 'layout' ? (
             <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setActiveSection(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-400"><ChevronRight className="w-4 h-4 rotate-180" /></button>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">REORDER SECTIONS</h3>
                </div>
                <div className="space-y-3">
                   {settings?.section_order.map((section, idx) => (
                      <div key={section} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:border-blue-400 transition-colors group">
                         <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-400 group-hover:text-blue-500">{idx + 1}</span>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{SECTION_NAMES[section] || section}</span>
                         </div>
                         <div className="flex items-center gap-1">
                            <button onClick={() => moveSection(idx, 'up')} disabled={idx === 0} className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ArrowUp className="w-4 h-4" /></button>
                            <button onClick={() => moveSection(idx, 'down')} disabled={idx === settings.section_order.length - 1} className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ArrowDown className="w-4 h-4" /></button>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-6">
                <button onClick={() => setActiveSection(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-400"><ChevronRight className="w-4 h-4 rotate-180" /></button>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">{SECTION_NAMES[activeSection as string] || activeSection}</h3>
              </div>
              
              {settings && (
                <SidebarSettings 
                  settings={settings}
                  setSettings={setSettings}
                  activeSection={activeSection}
                  flatCategories={flatCategories}
                  availableCollections={availableCollections}
                  heroImages={heroImages}
                  setHeroImages={setHeroImages}
                  setHeroChanged={setHeroChanged}
                  selectedProductsData={selectedProductsData}
                  setSelectedProductsData={setSelectedProductsData}
                  searchProducts={searchProducts}
                  isSearching={isSearching}
                  searchResults={searchResults}
                  productSearchQuery={productSearchQuery}
                  setProductSearchQuery={setProductSearchQuery}
                />
              )}
            </div>
          )}
        </div>
        
        <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
           <button 
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
          <p className="text-[9px] text-center text-gray-400 mt-3 font-medium uppercase tracking-widest">Live Debounced Preview (1s)</p>
        </div>
      </div>
    </div>
  );
}

// Static nav preview — no context hooks, no router calls, purely visual
function PreviewNavbar() {
  return (
    <nav
      style={{
        background: '#ffffff',
        borderBottom: '1px solid rgba(0,0,0,0.10)',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '0.04em', fontFamily: "'Poppins', sans-serif" }}>ERRUM</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '13px', fontWeight: 600, color: '#444' }}>
        <span>Shop</span>
        <span>New Arrivals</span>
        <span>Collections</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#444' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
    </nav>
  );
}

// Helper Components
function SectionWrapper({ children, id, active, onSelect, title }: { children: React.ReactNode, id: string, active: boolean, onSelect: () => void, title: string }) {
  return (
    <div className={`relative group transition-all duration-500 ${active ? 'ring-4 ring-blue-500 ring-inset shadow-2xl' : ''}`}>
      {/* Click-to-select overlay that blocks underlying navigation */}
      <div 
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
        className={`absolute inset-0 z-20 cursor-pointer transition-all duration-300 ${active ? 'bg-blue-500/5' : 'group-hover:bg-blue-500/5'}`} 
      />
      
      <div className={`absolute top-6 right-6 z-30 transition-all duration-300 ${active ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-90 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100'}`}>
        <button 
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-2xl font-bold text-[10px] uppercase tracking-widest transition-all ${active ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-blue-600 hover:text-white'}`}
        >
          {active ? <Settings className="w-3.5 h-3.5" /> : <MousePointer2 className="w-3.5 h-3.5" />}
          EDIT {title}
        </button>
      </div>

      {/* Actual Content - wrap in div to ensure z-index is lower than overlay */}
      <div className="relative z-10 pointer-events-none">
        {children}
      </div>
    </div>
  );
}
