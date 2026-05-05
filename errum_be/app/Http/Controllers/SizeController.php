<?php

namespace App\Http\Controllers;

use App\Models\Size;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class SizeController extends Controller
{
    /**
     * Display a listing of the sizes.
     */
    public function index()
    {
        $sizes = Size::orderBy('name')->get();
        return response()->json([
            'success' => true,
            'data' => $sizes
        ]);
    }

    /**
     * Store a newly created size in storage.
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:50|unique:sizes,name',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation error',
                'errors' => $validator->errors()
            ], 422);
        }

        $size = Size::create([
            'name' => $request->name
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Size created successfully',
            'data' => $size
        ], 201);
    }
}
