# Quick Start Guide

## For Existing Data (You Have Data Already)

```bash
# 1. Run the migration script
node scripts/migrate-existing-data.mjs

# 2. Follow the prompts (enter your email and name)

# 3. Start the dev server
npm run dev

# 4. Visit http://localhost:3000 and sign up with the SAME email
```

## For Fresh Start (No Existing Data)

```bash
# 1. Push the schema to database
npm run db:push

# 2. Start the dev server
npm run dev

# 3. Visit http://localhost:3000 and sign up
```

## What Changed

### Before (No Auth)
- Anyone could access all data
- No user accounts
- Single-tenant

### After (With Auth)
- Users must log in
- Each user sees only their own data
- Multi-tenant architecture
- Secure and isolated

## Key Files

- `src/lib/auth.ts` - Server auth configuration
- `src/lib/auth-client.ts` - Client auth hooks
- `src/lib/auth-server.ts` - Server helper functions
- `src/middleware.ts` - Route protection
- `src/app/login/page.tsx` - Login page
- `src/app/signup/page.tsx` - Signup page

## Using Auth in Your Code

### In Server Components/Actions

```typescript
import { getUserId } from '@/lib/auth-server';

export async function myAction() {
  const userId = await getUserId(); // Auto-redirects if not logged in
  
  // Query with userId
  const websites = await db.query.monitoredWebsites.findMany({
    where: eq(monitoredWebsites.userId, userId)
  });
}
```

### In Client Components

```typescript
'use client';
import { useSession } from '@/lib/auth-client';

export function MyComponent() {
  const { data: session } = useSession();
  
  if (!session) return <div>Loading...</div>;
  
  return <div>Hello {session.user.name}!</div>;
}
```

### In API Routes

```typescript
import { getSession } from '@/lib/auth-server';

export async function GET(request: Request) {
  const session = await getSession();
  
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const userId = session.user.id;
  // ... your code
}
```

## Environment Variables

Required in `.env.local`:

```bash
DATABASE_URL=your-postgres-url
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-32
ENCRYPTION_KEY=your-encryption-key
CRON_SECRET=your-cron-secret
```

## Common Tasks

### Add a new website (with auth)
```typescript
const userId = await getUserId();
await db.insert(monitoredWebsites).values({
  userId,  // ← Add this!
  name: "My Site",
  baseUrl: "https://example.com"
});
```

### Query websites (with auth)
```typescript
const userId = await getUserId();
const websites = await db.query.monitoredWebsites.findMany({
  where: eq(monitoredWebsites.userId, userId)  // ← Add this!
});
```

### Delete a website (with auth)
```typescript
const userId = await getUserId();
await db.delete(monitoredWebsites)
  .where(
    and(
      eq(monitoredWebsites.id, websiteId),
      eq(monitoredWebsites.userId, userId)  // ← Add this!
    )
  );
```

## Testing

1. Sign up with a test account
2. Add some websites and filters
3. Log out
4. Sign up with a different email
5. Verify you can't see the first user's data

## Deployment Checklist

- [ ] Set `BETTER_AUTH_SECRET` in production
- [ ] Set `NEXT_PUBLIC_APP_URL` to your domain
- [ ] Update all environment variables
- [ ] Test login/signup flow
- [ ] Verify data isolation between users
- [ ] Enable email verification (optional)
- [ ] Add rate limiting (optional)

## Next Steps

1. Run the migration (see above)
2. Update your server actions to use `getUserId()`
3. Test the authentication flow
4. Deploy to production

## Need Help?

- See `MIGRATION_GUIDE.md` for detailed migration steps
- See `SETUP.md` for complete setup instructions
- See `README.md` for project overview
