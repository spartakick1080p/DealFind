#!/bin/bash

echo "=== Files with database queries that need userId filtering ==="
echo ""

echo "Server Actions:"
grep -l "db\." src/app/**/actions.ts 2>/dev/null | sort

echo ""
echo "API Routes:"
grep -l "db\." src/app/api/**/route.ts 2>/dev/null | sort

echo ""
echo "Page Components:"
grep -l "db\." src/app/**/page.tsx 2>/dev/null | sort

echo ""
echo "=== Search for these patterns and add userId filtering ==="
echo "1. db.query.monitoredWebsites"
echo "2. db.query.filters"
echo "3. db.query.deals"
echo "4. db.insert(monitoredWebsites)"
echo "5. db.insert(filters)"
echo "6. db.insert(deals)"
echo ""
echo "Add this to each file:"
echo "  import { getUserId } from '@/lib/auth-server';"
echo "  const userId = await getUserId();"
echo ""
