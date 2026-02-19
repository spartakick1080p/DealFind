import { getDashboardMetrics, getRecentDeals, markAsPurchased } from '@/lib/metrics-service';
import PurchaseButton from '@/components/purchase-button';
import Image from 'next/image';

async function handlePurchase(dealId: string, actualPrice: number) {
  'use server';
  await markAsPurchased(dealId, actualPrice);
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
    // Graceful fallback when DB is unavailable — render with defaults
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
            </svg>
          }
          label="Total Deals Found"
          value={metrics.totalDealsFound.toLocaleString()}
        />
        <MetricCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          }
          label="Items Purchased"
          value={metrics.totalItemsPurchased.toLocaleString()}
        />
        <MetricCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          label="Dollars Saved"
          value={`$${metrics.totalDollarsSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
      </div>

      {/* Recent Deals */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Deals</h2>
        {recentDeals.length === 0 ? (
          <div className="card bg-base-300 shadow-lg p-8 text-center">
            <p className="text-base-content/60">No deals found yet. Configure websites and filters to start discovering deals.</p>
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


function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card bg-base-300 shadow-lg">
      <div className="card-body flex-row items-center gap-4 p-5">
        <div className="shrink-0">{icon}</div>
        <div>
          <p className="text-sm text-base-content/60">{label}</p>
          <p className="text-2xl font-bold text-primary">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DealCard({ deal }: { deal: Awaited<ReturnType<typeof getRecentDeals>>[number] }) {
  const discount = parseFloat(deal.discountPercentage);
  const bestPrice = parseFloat(deal.bestPrice);
  const listPrice = parseFloat(deal.listPrice);

  return (
    <div className="card bg-base-300 shadow-lg">
      <div className="card-body p-4 gap-3">
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
            <div className="w-16 h-16 rounded-lg bg-neutral flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight truncate" title={deal.productName}>
              {deal.productName}
            </h3>
            {deal.brand && (
              <p className="text-xs text-base-content/50 mt-0.5">{deal.brand}</p>
            )}
          </div>
          <span className="text-xl font-bold text-primary shrink-0">
            {discount.toFixed(0)}%
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-primary">
            ${bestPrice.toFixed(2)}
          </span>
          <span className="text-sm text-base-content/40 line-through">
            ${listPrice.toFixed(2)}
          </span>
        </div>

        <div className="card-actions justify-end mt-1">
          <PurchaseButton
            dealId={deal.id}
            bestPrice={bestPrice.toFixed(2)}
            onPurchase={handlePurchase}
          />
        </div>
      </div>
    </div>
  );
}
