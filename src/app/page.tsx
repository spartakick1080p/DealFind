import { getDashboardMetrics, getRecentDeals, markAsPurchased, clearAllDeals } from '@/lib/metrics-service';
import PurchaseButton from '@/components/purchase-button';
import ClearDealsButton from '@/components/clear-deals-button';
import Image from 'next/image';

async function handlePurchase(dealId: string, actualPrice: number) {
  'use server';
  await markAsPurchased(dealId, actualPrice);
}

async function handleClearDeals() {
  'use server';
  await clearAllDeals();
}

export default async function DashboardPage() {
  let metrics = { totalDealsFound: 0, totalItemsPurchased: 0, totalDollarsSaved: 0 };
  let recentDeals: Awaited<ReturnType<typeof getRecentDeals>> = [];

  try {
    [metrics, recentDeals] = await Promise.all([
      getDashboardMetrics(),
      getRecentDeals(20),
    ]);
  } catch {
    // Graceful fallback when DB is unavailable
  }

  const stats = [
    { id: 1, name: 'Total Deals Found', value: metrics.totalDealsFound.toLocaleString() },
    { id: 2, name: 'Items Purchased', value: metrics.totalItemsPurchased.toLocaleString() },
    {
      id: 3,
      name: 'Dollars Saved',
      value: `$${metrics.totalDollarsSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
  ];

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>

      {/* Stats counter */}
      <div className="rounded-xl bg-[#0a0a0a] border border-white/10 py-10">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-10 text-center lg:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.id} className="mx-auto flex max-w-xs flex-col gap-y-2">
              <dt className="text-sm text-gray-400">{stat.name}</dt>
              <dd className="order-first text-4xl font-semibold tracking-tight text-orange-500">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Recent Deals */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-100">Recent Deals</h2>
          {recentDeals.length > 0 && <ClearDealsButton onClear={handleClearDeals} />}
        </div>
        {recentDeals.length === 0 ? (
          <div className="rounded-xl bg-[#0a0a0a] border border-white/10 p-8 text-center">
            <p className="text-gray-500">
              No deals found yet. Configure websites and filters to start discovering deals.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {recentDeals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function DealCard({ deal }: { deal: Awaited<ReturnType<typeof getRecentDeals>>[number] }) {
  const discount = parseFloat(deal.discountPercentage);
  const bestPrice = parseFloat(deal.bestPrice);
  const listPrice = parseFloat(deal.listPrice);

  return (
    <div className="rounded-xl bg-[#0a0a0a] border border-white/10 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {deal.imageUrl ? (
          <Image
            src={deal.imageUrl}
            alt={deal.productName}
            width={64}
            height={64}
            className="rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-200 leading-tight truncate" title={deal.productName}>
            {deal.productName}
          </h3>
          {deal.brand && (
            <p className="text-xs text-gray-500 mt-0.5">{deal.brand}</p>
          )}
        </div>
        <span className="text-xl font-bold text-orange-500 shrink-0">
          {discount.toFixed(0)}%
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-orange-500">
          ${bestPrice.toFixed(2)}
        </span>
        <span className="text-sm text-gray-500 line-through">
          ${listPrice.toFixed(2)}
        </span>
      </div>

      <div className="flex justify-end mt-1">
        <PurchaseButton
          dealId={deal.id}
          bestPrice={bestPrice.toFixed(2)}
          onPurchase={handlePurchase}
        />
      </div>
    </div>
  );
}
