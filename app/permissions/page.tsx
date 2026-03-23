'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, RefreshCcw, X, Save, Trash2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from "@/contexts/ThemeContext";
import permissionService, { Permission, CreatePermissionData, UpdatePermissionData } from '@/services/permissionService';

type PermFormState = {
  title: string;
  description: string;
  module: string;
  guard_name: 'web' | 'api';
  is_active: boolean;
};

const emptyForm: PermFormState = {
  title: '',
  description: '',
  module: '',
  guard_name: 'web',
  is_active: true,
};

export default function PermissionsPage() {
  const { hasPermission, isLoading } = useAuth();
  const canManage = hasPermission('permissions.manage');

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { darkMode, setDarkMode } = useTheme();

  // Data
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [onlyActive, setOnlyActive] = useState<boolean | undefined>(undefined);

  // Modal
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<Permission | null>(null);
  const [form, setForm] = useState<PermFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const modules = useMemo(() => {
    const set = new Set<string>();
    perms.forEach((p) => p.module && set.add(p.module));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [perms]);

  const filteredPerms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return perms.filter((p) => {
      if (onlyActive === true && !p.is_active) return false;
      if (onlyActive === false && p.is_active) return false;
      if (moduleFilter && p.module !== moduleFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    });
  }, [perms, query, moduleFilter, onlyActive]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await permissionService.getPermissions(
        {
          is_active: onlyActive,
          module: moduleFilter || undefined,
        }
      );
      setPerms(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyActive, moduleFilter]);

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = async (p: Permission) => {
    setMode('edit');
    setEditing(p);
    const res = await permissionService.getPermission(p.id);
    const full = res.data;
    setForm({
      title: full.title || '',
      description: full.description || '',
      module: full.module || '',
      guard_name: full.guard_name || 'web',
      is_active: !!full.is_active,
    });
    setOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (mode === 'create') {
        const payload: CreatePermissionData = {
          title: form.title,
          description: form.description || undefined,
          module: form.module,
          guard_name: form.guard_name,
          is_active: form.is_active,
        };
        await permissionService.createPermission(payload);
      } else if (mode === 'edit' && editing) {
        const payload: UpdatePermissionData = {
          title: form.title,
          description: form.description || undefined,
          module: form.module,
          is_active: form.is_active,
        };
        await permissionService.updatePermission(editing.id, payload);
      }
      setOpen(false);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const removePerm = async (p: Permission) => {
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete permission "${p.title}"?`)) return;
    await permissionService.deletePermission(p.id);
    await loadAll();
  };

  if (!isLoading && !canManage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Access denied</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
            You need <span className="font-mono">permissions.manage</span> to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
          />

          <main className="flex-1 p-6">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Permissions</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Create and manage permissions by module.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadAll}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  title="Refresh"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Refresh
                </button>
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black text-white text-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Permission
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search permissions"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <option value="">All modules</option>
                  {modules.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  value={onlyActive === undefined ? 'all' : onlyActive ? 'active' : 'inactive'}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOnlyActive(v === 'all' ? undefined : v === 'active');
                  }}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permission</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Guard</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {loading ? (
                      <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">Loading…</td></tr>
                    ) : filteredPerms.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">No permissions found</td></tr>
                    ) : (
                      filteredPerms.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{p.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{p.description || '-'}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-200">{p.slug}</td>
                          <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-200">{p.module}</td>
                          <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-200">{p.guard_name}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              p.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {p.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => openEdit(p)}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => removePerm(p)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && setOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {mode === 'create' ? 'Create Permission' : `Edit Permission: ${editing?.title ?? ''}`}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Slug is handled by backend.</p>
              </div>
              <button
                onClick={() => !saving && setOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Module</label>
                  <input
                    value={form.module}
                    onChange={(e) => setForm((p) => ({ ...p, module: e.target.value }))}
                    placeholder="e.g. employees, products, reports"
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Guard</label>
                  <select
                    value={form.guard_name}
                    onChange={(e) => setForm((p) => ({ ...p, guard_name: e.target.value as any }))}
                    disabled={mode === 'edit'}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 disabled:opacity-60"
                  >
                    <option value="web">web</option>
                    <option value="api">api</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Active
              </label>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving || !form.title.trim() || !form.module.trim()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
