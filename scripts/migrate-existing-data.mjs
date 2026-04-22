#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });

const sql = neon(process.env.DATABASE_URL);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('🔄 DealFind Multi-tenancy Migration\n');
  console.log('This script will:');
  console.log('1. Create auth tables (user, session, account, verification)');
  console.log('2. Create a default user account');
  console.log('3. Assign all existing data to that user');
  console.log('4. Add userId columns to existing tables\n');

  const email = await question('Enter your email address: ');
  const name = await question('Enter your name: ');
  
  console.log('\n⚠️  WARNING: This will modify your database!');
  const confirm = await question('Continue? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Migration cancelled');
    rl.close();
    return;
  }

  try {
    console.log('\n📦 Step 1: Creating auth tables...');
    
    // Create user table
    await sql`
      CREATE TABLE IF NOT EXISTS "user" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL,
        "emailVerified" boolean DEFAULT false NOT NULL,
        "image" text,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "user_email_unique" UNIQUE("email")
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "expiresAt" timestamp NOT NULL,
        "token" text NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL,
        "ipAddress" text,
        "userAgent" text,
        "userId" uuid NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS "account" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "accountId" text NOT NULL,
        "providerId" text NOT NULL,
        "userId" uuid NOT NULL,
        "accessToken" text,
        "refreshToken" text,
        "idToken" text,
        "accessTokenExpiresAt" timestamp,
        "refreshTokenExpiresAt" timestamp,
        "scope" text,
        "password" text,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS "verification" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expiresAt" timestamp NOT NULL,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      )
    `;

    console.log('✅ Auth tables created');

    console.log('\n👤 Step 2: Creating default user...');
    const [user] = await sql`
      INSERT INTO "user" (name, email, "emailVerified")
      VALUES (${name}, ${email}, false)
      ON CONFLICT (email) DO UPDATE SET name = ${name}
      RETURNING id
    `;
    
    const userId = user.id;
    console.log(`✅ User created with ID: ${userId}`);

    console.log('\n🔧 Step 3: Adding user_id columns...');
    
    // Add columns as nullable first
    await sql`ALTER TABLE monitored_websites ADD COLUMN IF NOT EXISTS user_id uuid`;
    await sql`ALTER TABLE filters ADD COLUMN IF NOT EXISTS user_id uuid`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS user_id uuid`;
    
    console.log('✅ Columns added');

    console.log('\n📝 Step 4: Assigning existing data to user...');
    
    const [websiteCount] = await sql`
      UPDATE monitored_websites 
      SET user_id = ${userId} 
      WHERE user_id IS NULL
      RETURNING (SELECT COUNT(*) FROM monitored_websites WHERE user_id = ${userId})
    `;
    
    const [filterCount] = await sql`
      UPDATE filters 
      SET user_id = ${userId} 
      WHERE user_id IS NULL
      RETURNING (SELECT COUNT(*) FROM filters WHERE user_id = ${userId})
    `;
    
    const [dealCount] = await sql`
      UPDATE deals 
      SET user_id = ${userId} 
      WHERE user_id IS NULL
      RETURNING (SELECT COUNT(*) FROM deals WHERE user_id = ${userId})
    `;

    console.log(`✅ Assigned ${websiteCount?.count || 0} websites`);
    console.log(`✅ Assigned ${filterCount?.count || 0} filters`);
    console.log(`✅ Assigned ${dealCount?.count || 0} deals`);

    console.log('\n🔒 Step 5: Making user_id required...');
    
    await sql`ALTER TABLE monitored_websites ALTER COLUMN user_id SET NOT NULL`;
    await sql`ALTER TABLE filters ALTER COLUMN user_id SET NOT NULL`;
    await sql`ALTER TABLE deals ALTER COLUMN user_id SET NOT NULL`;
    
    console.log('✅ Constraints added');

    console.log('\n🔗 Step 6: Adding foreign keys...');
    
    // Drop old constraint
    await sql`ALTER TABLE monitored_websites DROP CONSTRAINT IF EXISTS monitored_websites_base_url_unique`;
    
    // Add foreign keys
    await sql`
      ALTER TABLE deals 
      ADD CONSTRAINT deals_user_id_user_id_fk 
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE cascade
    `.catch(() => console.log('  (FK already exists)'));
    
    await sql`
      ALTER TABLE filters 
      ADD CONSTRAINT filters_user_id_user_id_fk 
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE cascade
    `.catch(() => console.log('  (FK already exists)'));
    
    await sql`
      ALTER TABLE monitored_websites 
      ADD CONSTRAINT monitored_websites_user_id_user_id_fk 
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE cascade
    `.catch(() => console.log('  (FK already exists)'));

    // Add unique index
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_user_base_url 
      ON monitored_websites (user_id, base_url)
    `;
    
    console.log('✅ Foreign keys and indexes added');

    console.log('\n✨ Migration complete!\n');
    console.log('Next steps:');
    console.log(`1. Visit http://localhost:3000/signup`);
    console.log(`2. Create an account with email: ${email}`);
    console.log('3. You will have access to all existing data');
    console.log('\n⚠️  Important: Use the EXACT email address above when signing up!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
  } finally {
    rl.close();
  }
}

main();
