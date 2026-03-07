import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWebsiteById } from '../actions';
import { getUrlsByWebsite } from './actions';
import { getAllFilters, getWebsiteFilterIds, getAllUrlFilterIdsForWebsite } from './filter-actions';
import { productPageUrls } from '@/db/schema';
import EditWebsiteForm from '@/components/edit-website-form';
import AddUrlForm from '@/components/add-url-form';
import RemoveUrlButton from '@/components/remove-url-button';
import UrlNote from '@/components/url-note';
import UrlActiveToggle from '@/components/url-active-toggle';
import SchemaEditor from '@/components/schema-editor';
import AuthTokenInput from '@/components/auth-token-input';
import WebhookManager from '@/components/webhook-manager';
import WebsiteFilterPicker from '@/components/website-filter-picker';
import UrlFilterPicker from '@/components/url-filter-picker';
import { Badge } from '@/components/badge';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WebsiteDetailPage({ params }: PageProps) {
  const { id } = await params;

  const websiteResult = await getWebsiteById(id);
  if (!websiteResult.success || !websiteResult.data) {
    notFound();
  }
  const website = websiteResult.data;

  let urls: (typeof productPageUrls.$inferSelect)[] = [];
  try {
    const urlsResult = await getUrlsByWebsite(id);
    if (urlsResult.success) {
      urls = urlsResult.data;
    }
  } catch {
    // Graceful fallback
  }

  // Fetch filter data for pickers
  let allFilters: { id: string; name: string; active: boolean }[] = [];
  let websiteFilterIds: string[] = [];
  let urlFilterMap: Record<string, string[]> = {};

  try {
    const [filtersResult, wsFilterResult, urlFilterResult] = await Promise.all([
      getAllFilters(),
      getWebsiteFilterIds(id),
      getAllUrlFilterIdsForWebsite(id, urls.map((u) => u.id)),
    ]);
    if (filtersResult.success) allFilters = filtersResult.data;
    if (wsFilterResult.success) websiteFilterIds = wsFilterResult.data;
    if (urlFilterResult.success) urlFilterMap = urlFilterResult.data;
  } catch {
    // Graceful fallback
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/websites" className="btn btn-sm btn-ghost">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">{website.name}</h1>
        <Badge color={website.active ? 'green' : 'gray'}>
          {website.active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <EditWebsiteForm website={website} />

      {/* Website-level filter assignment */}
      <div className="card bg-base-300 shadow-lg">
        <div className="card-body p-5 gap-3">
          <h2 className="card-title text-lg">Filters</h2>
          <p className="text-xs text-base-content/50">
            Assign filters to this website. URLs without their own filter override will use these.
            If none are assigned, all active filters apply.
          </p>
          <WebsiteFilterPicker
            websiteId={id}
            filters={allFilters}
            selectedIds={websiteFilterIds}
          />
        </div>
      </div>

      {/* Product Page URLs */}
      <div className="card bg-base-300 shadow-lg">
        <div className="card-body p-5 gap-4">
          <h2 className="card-title text-lg">Product Page URLs</h2>

          <AddUrlForm websiteId={id} />

          {urls && urls.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Enabled</th>
                    <th>URL</th>
                    <th>Note</th>
                    <th>Filters</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {urls.map((u) => (
                    <tr key={u.id} className={`hover align-top ${!u.active ? 'opacity-50' : ''}`}>
                      <td>
                        <UrlActiveToggle urlId={u.id} active={u.active} />
                      </td>
                      <td className="text-sm text-base-content/70 max-w-md truncate">
                        <a
                          href={u.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link link-hover"
                        >
                          {u.url}
                        </a>
                      </td>
                      <td>
                        <UrlNote urlId={u.id} initialNote={u.note} />
                      </td>
                      <td>
                        <UrlFilterPicker
                          urlId={u.id}
                          websiteId={id}
                          filters={allFilters}
                          selectedIds={urlFilterMap[u.id] ?? []}
                        />
                      </td>
                      <td>
                        {u.lastScrapeStatus === 'ok' && (
                          <div className="flex items-center gap-1.5">
                            <Badge color="green">OK</Badge>
                            <span className="text-xs text-base-content/50">
                              {u.lastScrapeCount ?? 0} products
                            </span>
                          </div>
                        )}
                        {u.lastScrapeStatus === 'warning' && (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Badge color="yellow">Warning</Badge>
                              <span className="text-xs text-base-content/50">
                                {u.lastScrapeCount ?? 0} products
                              </span>
                            </div>
                            {u.lastScrapeError && (
                              <p className="text-[11px] text-yellow-400/80 mt-1 max-w-sm leading-snug break-words">
                                {u.lastScrapeError}
                              </p>
                            )}
                          </div>
                        )}
                        {u.lastScrapeStatus === 'error' && (
                          <div>
                            <Badge color="red">Error</Badge>
                            {u.lastScrapeError && (
                              <p className="text-[11px] text-red-400/80 mt-1 max-w-sm leading-snug break-words">
                                {u.lastScrapeError}
                              </p>
                            )}
                          </div>
                        )}
                        {!u.lastScrapeStatus && (
                          <Badge color="gray">Not scraped</Badge>
                        )}
                        {u.lastScrapedAt && (
                          <div className="text-[10px] text-base-content/40 mt-0.5">
                            {new Date(u.lastScrapedAt).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="text-right">
                        <RemoveUrlButton urlId={u.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-base-content/60 text-sm">
              No product page URLs added yet. Add URLs above to start monitoring.
            </p>
          )}
        </div>
      </div>

      {/* Auth Token */}
      <AuthTokenInput websiteId={id} />

      {/* Webhook Notifications */}
      <WebhookManager websiteId={id} />

      {/* Product Schema Editor */}
      <SchemaEditor websiteId={id} initialSchema={website.productSchema} />
    </div>
  );
}
