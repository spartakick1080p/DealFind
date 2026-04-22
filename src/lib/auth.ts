import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production with email service
  },
  socialProviders: {
    // Add OAuth providers here if needed (GitHub, Google, etc.)
  },
});
