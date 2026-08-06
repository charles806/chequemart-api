# Database Migrations

## Running Migrations

```bash
npm run migrate       # Run pending migrations
npm run migrate:undo  # Rollback last migration
npm run migrate:status # Check migration status
```

## Creating Migrations

```bash
npx sequelize-cli migration:generate --name migration-name
```

## Rollback

To rollback all migrations:
```bash
npx sequelize-cli db:migrate:undo:all
```

To rollback to a specific migration:
```bash
npx sequelize-cli db:migrate:undo --name 001-add-escrow-statuses.js
```
