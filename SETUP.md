# DealFind Setup & Migration Guide

## What Was Done

### 1. Authentication System (Better Auth)
- Installed Better Auth for modern, type-safe authentication
- Created user authentication tables (user, session, account, verification)
- Set up email/password authentication
- Created login and signup pages
- Added middleware to protect routes

### 2. Multi-tenancy Implementation
- Added `userId` foreign key to all user-owned tables:
  - `monitored_websites`
  - `filters`
  - `deals`
- Updated unique constraints to be scoped per user
- All data is now isolated by user account

### 3. Security Improvements
- Created `.env.example` template (safe to commit)
- Removed sensitive data from version control
- Added route protection middleware
- Session-based authentication

### 4. Documentation
- Professional README with architecture diagrams
- Feature list and tech stack
- Setup instructions
- Security considerations

## Next Steps

### 1. Run Database Migration (For Existing Data)

If you have existing data in your database, use the migration script:

```bash
node scripts/migrate-existing-data.mjs
```

This interactive script will:
- Ask for your email and name
- Create auth tables
- Create a user account for you
- Assign all existing data to your account
- Add userId columns safely

After running the script, sign up at `/signup` using the EXACT email you provided.

### Alternative: Fresh Start (No Existing Data)

If you want to start fresh or have no existing data:

```bash
npm run db:push
```

Then visit `/signup` to create your first account.

### 2. Update Existing Code

You'll need to update your server actions and API routes to:

1. Get the current user ID:
```typescript
import { getUserId } from "@/lib/auth-server";

export async function myAction() {
  const userId = await getUserId(); // Throws if not authenticated
  
  // Use userId in queries
  const websites = await db.query.monitoredWebsites.findMany({
    where: eq(monitoredWebsites.userId, userId),
  });
}
```

2. Filter all queries by userId:
```typescript
// Before
const websites = await db.query.monitoredWebsites.findMany();

// After
const userId = await getUserId();
const websites = await db.query.monitoredWebsites.findMany({
  where: eq(monitoredWebsites.userId, userId),
});
```

3. Include userId when creating records:
```typescript
// Before
await db.insert(monitoredWebsites).values({
  name: "My Website",
  baseUrl: "https://example.com",
});

// After
const userId = await getUserId();
await db.insert(monitoredWebsites).values({
  userId,
  name: "My Website",
  baseUrl: "https://example.com",
});
```

### 3. Update API Routes

Add authentication checks to all API routes:

```typescript
import { getSession } from "@/lib/auth-server";

export async function GET(request: Request) {
  const session = await getSession();
  
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  
  const userId = session.user.id;
  // ... rest of your code
}
```

### 4. Files That Need Updates

Search for these patterns and add userId filtering:

```bash
# Find all database queries
grep -r "db.query" src/app
grep -r "db.insert" src/app
grep -r "db.update" src/app
grep -r "db.delete" src/app
```

Key files to update:
- `src/app/websites/actions.ts`
- `src/app/websites/[id]/actions.ts`
- `src/app/filters/actions.ts`
- `src/app/settings/actions.ts`
- `src/app/api/cron/scrape/route.ts`
- `src/app/api/test-scrape/route.ts`
- All other server actions and API routes

### 5. Testing

1. Start the dev server:
```bash
npm run dev
```

2. Visit http://localhost:3000
3. You'll be redirected to /login
4. Create a new account
5. Test that you can only see your own data

### 6. Data Migration (Optional)

If you have existing data in your database, you'll need to:

1. Create a migration user account
2. Assign all existing data to that user:

```sql
-- Get the user ID after creating an account
SELECT id FROM "user" WHERE email = 'your-email@example.com';

-- Update existing records
UPDATE monitored_websites SET user_id = 'USER_ID_HERE';
UPDATE filters SET user_id = 'USER_ID_HERE';
UPDATE deals SET user_id = 'USER_ID_HERE';
```

## Environment Variables

Make sure these are set in production:

```bash
DATABASE_URL=your-neon-postgres-url
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-32
ENCRYPTION_KEY=generate-with-openssl-rand-hex-32
CRON_SECRET=generate-with-openssl-rand-hex-32
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Security Notes

- Never commit `.env.local` to version control
- Rotate secrets regularly
- Use different secrets for dev/staging/production
- Enable email verification in production
- Consider adding 2FA for sensitive accounts
- Add rate limiting to auth endpoints

## Optional Enhancements

1. **OAuth Providers**: Add Google/GitHub login
2. **Email Verification**: Set up email service
3. **Password Reset**: Add forgot password flow
4. **2FA**: Add two-factor authentication
5. **Session Management**: Add ability to view/revoke sessions
6. **Audit Logs**: Track user actions

## Troubleshooting

### "Cannot read properties of null (reading 'id')"
- User is not authenticated
- Add authentication check with `requireAuth()` or `getUserId()`

### "Foreign key constraint violation"
- Missing userId when inserting records
- Make sure to include userId in all insert operations

### "Unauthorized" errors
- Session expired or invalid
- User needs to log in again
- Check middleware configuration

## For Employers

This project demonstrates:
- Full-stack Next.js development
- Authentication & authorization
- Multi-tenant architecture
- Database design & migrations
- Security best practices
- API design
- TypeScript proficiency
- Modern React patterns
- AWS integration
- Testing practices
