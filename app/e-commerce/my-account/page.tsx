import MyAccountShell from '@/components/ecommerce/my-account/MyAccountShell';

export default function MyAccount() {
  return (
    <MyAccountShell 
      title="My Account" 
      subtitle="Welcome to your account dashboard. Manage your orders, addresses, and account details."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className="ec-surface p-6">
          <h3 className="text-white font-serif text-lg mb-2 tracking-wide uppercase">Recent Orders</h3>
          <p className="text-white/40 text-sm mb-4">You have fresh drops waiting in your order history.</p>
          <a href="/e-commerce/my-account/orders" className="text-gold-light text-sm font-semibold hover:underline flex items-center gap-2">
            View History →
          </a>
        </div>
        
        <div className="ec-surface p-6">
          <h3 className="text-white font-serif text-lg mb-2 tracking-wide uppercase">Addresses</h3>
          <p className="text-white/40 text-sm mb-4">Manage your shipping and billing locations for faster checkout.</p>
          <a href="/e-commerce/my-account/addresses" className="text-gold-light text-sm font-semibold hover:underline flex items-center gap-2">
            Manage Addresses →
          </a>
        </div>
      </div>
    </MyAccountShell>
  );
}