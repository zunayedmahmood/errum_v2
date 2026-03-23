'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, RefreshCcw, X, Save, Trash2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from "@/contexts/ThemeContext";
import roleService, { Role, CreateRoleData, UpdateRoleData } from '@/services/roleService';
import permissionService, { Permission } from '@/services/permissionService';

type RoleFormState = {
  title: string;
  description: string;
  guard_name: 'web' | 'api';
  level: number;
  is_active: boolean;
  is_default: boolean;
  permission_ids: number[];
};

const emptyForm: RoleFormState = {
  title: '',
  description: '',
  guard_name: 'web',
  level: 50,
  is_active: true,
  is_default: false,
  permission_ids: [],
};

export default function RolesPage() {
  const { hasAnyPermission, hasPermission, isLoading } = useAuth();

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { darkMode, setDarkMode } = useTheme();

  // Data
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [onlyActive, setOnlyActive] = useState<boolean | undefined>(undefined);

  // Modal
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const canView = hasAnyPermission(['roles.view', 'roles.create', 'roles.edit', 'roles.delete']);
  const canCreate = hasPermission('roles.create');
  const canEdit = hasPermission('roles.edit');
  const canDelete = hasPermission('roles.delete');

  const modules = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of permissions) {
      const key = p.module || 'other';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    // sort perms within module
    for (const [k, arr] of m) {
      arr.sort((a, b) => a.title.localeCompare(b.title));
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roles.filter((r) => {
      if (onlyActive === true && !r.is_active) return false;
      if (onlyActive === false && r.is_active) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    });
  }, [roles, query, onlyActive]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        roleService.getRoles(onlyActive === undefined ? undefined : { is_active: onlyActive }),
        permissionService.getPermissions({ is_active: true }),
      ]);
      setRoles(rolesRes.data || []);
      setPermissions(permsRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyActive]);

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = async (role: Role) => {
    setMode('edit');
    setEditing(role);
    // fetch fresh role (ensures permissions included)
    const res = await roleService.getRole(role.id);
    const full = res.data;
    setForm({
      title: full.title || '',
      description: full.description || '',
      guard_name: full.guard_name || 'web',
      level: full.level ?? 50,
      is_active: !!full.is_active,
      is_default: !!full.is_default,
      permission_ids: (full.permissions || []).map((p) => p.id),
    });
    setOpen(true);
  };

  const togglePerm = (id: number) => {
    setForm((prev) => {
      const has = prev.permission_ids.includes(id);
      return {
        ...prev,
        permission_ids: has ? prev.permission_ids.filter((x) => x !== id) : [...prev.permission_ids, id],
      };
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (mode === 'create') {
        const payload: CreateRoleData = {
          title: form.title,
          description: form.description || undefined,
          guard_name: form.guard_name,
          level: form.level,
          is_active: form.is_active,
          is_default: form.is_default,
          permission_ids: form.permission_ids,
        };
        await roleService.createRole(payload);
      } else if (mode === 'edit' && editing) {
        const payload: UpdateRoleData = {
          title: form.title,
          description: form.description || undefined,
          level: form.level,
          is_active: form.is_active,
          is_default: form.is_default,
        };
        await roleService.updateRole(editing.id, payload);
        // sync permissions if changed
        await roleService.assignPermissions(editing.id, form.permission_ids);
      }
      setOpen(false);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (role: Role) => {
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete role "${role.title}"?`)) return;
    await roleService.deleteRole(role.id);
    await loadAll();
  };

  if (!isLoading && !canView) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Access denied</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
            You need role management permissions to view this page.
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
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roles</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Create and manage roles and their permissions.</p>
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
                {canCreate && (
                  <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black text-white text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    New Role
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search roles by title, slug, description"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Guard</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">Loading…</td>
                      </tr>
                    ) : filteredRoles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">No roles found</td>
                      </tr>
                    ) : (
                      filteredRoles.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{r.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{r.description || '-'}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-200">{r.slug}</td>
                          <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-200">{r.guard_name}</td>
                          <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-200">{r.level ?? '-'}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              r.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {r.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              {canEdit && (
                                <button
                                  onClick={() => openEdit(r)}
                                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800"
                                >
                                  Edit
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => removeRole(r)}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              )}
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
          <div className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {mode === 'create' ? 'Create Role' : `Edit Role: ${editing?.title ?? ''}`}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Assign permissions by selecting from modules.</p>
              </div>
              <button
                onClick={() => !saving && setOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: basic fields */}
              <div className="lg:col-span-1 space-y-3">
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
                <div className="grid grid-cols-2 gap-3">
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
                  <div>
                    <label className="text-xs text-gray-500">Level</label>
                    <input
                      type="number"
                      value={form.level}
                      onChange={(e) => setForm((p) => ({ ...p, level: Number(e.target.value) }))}
                      className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
                    />
                    Default
                  </label>
                </div>
              </div>

              {/* Right: permissions */}
              <div className="lg:col-span-2">
                <div className="text-sm font-medium text-gray-900 dark:text-white mb-2">Permissions</div>
                <div className="max-h-[55vh] overflow-auto border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900">
                  {modules.map(([module, perms]) => (
                    <div key={module} className="mb-4">
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2">
                        {module}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {perms.map((p) => {
                          const checked = form.permission_ids.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex items-start gap-2 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePerm(p.id)}
                                className="mt-1"
                              />
                              <div>
                                <div className="text-sm text-gray-900 dark:text-white">{p.title}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{p.slug}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Selected permissions: {form.permission_ids.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={saving || !form.title.trim()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
