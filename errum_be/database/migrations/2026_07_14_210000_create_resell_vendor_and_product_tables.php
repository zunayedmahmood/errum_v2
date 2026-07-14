<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resell_vendors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->unique()->constrained('vendors')->cascadeOnDelete();
            $table->foreignId('marked_by')->nullable()->constrained('employees')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'vendor_id']);
        });

        Schema::create('resell_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->unique()->constrained('products')->cascadeOnDelete();
            $table->foreignId('resell_vendor_id')->constrained('resell_vendors')->cascadeOnDelete();
            $table->foreignId('marked_by')->nullable()->constrained('employees')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['resell_vendor_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resell_products');
        Schema::dropIfExists('resell_vendors');
    }
};
