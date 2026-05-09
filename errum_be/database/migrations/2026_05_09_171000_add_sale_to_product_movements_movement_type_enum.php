<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Database-agnostic approach: Drop and recreate column with expanded enum
        Schema::table('product_movements', function (Blueprint $table) {
            $table->dropColumn('movement_type');
        });
        
        Schema::table('product_movements', function (Blueprint $table) {
            $table->enum('movement_type', ['dispatch', 'transfer', 'return', 'adjustment', 'defective', 'sale'])
                ->after('to_store_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('product_movements', function (Blueprint $table) {
            $table->dropColumn('movement_type');
        });
        
        Schema::table('product_movements', function (Blueprint $table) {
            $table->enum('movement_type', ['dispatch', 'transfer', 'return', 'adjustment', 'defective'])
                ->after('to_store_id');
        });
    }
};
