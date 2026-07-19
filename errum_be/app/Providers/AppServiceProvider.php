<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use App\Models\Category;
use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\PaymentSplit;
use App\Models\ServiceOrderPayment;
use App\Models\Refund;
use App\Models\Expense;
use App\Models\ExpensePayment;
use App\Models\VendorPayment;
use App\Models\VendorPaymentItem;
use App\Models\PurchaseOrder;
use App\Models\ProductReturn;
use App\Models\DefectiveProduct;
use App\Observers\CategoryObserver;
use App\Observers\OrderObserver;
use App\Observers\OrderPaymentObserver;
use App\Observers\PaymentSplitObserver;
use App\Observers\ServiceOrderPaymentObserver;
use App\Observers\RefundObserver;
use App\Observers\ExpenseObserver;
use App\Observers\ExpensePaymentObserver;
use App\Observers\VendorPaymentObserver;
use App\Observers\VendorPaymentItemObserver;
use App\Observers\PurchaseOrderObserver;
use App\Observers\ProductReturnObserver;
use App\Observers\DefectiveProductObserver;
use App\Models\ProductBatch;
use App\Observers\ProductBatchObserver;
use App\Models\OrderItem;
use App\Observers\OrderItemObserver;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ReservedProduct;
use App\Models\ProductBarcode;
use App\Observers\LazyChatProductObserver;
use App\Observers\LazyChatProductImageObserver;
use App\Observers\LazyChatReservedProductObserver;
use App\Observers\LazyChatProductBarcodeObserver;

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
        PaymentSplit::observe(PaymentSplitObserver::class);
        ServiceOrderPayment::observe(ServiceOrderPaymentObserver::class);
        Refund::observe(RefundObserver::class);
        Expense::observe(ExpenseObserver::class);
        ExpensePayment::observe(ExpensePaymentObserver::class);
        VendorPayment::observe(VendorPaymentObserver::class);
        VendorPaymentItem::observe(VendorPaymentItemObserver::class);
        PurchaseOrder::observe(PurchaseOrderObserver::class);
        ProductReturn::observe(ProductReturnObserver::class);
        DefectiveProduct::observe(DefectiveProductObserver::class);
        ProductBatch::observe(ProductBatchObserver::class);
        OrderItem::observe(OrderItemObserver::class);
        Product::observe(LazyChatProductObserver::class);
        ProductImage::observe(LazyChatProductImageObserver::class);
        ReservedProduct::observe(LazyChatReservedProductObserver::class);
        ProductBarcode::observe(LazyChatProductBarcodeObserver::class);
    }
}
