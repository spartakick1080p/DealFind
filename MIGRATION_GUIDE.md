# Migration Guide: Adding Authentication to Existing Data

## Problem

You have existing data in your database (websites, filters, deals) that needs to be assigned to a user account.

## Solution

Run the interactive migration script that will safely migrate your data.

## Steps

### 1. Run the Migration Script

```bash
node scripts/migrate-existing-data.mjs
```

The script will ask you:
1. **Your email address** - This will be your login email
2. **Your name** - Your display name
3. **Confirmation** - Type "yes" to proceed

### 2. What the Script Does

The script will:
- ✅ Create auth tables (user, session, account, verification)
- ✅ Create a user account with your email
- ✅ Add `user_id` columns to existing tables
- ✅ Assign ALL existing data to your user account
- ✅ Add foreign key constraints
- ✅ Update unique indexes

### 3. After Migration

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Visit http://localhost:3000

3. You'll be redirected to `/login`

4. Click "Sign up" and create an account using the **EXACT email** you provided to the migration script

5. After signing up, you'll have access to all your existing data!

## Important Notes

⚠️ **Use the exact email address** you provided to the migration script when signing up. This is how the system knows to give you access to the existing data.

⚠️ **Backup your database** before running the migration (optional but recommended):
```bash
# If using Neon, you can create a branch in the Neon dashboard
```

## Troubleshooting

### "User already exists" error
- The migration script can be run multiple times safely
- It will update the existing user instead of creating a new one

### "Cannot find existing data after signup"
- Make sure you used the EXACT email address from the migration
- Check the database to verify user_id was set:
  ```sql
  SELECT * FROM monitored_websites WHERE user_id IS NOT NULL;
  ```

### "Foreign key constraint violation"
- This means some data references don't exist
- The migration script handles this by creating all necessary tables first
- If you see this, try running the script again

## Alternative: Manual Migration

If you prefer to run SQL manually, use the file:
```bash
scripts/migrate-to-multitenancy.sql
```

Edit the file to replace:
- `'your-email@example.com'` with your actual email
- Run it in your database client (Neon SQL Editor, psql, etc.)

## Fresh Start Option

If you want to start completely fresh (delete all existing data):

1. Drop all tables in your database
2. Run:
   ```bash
   npm run db:push
   ```
3. Visit `/signup` to create your first account
4. Start adding websites and filters

## Need Help?

If you encounter issues:
1. Check the error message carefully
2. Verify your DATABASE_URL in .env.local
3. Make sure you have network access to your database
4. Try running the migration script again (it's idempotent)
