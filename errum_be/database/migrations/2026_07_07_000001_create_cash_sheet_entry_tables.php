<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create only the manual entry tables used by the remaining Cash Sheet panels.
     *
     * The monthly cash-sheet report/grid has been removed; these tables are kept
     * because Branch Costs, Admin Panel, and Owner Panel still need them.
     */
    public function up(): void
    {
        if (!Schema::hasTable('branch_cost_entries')) {
            Schema::create('branch_cost_entries', function (Blueprint $table) {
                $table->id();
                $table->date('entry_date');
                $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
                $table->decimal('amount', 14, 2);
                $table->text('details')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('employees')->nullOnDelete();
                $table->timestamps();

                $table->index(['entry_date', 'store_id']);
            });
        }

        if (!Schema::hasTable('admin_entries')) {
            Schema::create('admin_entries', function (Blueprint $table) {
                $table->id();
                $table->date('entry_date');
                $table->enum('type', ['salary_setaside', 'cash_to_bank', 'sslzc', 'pathao']);
                $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
                $table->decimal('amount', 14, 2);
                $table->text('details')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('employees')->nullOnDelete();
                $table->timestamps();

                $table->index(['entry_date', 'type']);
                $table->index(['store_id', 'entry_date']);
            });
        }

        if (!Schema::hasTable('owner_entries')) {
            Schema::create('owner_entries', function (Blueprint $table) {
                $table->id();
                $table->date('entry_date');
                $table->enum('type', ['cash_invest', 'bank_invest', 'cash_cost', 'bank_cost']);
                $table->decimal('amount', 14, 2);
                $table->text('details')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('employees')->nullOnDelete();
                $table->timestamps();

                $table->index('entry_date');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('owner_entries');
        Schema::dropIfExists('admin_entries');
        Schema::dropIfExists('branch_cost_entries');
    }
};
