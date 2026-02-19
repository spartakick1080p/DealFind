'use client';

import { useState } from 'react';
import SchemaEditor from './schema-editor';

interface Props {
  websiteId: string;
  initialSchema: string | null;
}

export default function WebsiteSchemaToggle({ websiteId, initialSchema }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`btn btn-xs ${initialSchema ? 'btn-accent' : 'btn-ghost'}`}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide Schema' : 'Schema'}
      </button>
      {open && (
        <div className="w-full mt-2">
          <SchemaEditor websiteId={websiteId} initialSchema={initialSchema} />
        </div>
      )}
    </>
  );
}
