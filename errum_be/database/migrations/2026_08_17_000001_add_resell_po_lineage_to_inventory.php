<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_batches', function (Blueprint $table) {
            $table->unsignedBigInteger('source_purchase_order_id')->nullable()->after('product_id');
            $table->unsignedBigInteger('source_purchase_order_item_id')->nullable()->after('source_purchase_order_id');
            $table->index(['source_purchase_order_id', 'source_purchase_order_item_id'], 'pb_resell_po_source_idx');
        });

        Schema::table('product_barcodes', function (Blueprint $table) {
            $table->unsignedBigInteger('source_purchase_order_id')->nullable()->after('product_id');
            $table->unsignedBigInteger('source_purchase_order_item_id')->nullable()->after('source_purchase_order_id');
            $table->index(['source_purchase_order_id', 'source_purchase_order_item_id'], 'pbc_resell_po_source_idx');
        });
    }

    public function down(): void
    {
        Schema::table('product_barcodes', function (Blueprint $table) {
            $table->dropIndex('pbc_resell_po_source_idx');
            $table->dropColumn(['source_purchase_order_id', 'source_purchase_order_item_id']);
        });

        Schema::table('product_batches', function (Blueprint $table) {
            $table->dropIndex('pb_resell_po_source_idx');
            $table->dropColumn(['source_purchase_order_id', 'source_purchase_order_item_id']);
        });
    }
};
