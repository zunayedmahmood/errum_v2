<?php

use Illuminate\Database\Migrations\Migration;

/**
 * Legacy monthly-sheet migration removed.
 *
 * The cash sheet no longer has a saved daily/monthly sheet table. The canonical
 * report is rebuilt live from source tables by /api/cash-sheet. The three
 * manual entry tables used by the Branch Cost, Admin, and Owner panels are
 * created by 2026_04_14_000003_create_cash_sheet_entry_tables.php.
 *
 * This migration is intentionally kept as a no-op so already-installed systems
 * keep a stable migration history and fresh installs do not create duplicate
 * cash-sheet tables.
 */
return new class extends Migration
{
    public function up(): void
    {
        // no-op; superseded by the canonical cash-sheet entry-table migration
    }

    public function down(): void
    {
        // no-op; do not drop canonical cash-sheet entry tables from a legacy migration
    }
};
