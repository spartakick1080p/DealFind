# Contributing to DealFind

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill in values
4. Run migrations: `npm run db:push`
5. Start dev server: `npm run dev`

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Run `npm run lint` before committing
- Write tests for new features

## Database Changes

1. Update `src/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Review the generated SQL
4. Apply migration: `npm run db:push`

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Add tests if applicable
4. Run linter and tests
5. Submit PR with clear description

## Security

- Never commit secrets or credentials
- Use environment variables for sensitive data
- Report security issues privately

## Questions?

Open an issue or reach out to the maintainers.
