<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('product_movements') || !Schema::hasColumn('product_movements', 'product_barcode_id')) {
            return;
        }

        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE product_movements MODIFY product_barcode_id BIGINT UNSIGNED NULL');
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('product_movements') || !Schema::hasColumn('product_movements', 'product_barcode_id')) {
            return;
        }

        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            // Keep the rollback safe: only make the column NOT NULL if no null rows remain.
            $nullCount = DB::table('product_movements')->whereNull('product_barcode_id')->count();
            if ($nullCount === 0) {
                DB::statement('ALTER TABLE product_movements MODIFY product_barcode_id BIGINT UNSIGNED NOT NULL');
            }
        }
    }
};
