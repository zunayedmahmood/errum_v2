<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->boolean('has_loyalty_card')->default(false)->after('tags')->index();
            $table->bigInteger('loyalty_points_balance')->default(0)->after('has_loyalty_card');
            $table->timestamp('loyalty_card_activated_at')->nullable()->after('loyalty_points_balance');
            $table->foreignId('loyalty_card_activated_by')->nullable()->after('loyalty_card_activated_at')
                ->constrained('employees')->nullOnDelete();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->boolean('loyalty_card_eligible')->default(false)->after('salesman_id')->index();
            $table->unsignedBigInteger('loyalty_points_redeemed')->default(0)->after('loyalty_card_eligible');
            $table->decimal('loyalty_discount_amount', 12, 2)->default(0)->after('loyalty_points_redeemed');
            $table->unsignedBigInteger('loyalty_points_earned')->default(0)->after('loyalty_discount_amount');
            $table->decimal('loyalty_earning_basis', 12, 2)->default(0)->after('loyalty_points_earned');
            $table->decimal('loyalty_points_per_thousand_snapshot', 12, 4)->nullable()->after('loyalty_earning_basis');
            $table->unsignedInteger('loyalty_points_per_taka_snapshot')->nullable()->after('loyalty_points_per_thousand_snapshot');
            $table->timestamp('loyalty_redeemed_at')->nullable()->after('loyalty_points_per_taka_snapshot');
            $table->timestamp('loyalty_earned_at')->nullable()->after('loyalty_redeemed_at');
        });

        Schema::create('loyalty_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('points_per_thousand', 12, 4)->default(10);
            $table->unsignedInteger('points_per_taka_discount')->default(10);
            $table->foreignId('updated_by')->nullable()->constrained('employees')->nullOnDelete();
            $table->timestamps();
        });

        DB::table('loyalty_settings')->insert([
            'id' => 1,
            'points_per_thousand' => 10,
            'points_per_taka_discount' => 10,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::create('loyalty_point_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('type', 40);
            $table->bigInteger('points_delta');
            $table->bigInteger('balance_after');
            $table->decimal('eligible_amount', 12, 2)->default(0);
            $table->decimal('taka_discount', 12, 2)->default(0);
            $table->decimal('points_per_thousand_snapshot', 12, 4)->nullable();
            $table->unsignedInteger('points_per_taka_snapshot')->nullable();
            $table->string('idempotency_key', 160)->unique();
            $table->string('description')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('employees')->nullOnDelete();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'created_at']);
            $table->index(['order_id', 'type']);
            $table->index(['type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_point_transactions');
        Schema::dropIfExists('loyalty_settings');

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'loyalty_card_eligible',
                'loyalty_points_redeemed',
                'loyalty_discount_amount',
                'loyalty_points_earned',
                'loyalty_earning_basis',
                'loyalty_points_per_thousand_snapshot',
                'loyalty_points_per_taka_snapshot',
                'loyalty_redeemed_at',
                'loyalty_earned_at',
            ]);
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropForeign(['loyalty_card_activated_by']);
            $table->dropColumn([
                'has_loyalty_card',
                'loyalty_points_balance',
                'loyalty_card_activated_at',
                'loyalty_card_activated_by',
            ]);
        });
    }
};
