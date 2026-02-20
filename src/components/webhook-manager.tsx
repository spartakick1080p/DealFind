'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getWebhooks,
  addWebhook,
  removeWebhook,
  toggleWebhook,
} from '@/app/websites/[id]/webhook-actions';

interface ServiceConfig {
  value: string;
  label: string;
  fields: { key: string; label: string; placeholder: string; type: string }[];
}

const SERVICES: ServiceConfig[] = [
  {
    value: 'discord',
    label: 'Discord',
    fields: [
      { key: 'url', label: 'Channel API URL', placeholder: 'https://discord.com/api/v10/channels/{channel_id}/messages', type: 'url' },
      { key: 'token', label: 'Bot Token', placeholder: 'Your Discord bot token', type: 'password' },
    ],
  },
  {
    value: 'slack',
    label: 'Slack',
    fields: [
      { key: 'url', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'url' },
    ],
  },
];

interface WebhookRow {
  id: string;
  service: string;
  active: boolean;
  preview: string;
}

export default function WebhookManager({ websiteId }: { websiteId: string }) {
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [service, setService] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getWebhooks(websiteId).then((r) => {
      if (r.success) setHooks(r.data);
    });
  }, [websiteId]);

  const selectedService = SERVICES.find((s) => s.value === service);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await addWebhook(
        websiteId,
        service,
        fieldValues.url ?? '',
        fieldValues.token,
      );
      if (result.success) {
        setFieldValues({});
        setService('');
        const refreshed = await getWebhooks(websiteId);
        if (refreshed.success) setHooks(refreshed.data);
      } else {
        setError(result.error);
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      await removeWebhook(id);
      setHooks((prev) => prev.filter((h) => h.id !== id));
    });
  }

  function handleToggle(id: string, active: boolean) {
    startTransition(async () => {
      await toggleWebhook(id, active);
      setHooks((prev) => prev.map((h) => (h.id === id ? { ...h, active } : h)));
    });
  }

  const canSubmit = selectedService?.fields.every((f) =>
    f.key === 'token' ? true : (fieldValues[f.key] ?? '').trim().length > 0
  );

  return (
    <div className="card bg-base-300 shadow-lg">
      <div className="card-body p-5 gap-4">
        <h2 className="card-title text-lg">Webhook Notifications</h2>
        <p className="text-sm text-base-content/60">
          Get notified on third-party services when new deals are found.
        </p>

        {error && (
          <div className="alert alert-error text-sm py-2"><span>{error}</span></div>
        )}

        {/* Add webhook form */}
        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <label className="form-control w-48">
            <div className="label"><span className="label-text text-xs">Service</span></div>
            <select
              className="select select-bordered select-sm w-full"
              value={service}
              onChange={(e) => { setService(e.target.value); setFieldValues({}); setError(''); }}
            >
              <option value="">Select service...</option>
              {SERVICES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          {selectedService && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedService.fields.map((f) => (
                  <label key={f.key} className="form-control w-full">
                    <div className="label"><span className="label-text text-xs">{f.label}</span></div>
                    <input
                      type={f.type}
                      placeholder={f.placeholder}
                      className="input input-bordered input-sm w-full"
                      value={fieldValues[f.key] ?? ''}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      required={f.key !== 'token'}
                    />
                  </label>
                ))}
              </div>
              <div>
                <button
                  type="submit"
                  disabled={isPending || !canSubmit}
                  className="btn btn-primary btn-sm"
                >
                  {isPending ? <span className="loading loading-spinner loading-xs" /> : 'Add Webhook'}
                </button>
              </div>
            </>
          )}
        </form>

        {/* Existing webhooks */}
        {hooks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Endpoint</th>
                  <th>Active</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hooks.map((h) => (
                  <tr key={h.id} className="hover">
                    <td>
                      <span className="badge badge-sm badge-outline capitalize">{h.service}</span>
                    </td>
                    <td className="text-xs text-base-content/50 font-mono max-w-xs truncate">
                      {h.preview}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="toggle toggle-xs toggle-primary"
                        checked={h.active}
                        onChange={(e) => handleToggle(h.id, e.target.checked)}
                      />
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => handleRemove(h.id)}
                        disabled={isPending}
                        className="btn btn-xs btn-ghost text-error"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
