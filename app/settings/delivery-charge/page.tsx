"use client";

import React, { useEffect, useState } from "react";
import { Loader2, MapPin, Save, Truck } from "lucide-react";
import { toast } from "react-hot-toast";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";
import settingsService, { DeliveryChargeSettings } from "@/services/settingsService";

const DEFAULT_SETTINGS: DeliveryChargeSettings = {
  inside_dhaka: 60,
  outside_dhaka: 120,
};

export default function DeliveryChargeSettingsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<DeliveryChargeSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getAdminDeliveryChargeSettings();
      setSettings({
        inside_dhaka: Number(data?.inside_dhaka ?? DEFAULT_SETTINGS.inside_dhaka),
        outside_dhaka: Number(data?.outside_dhaka ?? DEFAULT_SETTINGS.outside_dhaka),
      });
    } catch (error) {
      console.error("Failed to load delivery charge settings", error);
      toast.error("Could not load delivery charge settings");
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof DeliveryChargeSettings, value: string) => {
    const numericValue = Math.max(0, Number(value || 0));
    setSettings((prev) => ({ ...prev, [field]: numericValue }));
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const response = await settingsService.updateDeliveryChargeSettings({
        inside_dhaka: Number(settings.inside_dhaka || 0),
        outside_dhaka: Number(settings.outside_dhaka || 0),
      });
      setSettings(response.data ?? settings);
      toast.success(response.message || "Delivery charge updated");
    } catch (error: any) {
      console.error("Failed to save delivery charge settings", error);
      toast.error(error?.response?.data?.message || "Could not save delivery charge settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Settings</p>
                <h1 className="text-3xl font-bold mt-1">Delivery charge</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  Set the standard e-commerce delivery fees used in checkout and backend order creation.
                </p>
              </div>
              <button
                type="button"
                onClick={saveSettings}
                disabled={loading || saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save changes
              </button>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-10 flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading delivery charges...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-300">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Inside Dhaka</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Applied when checkout city is Dhaka.</p>
                    </div>
                  </div>
                  <label className="block text-sm font-medium mb-2">Delivery charge (৳)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.inside_dhaka}
                    onChange={(event) => updateField("inside_dhaka", event.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-4 py-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-300">
                      <Truck className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Outside Dhaka</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Applied to every other city.</p>
                    </div>
                  </div>
                  <label className="block text-sm font-medium mb-2">Delivery charge (৳)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.outside_dhaka}
                    onChange={(event) => updateField("outside_dhaka", event.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-4 py-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-5 text-sm text-blue-900 dark:text-blue-100">
              Checkout pre-fills the city as <strong>Dhaka</strong>, but customers can change it. The order summary updates instantly from the inside/outside Dhaka setting, and the backend recalculates the same charge during order creation.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
