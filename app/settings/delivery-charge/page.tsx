
"use client";

import React, { useEffect, useState } from "react";
import { Save, Truck, RefreshCw, MapPin } from "lucide-react";
import { toast } from "react-hot-toast";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import settingsService from "@/services/settingsService";
import { useTheme } from "@/contexts/ThemeContext";

export default function DeliveryChargeSettingsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [insideDhakaCharge, setInsideDhakaCharge] = useState("");
  const [outsideDhakaCharge, setOutsideDhakaCharge] = useState("");
  const [lastSavedInside, setLastSavedInside] = useState<number | null>(null);
  const [lastSavedOutside, setLastSavedOutside] = useState<number | null>(null);

  const loadDeliveryCharge = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getDeliveryCharge("Dhaka");
      setInsideDhakaCharge(String(data.inside_dhaka_delivery_charge));
      setOutsideDhakaCharge(String(data.outside_dhaka_delivery_charge));
      setLastSavedInside(data.inside_dhaka_delivery_charge);
      setLastSavedOutside(data.outside_dhaka_delivery_charge);
    } catch (error) {
      console.error("Failed to load delivery charges:", error);
      toast.error("Failed to load delivery charge settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveryCharge();
  }, []);

  const parseCharge = (value: string, label: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`${label} must be a valid zero or positive amount`);
    }
    return amount;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    let inside: number;
    let outside: number;

    try {
      inside = parseCharge(insideDhakaCharge, "Inside Dhaka delivery charge");
      outside = parseCharge(outsideDhakaCharge, "Outside Dhaka delivery charge");
    } catch (error: any) {
      toast.error(error?.message || "Delivery charges must be valid amounts");
      return;
    }

    try {
      setSaving(true);
      const data = await settingsService.updateDeliveryCharge({
        inside_dhaka_delivery_charge: inside,
        outside_dhaka_delivery_charge: outside,
      });
      setInsideDhakaCharge(String(data.inside_dhaka_delivery_charge));
      setOutsideDhakaCharge(String(data.outside_dhaka_delivery_charge));
      setLastSavedInside(data.inside_dhaka_delivery_charge);
      setLastSavedOutside(data.outside_dhaka_delivery_charge);
      toast.success("Delivery charges updated successfully");
    } catch (error) {
      console.error("Failed to update delivery charges:", error);
      toast.error("Failed to update delivery charges");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-11 h-11 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
                      <Truck className="w-5 h-5 text-white dark:text-gray-900" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Delivery Charge</h1>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Set separate e-commerce delivery charges for inside Dhaka and outside Dhaka</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-4">
                    The e-commerce checkout page defaults the city to Dhaka. If the customer changes the city to anything outside Dhaka, the outside-Dhaka charge is shown and used by backend order creation.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={loadDeliveryCharge}
                  disabled={loading || saving}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
            </div>

            <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="inside-dhaka-delivery-charge" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Inside Dhaka delivery charge (BDT)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">৳</span>
                    <input
                      id="inside-dhaka-delivery-charge"
                      type="number"
                      min="0"
                      step="1"
                      value={insideDhakaCharge}
                      onChange={(event) => setInsideDhakaCharge(event.target.value)}
                      disabled={loading || saving}
                      className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white"
                      placeholder="Example: 60"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Current saved: {lastSavedInside === null ? "Loading..." : `৳${lastSavedInside.toLocaleString()}`}
                  </p>
                </div>

                <div>
                  <label htmlFor="outside-dhaka-delivery-charge" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Outside Dhaka delivery charge (BDT)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">৳</span>
                    <input
                      id="outside-dhaka-delivery-charge"
                      type="number"
                      min="0"
                      step="1"
                      value={outsideDhakaCharge}
                      onChange={(event) => setOutsideDhakaCharge(event.target.value)}
                      disabled={loading || saving}
                      className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white"
                      placeholder="Example: 120"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Current saved: {lastSavedOutside === null ? "Loading..." : `৳${lastSavedOutside.toLocaleString()}`}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 text-sm text-blue-800 dark:text-blue-200 flex gap-3">
                <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Checkout rule</p>
                  <p>City containing “Dhaka” uses the inside-Dhaka charge. Any other city uses the outside-Dhaka charge. Existing orders are not changed.</p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading || saving}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save delivery charges"}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
