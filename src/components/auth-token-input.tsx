'use client';

import { useState, useEffect, useCallback } from 'react';
import { updateAuthToken, getAuthTokenPreview } from '@/app/websites/[id]/actions';

interface AuthTokenInputProps {
  websiteId: string;
}

export default function AuthTokenInput({ websiteId }: AuthTokenInputProps) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ hasToken: boolean; preview: string } | null>(null);

  useEffect(() => {
    getAuthTokenPreview(websiteId).then((r) => {
      if (r.success) setPreview(r.data);
    });
  }, [websiteId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    const result = await updateAuthToken(websiteId, token);
    if (result.success) {
      setMessage({ type: 'success', text: token.trim() ? 'Token saved (encrypted)' : 'Token cleared' });
      setToken('');
      // Refresh preview
      const r = await getAuthTokenPreview(websiteId);
      if (r.success) setPreview(r.data);
    } else {
      setMessage({ type: 'error', text: result.error });
    }
    setSaving(false);
  }, [websiteId, token]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    const result = await updateAuthToken(websiteId, '');
    if (result.success) {
      setMessage({ type: 'success', text: 'Token cleared' });
      setToken('');
      setPreview({ hasToken: false, preview: '' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }
    setSaving(false);
  }, [websiteId]);

  return (
    <div className="card bg-base-300 shadow-lg">
      <div className="card-body p-5 gap-3">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-lg">Auth Token</h2>
          {preview?.hasToken && (
            <div className="flex items-center gap-2">
              <span className="badge badge-success badge-sm">Active</span>
              <code className="text-xs text-base-content/50">{preview.preview}</code>
            </div>
          )}
        </div>

        <p className="text-sm text-base-content/60">
          Optional authentication token for this website&apos;s API. Stored encrypted in the database.
          Use <code className="text-xs">{'${AUTH_TOKEN}'}</code> in your schema headers to reference it.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            placeholder={preview?.hasToken ? 'Enter new token to replace' : 'Paste auth token here'}
            className="input input-bordered input-sm flex-1 bg-base-200 font-mono text-xs"
            value={token}
            onChange={(e) => { setToken(e.target.value); setMessage(null); }}
            disabled={saving}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !token.trim()}
            >
              {saving ? <span className="loading loading-spinner loading-xs" /> : 'Save'}
            </button>
            {preview?.hasToken && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleClear}
                disabled={saving}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} py-2`}>
            <span className="text-sm">{message.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}
