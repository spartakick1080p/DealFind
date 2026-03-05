'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getWebhooks,
  addWebhook,
  removeWebhook,
  toggleWebhook,
} from '@/app/websites/[id]/webhook-actions';
import { Toggle } from '@/components/toggle';

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
  {
    value: 'sns',
    label: 'Amazon SNS',
    fields: [
      { key: 'url', label: 'Topic ARN', placeholder: 'arn:aws:sns:us-east-1:123456789012:my-deals-topic', type: 'text' },
    ],
  },
  {
    value: 'sqs',
    label: 'Amazon SQS',
    fields: [
      { key: 'url', label: 'Queue URL', placeholder: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-deals-queue', type: 'url' },
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

              {/* IAM policy guidance for AWS services */}
              {(service === 'sns' || service === 'sqs') && (
                <AwsPolicyHelp service={service} />
              )}

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
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${
                        h.service === 'discord' ? 'bg-purple-500/15 text-purple-400 ring-purple-500/20' :
                        h.service === 'slack' ? 'bg-green-500/15 text-green-400 ring-green-500/20' :
                        h.service === 'sns' ? 'bg-orange-500/15 text-orange-400 ring-orange-500/20' :
                        h.service === 'sqs' ? 'bg-blue-500/15 text-blue-400 ring-blue-500/20' :
                        'bg-white/10 text-gray-400 ring-white/10'
                      }`}>{h.service}</span>
                    </td>
                    <td className="text-xs text-base-content/50 font-mono max-w-xs truncate">
                      {h.preview}
                    </td>
                    <td>
                      <Toggle
                        checked={h.active}
                        onChange={(val) => handleToggle(h.id, val)}
                        size="sm"
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

const APP_AWS_ACCOUNT_ID = process.env.NEXT_PUBLIC_AWS_ACCOUNT_ID || 'YOUR_APP_ACCOUNT_ID';

function AwsPolicyHelp({ service }: { service: string }) {
  const [expanded, setExpanded] = useState(false);

  const snsPolicy = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDealTrackerPublish",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::${APP_AWS_ACCOUNT_ID}:root"
      },
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:REGION:YOUR_ACCOUNT_ID:YOUR_TOPIC_NAME"
    }
  ]
}`;

  const sqsPolicy = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDealTrackerSendMessage",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::${APP_AWS_ACCOUNT_ID}:root"
      },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:REGION:YOUR_ACCOUNT_ID:YOUR_QUEUE_NAME"
    }
  ]
}`;

  const policy = service === 'sns' ? snsPolicy : sqsPolicy;
  const resourceType = service === 'sns' ? 'SNS topic' : 'SQS queue';
  const actionName = service === 'sns' ? 'sns:Publish' : 'sqs:SendMessage';

  return (
    <div className="rounded-lg bg-base-200 border border-base-content/10 p-3 text-xs">
      <button
        type="button"
        className="flex items-center gap-1 text-base-content/70 hover:text-base-content/90 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Required IAM resource policy for your {resourceType}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          <p className="text-base-content/60">
            Add this resource-based policy to your {resourceType} to allow this app to send messages.
            You pay for the {service.toUpperCase()} usage in your own AWS account — there is no cost to us.
          </p>
          <p className="text-base-content/60">
            Replace <code className="text-primary">REGION</code>, <code className="text-primary">YOUR_ACCOUNT_ID</code>,
            and <code className="text-primary">{service === 'sns' ? 'YOUR_TOPIC_NAME' : 'YOUR_QUEUE_NAME'}</code> with your actual values.
          </p>
          <pre className="bg-base-300 rounded p-2 overflow-x-auto text-[11px] leading-relaxed text-base-content/80">
            {policy}
          </pre>
          <p className="text-base-content/50">
            This grants only <code className="text-primary">{actionName}</code> — no other permissions are needed.
          </p>
        </div>
      )}
    </div>
  );
}
