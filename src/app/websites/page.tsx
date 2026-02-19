import Link from 'next/link';
import { getWebsites } from './actions';
import AddWebsiteForm from '@/components/add-website-form';
import DeleteWebsiteButton from '@/components/delete-website-button';
import WebsiteSchemaToggle from '@/components/website-schema-toggle';

export default async function WebsitesPage() {
  const result = await getWebsites();
  const websites = result.success ? result.data : [];
  const fetchError = !result.success ? result.error : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Monitored Websites</h1>

      <AddWebsiteForm />

      {fetchError && (
        <div role="alert" className="alert alert-error shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{fetchError}</span>
        </div>
      )}

      {websites.length > 0 ? (
        <div className="space-y-3">
          {websites.map((site) => (
            <div key={site.id} className="card bg-base-300 shadow-lg">
              <div className="card-body p-4 gap-3">
                {/* Main row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{site.name}</span>
                      <span
                        className={`badge badge-sm ${
                          site.active ? 'badge-primary' : 'badge-ghost'
                        }`}
                      >
                        {site.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-base-content/60 truncate">{site.baseUrl}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <WebsiteSchemaToggle
                      websiteId={site.id}
                      initialSchema={site.productSchema}
                    />
                    <Link href={`/websites/${site.id}`} className="btn btn-xs btn-ghost">
                      URLs
                    </Link>
                    <DeleteWebsiteButton websiteId={site.id} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !fetchError && (
          <div className="card bg-base-300 shadow-lg p-8 text-center">
            <p className="text-base-content/60">
              No websites configured yet. Add one above to start monitoring deals.
            </p>
          </div>
        )
      )}
    </div>
  );
}
