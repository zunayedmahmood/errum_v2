<?php

use Illuminate\Database\Migrations\Migration;

/**
 * Compatibility marker for installations that received the July cash-sheet
 * patch after the canonical April migration.
 *
 * The tables are owned by:
 * 2026_04_14_000003_create_cash_sheet_entry_tables.php
 *
 * This migration must remain a no-op in both directions. Older copies repeated
 * the CREATE statements and dropped all three tables from down(), which meant a
 * one-step rollback could delete tables and data created by the April migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Intentionally empty. The canonical April migration creates the tables.
    }

    public function down(): void
    {
        // Intentionally empty. This compatibility marker owns no schema objects.
    }
};
