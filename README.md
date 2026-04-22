# DealFind

A full-stack web application for monitoring e-commerce websites and tracking price drops. Built with Next.js 16, Better Auth, and Drizzle ORM.

## Features

- **Multi-tenant Architecture** - Secure user authentication with isolated data per user
- **Website Monitoring** - Track multiple e-commerce sites with custom scraping schedules
- **Smart Filtering** - Create custom filters based on discount thresholds, price limits, keywords, and categories
- **Real-time Notifications** - Get notified when deals match your criteria
- **Webhook Integration** - Send deal notifications to Discord, Slack, or custom endpoints
- **Automated Scraping** - Schedule periodic scrapes using AWS EventBridge
- **Deal History** - Track scrape runs, success rates, and historical deal data
- **Progressive Web App** - Install as a mobile app with offline support

## Tech Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TailwindCSS 4** - Utility-first CSS
- **DaisyUI** - Component library
- **Headless UI** - Accessible UI components

### Backend
- **Better Auth** - Modern authentication with email/password
- **Drizzle ORM** - Type-safe database queries
- **Neon Postgres** - Serverless PostgreSQL database
- **AWS SDK** - EventBridge Scheduler, SNS, SQS, Lambda

### Testing
- **Vitest** - Unit testing framework
- **Fast-check** - Property-based testing

## Architecture

```
┌─────────────────┐
│   Next.js App   │
│   (Frontend)    │
└────────┬────────┘
         │
         ├─── Better Auth (Authentication)
         │
         ├─── API Routes
         │    ├─ /api/auth/[...all]
         │    ├─ /api/cron/scrape
         │    ├─ /api/test-scrape
         │    └─ /api/scrape-runs
         │
         ├─── Server Actions
         │    ├─ Website Management
         │    ├─ Filter Management
         │    └─ Webhook Management
         │
         └─── Database (Neon Postgres)
              ├─ Users & Sessions
              ├─ Monitored Websites
              ├─ Filters & Deals
              └─ Notifications

┌──────────────────────────────────┐
│   AWS Infrastructure (Optional)   │
├──────────────────────────────────┤
│  EventBridge → Lambda → API      │
│  (Scheduled Scraping)            │
└──────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
- AWS account (optional, for scheduled scraping)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dealfind.git
cd dealfind
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your configuration:
- `DATABASE_URL` - Your Neon Postgres connection string
- `BETTER_AUTH_SECRET` - Generate with `openssl rand -base64 32`
- `ENCRYPTION_KEY` - Generate with `openssl rand -hex 32`
- `CRON_SECRET` - Generate with `openssl rand -hex 32`

4. Run database migrations:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the app.

## Database Schema

The application uses a multi-tenant architecture where all data is scoped to individual users:

- **user** - User accounts and profiles
- **session** - Active user sessions
- **monitored_websites** - Websites to scrape (per user)
- **product_page_urls** - Specific URLs to monitor
- **filters** - Custom deal filters (per user)
- **deals** - Found deals matching filters
- **notifications** - User notifications
- **webhooks** - Webhook integrations
- **scrape_runs** - Scraping history and metrics

## Key Features Explained

### Authentication & Multi-tenancy

Built with Better Auth, providing:
- Email/password authentication
- Secure session management
- User isolation - all data is scoped to the authenticated user
- No user can access or modify another user's websites, filters, or deals

### Website Scraping

The scraper supports:
- Custom product schemas (JSON-LD, microdata, or custom selectors)
- Authentication tokens for protected sites
- Configurable scrape intervals (cron expressions)
- Error tracking and retry logic
- Progress tracking for long-running scrapes

### Filter Engine

Create sophisticated filters with:
- Minimum discount percentage
- Maximum price threshold
- Keyword matching (product names, brands)
- Category inclusion/exclusion
- Filter assignment at website or URL level

### Webhook Notifications

Send deal notifications to:
- Discord channels
- Slack workspaces
- Custom webhook endpoints
- Encrypted credential storage

## Development

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

### Database Management

```bash
npm run db:generate   # Generate migrations
npm run db:migrate    # Run migrations
npm run db:push       # Push schema changes
npm run db:studio     # Open Drizzle Studio
```

### Code Quality

```bash
npm run lint          # Run ESLint
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Environment Variables for Production

Make sure to set these in your production environment:
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL`
- AWS credentials (if using scheduled scraping)

## Security Considerations

- All sensitive data (auth tokens, webhook URLs) is encrypted at rest using AES-256-GCM
- User data is completely isolated - no cross-user data access
- API routes are protected with authentication checks
- Cron endpoints require secret token authentication
- Environment variables are never committed to version control

## Future Enhancements

- [ ] Email notifications
- [ ] SMS notifications via AWS SNS
- [ ] OAuth providers (Google, GitHub)
- [ ] Price history charts
- [ ] Browser extension
- [ ] Mobile app (React Native)
- [ ] AI-powered deal recommendations
- [ ] Multi-language support

## License

MIT

## Author

[Your Name](https://github.com/yourusername)

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Authentication by [Better Auth](https://better-auth.com/)
- Database by [Neon](https://neon.tech/)
- ORM by [Drizzle](https://orm.drizzle.team/)
