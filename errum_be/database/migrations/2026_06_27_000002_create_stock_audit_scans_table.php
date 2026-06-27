<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_audit_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_audit_session_id')->constrained('stock_audit_sessions')->cascadeOnDelete();
            $table->foreignId('product_barcode_id')->nullable()->constrained('product_barcodes')->nullOnDelete();
            $table->string('barcode_text');
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained('product_batches')->nullOnDelete();
            $table->foreignId('expected_store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->foreignId('system_store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->string('system_status')->nullable();
            $table->string('scan_status')->default('matched')->index(); // matched, unexpected_store, unknown_barcode, duplicate, non_sellable
            $table->boolean('is_duplicate')->default(false)->index();
            $table->unsignedBigInteger('scanned_by')->nullable()->index();
            $table->timestamp('scanned_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['stock_audit_session_id', 'barcode_text']);
            $table->index(['stock_audit_session_id', 'product_id']);
            $table->index(['expected_store_id', 'scan_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_audit_scans');
    }
};
