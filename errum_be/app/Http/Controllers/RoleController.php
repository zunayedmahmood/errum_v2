<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\Permission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class RoleController extends Controller
{
    public function index(Request $request)
    {
        $query = Role::with('permissions');

        if ($request->has('is_active')) {
            $query->where('is_active', $request->is_active);
        }

        if ($request->has('guard_name')) {
            $query->byGuard($request->guard_name);
        }

        $roles = $query->ordered()->get();

        return response()->json(['success' => true, 'data' => $roles]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'guard_name' => 'required|in:api,web',
            'level' => 'nullable|integer|min:0',
            'is_active' => 'nullable|boolean',
            'is_default' => 'nullable|boolean',
            'permission_ids' => 'nullable|array',
            'permission_ids.*' => 'exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $data = $request->except('permission_ids');
        $data['slug'] = Str::slug($request->title);

        $role = Role::create($data);

        if ($request->has('permission_ids')) {
            $role->permissions()->sync($request->permission_ids);
        }

        return response()->json([
            'success' => true,
            'message' => 'Role created successfully',
            'data' => $role->load('permissions')
        ], 201);
    }

    public function show($id)
    {
        $role = Role::with('permissions')->findOrFail($id);

        return response()->json(['success' => true, 'data' => $role]);
    }

    public function update(Request $request, $id)
    {
        $role = Role::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'level' => 'nullable|integer|min:0',
            'is_active' => 'nullable|boolean',
            'is_default' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $data = $request->except(['slug', 'guard_name']);
        if ($request->has('title')) {
            $data['slug'] = Str::slug($request->title);
        }

        $role->update($data);

        return response()->json([
            'success' => true,
            'message' => 'Role updated successfully',
            'data' => $role
        ]);
    }

    public function destroy($id)
    {
        $role = Role::findOrFail($id);

        // Check if role is assigned to employees
        $employeeCount = $role->employees()->count();
        if ($employeeCount > 0) {
            return response()->json([
                'success' => false,
                'message' => "Cannot delete role assigned to {$employeeCount} employees"
            ], 400);
        }

        $role->delete();

        return response()->json([
            'success' => true,
            'message' => 'Role deleted successfully'
        ]);
    }

    public function assignPermissions(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'permission_ids' => 'required|array',
            'permission_ids.*' => 'exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $role = Role::findOrFail($id);
        $role->permissions()->sync($request->permission_ids);

        return response()->json([
            'success' => true,
            'message' => 'Permissions assigned successfully',
            'data' => $role->load('permissions')
        ]);
    }

    public function removePermissions(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'permission_ids' => 'required|array',
            'permission_ids.*' => 'exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $role = Role::findOrFail($id);
        $role->permissions()->detach($request->permission_ids);

        return response()->json([
            'success' => true,
            'message' => 'Permissions removed successfully',
            'data' => $role->load('permissions')
        ]);
    }

    public function getStatistics()
    {
        $stats = [
            'total_roles' => Role::count(),
            'active_roles' => Role::active()->count(),
            'inactive_roles' => Role::where('is_active', false)->count(),
            'by_guard' => Role::selectRaw('guard_name, COUNT(*) as count')
                ->groupBy('guard_name')
                ->pluck('count', 'guard_name'),
        ];

        return response()->json(['success' => true, 'data' => $stats]);
    }
}

