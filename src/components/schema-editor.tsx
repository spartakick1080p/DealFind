'use client';

import { useState, useCallback } from 'react';
import { updateProductSchema } from '@/app/websites/[id]/actions';
import { DEFAULT_SCHEMA } from '@/lib/scraper/schema-parser';

interface SchemaEditorProps {
  websiteId: string;
  initialSchema: string | null;
}

const AI_PROMPT = `I need help creating a product scraping schema for a website. The schema is a JSON object with this structure:

{
  "extraction": {
    "method": "script-json | json-ld | meta-tags | api-json | html-dom",
    "selector": "(for script-json) e.g. script#__NEXT_DATA__",
    "jsonLdType": "(for json-ld) e.g. Product",
    "itemSelector": "(for html-dom) CSS selector for product cards, e.g. div.product-card",
    "htmlFields": {
      "(for html-dom) field name": "regex with capture group"
    },
    "apiUrl": "(for api-json) the API endpoint URL",
    "apiMethod": "GET or POST",
    "apiHeaders": {},
    "apiBody": {}
  },
  "paths": {
    "productsArray": "dot.path.to.products.array",
    "fields": {
      "productId": "id field path (supports pipe | for alternatives)",
      "displayName": "name|title",
      "brand": "brand|manufacturer",
      "listPrice": "price|listPrice",
      "activePrice": "salePrice|activePrice",
      "salePrice": "salePrice",
      "imageUrl": "image|imageUrl",
      "productUrl": "url|relativeUrl",
      "inStock": "inStock|availability"
    }
  }
}

Field paths support pipe-separated alternatives (tried in order). Prices can be numbers or strings like "$29.99".

Here is a sample of the HTML/JSON from the website I want to scrape. Please analyze it and generate a schema that will extract product data correctly:

[PASTE YOUR HTML/JSON SAMPLE HERE]

Please return ONLY the JSON schema object, no explanation needed.`;

export default function SchemaEditor({ websiteId, initialSchema }: SchemaEditorProps) {
  const defaultJson = JSON.stringify(DEFAULT_SCHEMA, null, 2);
  const [value, setValue] = useState(initialSchema ?? defaultJson);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);
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
          (script-json, json-ld, meta-tags, html-dom) and direct API calls (api-json) for client-rendered sites.
        </p>

        {/* Getting Started Guide */}
        <div className="rounded-lg bg-base-200 border border-base-content/10">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-base-content/70 hover:text-base-content/90 transition-colors"
            onClick={() => setShowGuide(!showGuide)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 transition-transform ${showGuide ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            New to schemas? Click here for a step-by-step guide
          </button>

          {showGuide && (
            <div className="px-4 pb-4 space-y-4 text-sm text-base-content/70">
              <div className="border-t border-base-content/10 pt-3" />

              <div className="space-y-3">
                <p className="font-medium text-base-content/90">How to figure out a schema for any website:</p>

                <ol className="list-decimal list-inside space-y-2 text-[13px]">
                  <li>
                    Open the product listing page you want to scrape in your browser
                  </li>
                  <li>
                    Right-click anywhere and select <code className="text-orange-400 text-xs">View Page Source</code> (not Inspect)
                  </li>
                  <li>
                    Use <code className="text-orange-400 text-xs">Ctrl+F</code> / <code className="text-orange-400 text-xs">Cmd+F</code> to search for a product name you can see on the page
                  </li>
                  <li>
                    Note where you find it — is it inside a <code className="text-orange-400 text-xs">{'<script>'}</code> tag with JSON? In the regular HTML? Or does the page load products dynamically?
                  </li>
                  <li>
                    Copy a sample of the HTML/JSON around the product data (a few hundred lines is fine)
                  </li>
                  <li>
                    Paste it into an AI chatbot along with the prompt below to generate a starting schema
                  </li>
                  <li>
                    Paste the generated schema here, save it, then use the <span className="text-orange-400">Test Scrape</span> page to verify it works
                  </li>
                  <li>
                    Iterate — if products are missing fields or prices look wrong, tweak the field paths and test again
                  </li>
                </ol>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-base-content/90">Quick tips for finding the data:</p>
                <ul className="list-disc list-inside space-y-1 text-[13px]">
                  <li>
                    <code className="text-orange-400 text-xs">script#__NEXT_DATA__</code> — Next.js sites embed all data here as JSON
                  </li>
                  <li>
                    <code className="text-orange-400 text-xs">application/ld+json</code> — many sites include structured product data in JSON-LD format
                  </li>
                  <li>
                    If you see product data loading after the page renders, the site uses an API — check the Network tab in DevTools for XHR/Fetch requests returning JSON
                  </li>
                  <li>
                    If data is only in the raw HTML (no JSON anywhere), use the <code className="text-orange-400 text-xs">html-dom</code> method with regex patterns
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-base-content/90">AI prompt to generate a schema:</p>
                  <button
                    type="button"
                    className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(AI_PROMPT);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? '✓ Copied' : 'Copy prompt'}
                  </button>
                </div>
                <pre className="bg-base-300 rounded-lg p-3 text-[11px] leading-relaxed text-base-content/60 overflow-x-auto whitespace-pre-wrap">{AI_PROMPT}</pre>
              </div>
            </div>
          )}
        </div>

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
