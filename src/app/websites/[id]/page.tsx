import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWebsiteById } from '../actions';
import { getUrlsByWebsite } from './actions';
import { productPageUrls } from '@/db/schema';
import EditWebsiteForm from '@/components/edit-website-form';
import AddUrlForm from '@/components/add-url-form';
import RemoveUrlButton from '@/components/remove-url-button';
import SchemaEditor from '@/components/schema-editor';
import AuthTokenInput from '@/components/auth-token-input';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/websites" className="btn btn-sm btn-ghost">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">{website.name}</h1>
        <span className={`badge ${website.active ? 'badge-primary' : 'badge-ghost'}`}>
          {website.active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <EditWebsiteForm website={website} />

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
                    <th>URL</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {urls.map((u) => (
                    <tr key={u.id} className="hover">
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
                        {u.lastScrapeStatus === 'ok' && (
                          <div className="flex items-center gap-1.5">
                            <span className="badge badge-success badge-xs">OK</span>
                            <span className="text-xs text-base-content/50">
                              {u.lastScrapeCount ?? 0} products
                            </span>
                          </div>
                        )}
                        {u.lastScrapeStatus === 'error' && (
                          <div className="tooltip tooltip-error" data-tip={u.lastScrapeError ?? 'Unknown error'}>
                            <span className="badge badge-error badge-xs cursor-help">Error</span>
                          </div>
                        )}
                        {!u.lastScrapeStatus && (
                          <span className="badge badge-ghost badge-xs">Not scraped</span>
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

      {/* Product Schema Editor */}
      <SchemaEditor websiteId={id} initialSchema={website.productSchema} />
    </div>
  );
}
