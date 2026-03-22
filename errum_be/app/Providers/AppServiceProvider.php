<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\ServiceOrderPayment;
use App\Models\Refund;
use App\Models\Expense;
use App\Models\ExpensePayment;
use App\Models\VendorPayment;
use App\Observers\CategoryObserver;
use App\Observers\OrderObserver;
use App\Observers\OrderPaymentObserver;
use App\Observers\ServiceOrderPaymentObserver;
use App\Observers\RefundObserver;
use App\Observers\ExpenseObserver;
use App\Observers\ExpensePaymentObserver;
use App\Observers\VendorPaymentObserver;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Register observers for automatic transaction creation
        Category::observe(CategoryObserver::class);
        Order::observe(OrderObserver::class);
        OrderPayment::observe(OrderPaymentObserver::class);
        ServiceOrderPayment::observe(ServiceOrderPaymentObserver::class);
        Refund::observe(RefundObserver::class);
        Expense::observe(ExpenseObserver::class);
        ExpensePayment::observe(ExpensePaymentObserver::class);
        VendorPayment::observe(VendorPaymentObserver::class);
    }
}
