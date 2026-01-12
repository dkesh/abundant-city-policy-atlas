# Database Migrations

This project uses `node-pg-migrate` for database schema versioning with Neon branching for safe testing.

## Quick Start

### Create a Migration

```bash
npm run migrate:create migration-name
```

This creates a new migration file in `scripts/migrations/` with `up` and `down` functions.

### Run Migrations

**Automatic Migration (Recommended)**

Migrations run automatically:
- **On deploy**: Migrations run during Netlify build process
- **On local dev**: Migrations run before `netlify dev` starts (via `predev` script)

**Workflow:**

1. **Create a Neon branch** for testing (optional but recommended)
   - Go to [Neon Console](https://console.neon.tech)
   - Create a branch from production
   - Copy the branch connection string

2. **Update `.env` file** to point to the branch
   ```bash
   DATABASE_URL="postgres://user:pass@ep-xxx-xxx.region.neon.tech/dbname"
   ```

3. **Launch the webapp** (local) or **deploy** (production)
   - Local: `npm run dev` - migrations run automatically before dev server starts
   - Production: Deploy to Netlify - migrations run during build
   - If migrations fail, the build/dev startup fails

4. **Test your application** with the migrated database

5. **Apply to production** (if testing on branch)
   - Update `.env` to point to production (or use Netlify environment variables)
   - Deploy to Netlify - migrations run automatically during build

**Manual Migration (Alternative)**

If you need to run migrations manually:

```bash
# Run migrations manually
npm run migrate:up

# Check migration status
npm run migrate:status
```

## Available Commands

- `npm run migrate:create <name>` - Create a new migration file
- `npm run migrate:up` - Run all pending migrations manually
- `npm run migrate:down` - Rollback the last migration
- `npm run migrate:status` - List all migrations and their status
- `npm run migrate:verify` - Verify setup (connection, migrations table, etc.)
- `npm run migrate:help` - Show node-pg-migrate help

**Note:** Migrations run automatically during build (`npm run build`) and before dev server starts (`npm run dev`). Manual commands are available if needed.

## Migration File Format

All migrations are stored in `scripts/migrations/` with timestamp-based names (e.g., `1768087948000-description.js`).

Each migration file exports two functions:

```javascript
exports.up = (pgm) => {
  // Apply the migration
  pgm.createTable('users', {
    id: 'id',
    name: { type: 'varchar(255)', notNull: true }
  });
};

exports.down = (pgm) => {
  // Rollback the migration
  pgm.dropTable('users');
};
```

For complex operations, use raw SQL:

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE table_name SET column = 'value' WHERE condition;
  `);
};
```

## Configuration

Migration configuration is in `.migrationsrc.json`:
- Migrations directory: `scripts/migrations`
- Migration tracking table: `pgmigrations`

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (from Neon)
  - Used automatically by node-pg-migrate
  - Can point to a branch or production

## Rollback

If a migration fails or you need to rollback:

```bash
npm run migrate:down
```

Then fix the migration file and run again.

## Troubleshooting

**Migration tracking table doesn't exist**
- Normal! It's created automatically on first migration run

**Database connection fails**
- Verify `DATABASE_URL` is set: `echo $DATABASE_URL`
- Check connection string is correct
- Verify credentials

**Migration fails**
- Check the error message
- Rollback with: `npm run migrate:down`
- Fix the migration file and try again

**Wrong database**
- Double-check which `DATABASE_URL` you're using
- Use `npm run migrate:verify` to see which database you're connected to
- Check the endpoint ID in the connection string

**Migration filename separator**

This project uses migration files with dash separators (e.g., `1768087948000-migration-name.js`), 
but `node-pg-migrate` by default expects underscores. A patch is automatically applied via 
`postinstall` script to support both formats. The patch script (`patch-node-pg-migrate.js`) 
modifies `node-pg-migrate`'s timestamp parsing to accept both `-` and `_` separators.

If you see "Can't determine timestamp" warnings, ensure the patch script ran correctly:
- The patch runs automatically after `npm install` (via `postinstall` script)
- Or run manually: `node scripts/migrations/_helpers/patch-node-pg-migrate.js`

## Best Practices

1. **Always test on a branch first** - Never run migrations directly on production
2. **Use descriptive migration names** - `add-user-table` is better than `migration`
3. **Keep migrations small** - One logical change per migration
4. **Write reversible migrations** - Always implement `down` function
5. **Check status before applying** - Use `npm run migrate:status`
6. **Version control migrations** - Commit migration files to git before applying
7. **Test your application** - Don't just verify migrations, test your app with the migrated database

## Resources

- [node-pg-migrate Documentation](https://salsita.github.io/node-pg-migrate/)
- [Neon Console](https://console.neon.tech)
- `npm run migrate:help` - Command-line help
