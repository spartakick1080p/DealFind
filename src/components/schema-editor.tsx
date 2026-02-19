'use client';

import { useState, useCallback } from 'react';
import { updateProductSchema } from '@/app/websites/[id]/actions';
import { DEFAULT_SCHEMA } from '@/lib/scraper/schema-parser';

interface SchemaEditorProps {
  websiteId: string;
  initialSchema: string | null;
}

export default function SchemaEditor({ websiteId, initialSchema }: SchemaEditorProps) {
  const defaultJson = JSON.stringify(DEFAULT_SCHEMA, null, 2);
  const [value, setValue] = useState(initialSchema ?? defaultJson);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);

    const result = await updateProductSchema(websiteId, value);
    if (result.success) {
      setMessage({ type: 'success', text: 'Schema saved' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }
    setSaving(false);
  }, [websiteId, value]);

  const handleReset = useCallback(() => {
    setValue(defaultJson);
    setMessage(null);
  }, [defaultJson]);

  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(value);
      setValue(JSON.stringify(parsed, null, 2));
      setMessage(null);
    } catch (e) {
      setMessage({ type: 'error', text: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}` });
    }
  }, [value]);

  return (
    <div className="card bg-base-300 shadow-lg">
      <div className="card-body p-5 gap-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-lg">Product Schema</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={handleReset}
            >
              Reset to Default
            </button>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={handleFormat}
            >
              Format
            </button>
          </div>
        </div>

        <p className="text-sm text-base-content/60">
          Define how to extract product data from this website. Supports HTML parsing
          (script-json, json-ld, meta-tags) and direct API calls (api-json) for client-rendered sites.
        </p>

        <div className="relative">
          <textarea
            className="textarea textarea-bordered w-full font-mono text-xs leading-relaxed bg-base-200 min-h-[400px] resize-y"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMessage(null);
            }}
            spellCheck={false}
          />
        </div>

        {message && (
          <div
            role="alert"
            className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} py-2`}
          >
            <span className="text-sm">{message.text}</span>
          </div>
        )}

        <div className="card-actions justify-end">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <span className="loading loading-spinner loading-xs" /> : 'Save Schema'}
          </button>
        </div>
      </div>
    </div>
  );
}
