<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('payment_commission_rates')) {
            Schema::create('payment_commission_rates', function (Blueprint $table) {
                $table->id();
                $table->foreignId('payment_method_id')->constrained('payment_methods')->cascadeOnUpdate()->restrictOnDelete();
                $table->string('channel_code', 64)->default('default');
                $table->decimal('percentage_rate', 8, 4)->default(0);
                $table->date('effective_from');
                $table->boolean('is_active')->default(true);
                $table->enum('refund_policy', ['keep_original', 'reverse_proportionally'])->default('keep_original');
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('employees')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('employees')->nullOnDelete();
                $table->timestamps();

                $table->unique(['payment_method_id', 'channel_code', 'effective_from'], 'pm_commission_rate_effective_unique');
                $table->index(['payment_method_id', 'channel_code', 'is_active', 'effective_from'], 'pm_commission_rate_lookup');
            });
        }

        if (!Schema::hasTable('payment_commission_entries')) {
            Schema::create('payment_commission_entries', function (Blueprint $table) {
                $table->id();
                $table->string('source_type', 32);
                $table->unsignedBigInteger('source_id');
                $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
                $table->foreignId('order_payment_id')->nullable()->constrained('order_payments')->nullOnDelete();
                $table->foreignId('payment_split_id')->nullable()->constrained('payment_splits')->nullOnDelete();
                $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
                $table->foreignId('payment_method_id')->constrained('payment_methods')->restrictOnDelete();
                $table->string('channel_code', 64)->default('default');
                $table->unsignedBigInteger('commission_rate_id')->nullable()->index();
                $table->date('business_date');
                $table->decimal('gross_amount', 14, 2);
                $table->decimal('commission_rate', 8, 4)->default(0);
                $table->decimal('commission_amount', 14, 2)->default(0);
                $table->decimal('reversed_commission_amount', 14, 2)->default(0);
                $table->decimal('net_commission_amount', 14, 2)->default(0);
                $table->decimal('net_amount', 14, 2);
                $table->enum('refund_policy', ['keep_original', 'reverse_proportionally'])->default('keep_original');
                $table->enum('status', ['active', 'cancelled', 'reversed'])->default('active');
                $table->unsignedBigInteger('accounting_transaction_id')->nullable()->index();
                $table->foreignId('created_by')->nullable()->constrained('employees')->nullOnDelete();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->unique(['source_type', 'source_id'], 'payment_commission_source_unique');
                $table->index(['business_date', 'store_id'], 'payment_commission_date_store');
                $table->index(['payment_method_id', 'channel_code', 'business_date'], 'payment_commission_method_date');
                $table->index(['order_id', 'status'], 'payment_commission_order_status');
            });
        }

        Schema::table('order_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('order_payments', 'commission_channel_code')) {
                $table->string('commission_channel_code', 64)->default('default')->after('fee_amount');
            }
            if (!Schema::hasColumn('order_payments', 'commission_rate_id')) {
                $table->unsignedBigInteger('commission_rate_id')->nullable()->after('commission_channel_code')->index();
            }
            if (!Schema::hasColumn('order_payments', 'commission_rate')) {
                $table->decimal('commission_rate', 8, 4)->nullable()->after('commission_rate_id');
            }
            if (!Schema::hasColumn('order_payments', 'commission_amount')) {
                $table->decimal('commission_amount', 14, 2)->default(0)->after('commission_rate');
            }
            if (!Schema::hasColumn('order_payments', 'reversed_commission_amount')) {
                $table->decimal('reversed_commission_amount', 14, 2)->default(0)->after('commission_amount');
            }
            if (!Schema::hasColumn('order_payments', 'commission_refund_policy')) {
                $table->string('commission_refund_policy', 32)->default('keep_original')->after('reversed_commission_amount');
            }
        });

        Schema::table('payment_splits', function (Blueprint $table) {
            if (!Schema::hasColumn('payment_splits', 'commission_channel_code')) {
                $table->string('commission_channel_code', 64)->default('default')->after('fee_amount');
            }
            if (!Schema::hasColumn('payment_splits', 'commission_rate_id')) {
                $table->unsignedBigInteger('commission_rate_id')->nullable()->after('commission_channel_code')->index();
            }
            if (!Schema::hasColumn('payment_splits', 'commission_rate')) {
                $table->decimal('commission_rate', 8, 4)->nullable()->after('commission_rate_id');
            }
            if (!Schema::hasColumn('payment_splits', 'commission_amount')) {
                $table->decimal('commission_amount', 14, 2)->default(0)->after('commission_rate');
            }
            if (!Schema::hasColumn('payment_splits', 'reversed_commission_amount')) {
                $table->decimal('reversed_commission_amount', 14, 2)->default(0)->after('commission_amount');
            }
            if (!Schema::hasColumn('payment_splits', 'commission_refund_policy')) {
                $table->string('commission_refund_policy', 32)->default('keep_original')->after('reversed_commission_amount');
            }
        });

        // Ensure gateway payments that historically used a null payment_method_id
        // can participate in commission snapshots and the accounting ledger.
        if (Schema::hasTable('payment_methods')) {
            $now = now();
            if (!DB::table('payment_methods')->where('code', 'sslcommerz')->exists()) {
                DB::table('payment_methods')->insert([
                    'code' => 'sslcommerz',
                    'name' => 'SSLCommerz',
                    'description' => 'SSLCommerz online payment gateway',
                    'type' => 'online_banking',
                    'allowed_customer_types' => json_encode(['ecommerce', 'social_commerce']),
                    'is_active' => true,
                    'requires_reference' => true,
                    'supports_partial' => true,
                    'min_amount' => 0,
                    'max_amount' => null,
                    'processor' => 'sslcommerz',
                    'processor_config' => null,
                    'icon' => null,
                    'fixed_fee' => 0,
                    'percentage_fee' => 0,
                    'sort_order' => 20,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        // Preserve existing method percentages as the first historical rate. New
        // installations with no payment methods simply skip this bootstrap.
        if (Schema::hasTable('payment_methods')) {
            $now = now();
            $methods = DB::table('payment_methods')->get(['id', 'percentage_fee']);
            foreach ($methods as $method) {
                DB::table('payment_commission_rates')->updateOrInsert(
                    ['payment_method_id' => $method->id, 'channel_code' => 'default', 'effective_from' => '2000-01-01'],
                    [
                        'percentage_rate' => max(0, (float) ($method->percentage_fee ?? 0)),
                        'is_active' => true,
                        'refund_policy' => 'keep_original',
                        'notes' => 'Initial rate migrated from payment_methods.percentage_fee.',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]
                );
            }
        }
    }

    public function down(): void
    {
        Schema::table('payment_splits', function (Blueprint $table) {
            foreach (['commission_channel_code', 'commission_rate_id', 'commission_rate', 'commission_amount', 'reversed_commission_amount', 'commission_refund_policy'] as $column) {
                if (Schema::hasColumn('payment_splits', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('order_payments', function (Blueprint $table) {
            foreach (['commission_channel_code', 'commission_rate_id', 'commission_rate', 'commission_amount', 'reversed_commission_amount', 'commission_refund_policy'] as $column) {
                if (Schema::hasColumn('order_payments', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::dropIfExists('payment_commission_entries');
        Schema::dropIfExists('payment_commission_rates');
    }
};
