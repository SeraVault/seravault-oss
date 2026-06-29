# Supabase Setup for Seravault

This directory contains the Supabase configuration and database migrations for Seravault.

## Quick Start

### 1. Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Linux
curl -sL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar xz
sudo mv supabase /usr/local/bin/

# Windows
scoop install supabase
```

### 2. Initialize Local Development

```bash
# Initialize Supabase in your project (if not already done)
supabase init

# Start local Supabase instance
supabase start
```

This will start:
- PostgreSQL database on `postgresql://postgres:postgres@localhost:54322/postgres`
- Supabase Studio on `http://localhost:54323`
- API Gateway on `http://localhost:54321`

### 3. Get Your Credentials

After running `supabase start`, you'll see output like:

```
API URL: http://localhost:54321
anon key: eyJhbGc...
service_role key: eyJhbGc...
```

### 4. Configure Environment Variables

Add to your `.env` file:

```env
VITE_BACKEND_TYPE=supabase
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your-anon-key-from-supabase-start
```

### 5. Run Migrations

```bash
# Apply migrations to local database
supabase db reset

# Or apply specific migration
supabase migration up
```

## Production Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose your organization and region
4. Set database password

### 2. Get Production Credentials

1. Go to Project Settings → API
2. Copy your `Project URL` and `anon public` key
3. Add to production `.env`:

```env
VITE_BACKEND_TYPE=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key
```

### 3. Link Local to Remote

```bash
# Link to your remote project
supabase link --project-ref your-project-ref

# Push migrations to production
supabase db push
```

## Database Schema

The initial migration creates:

- **users** - User profiles with encrypted key pairs
- **files** - Encrypted file metadata
- **folders** - Encrypted folder hierarchy
- **contacts** - User contact relationships
- **contact_requests** - Pending contact requests

All tables include:
- Row Level Security (RLS) policies
- Proper indexes for performance
- Automatic timestamp updates
- Foreign key constraints

## Storage Buckets

A `files` storage bucket is created for storing encrypted file data.

**Storage policies ensure:**
- Users can only access their own files
- Encrypted files are stored with path: `{userId}/{fileId}`

## Creating New Migrations

```bash
# Create a new migration
supabase migration new your_migration_name

# Edit the file in supabase/migrations/
# Then apply it
supabase migration up
```

## Useful Commands

```bash
# Check migration status
supabase migration list

# Reset database to clean state
supabase db reset

# View database in Studio
supabase studio

# Generate TypeScript types from database
supabase gen types typescript --local > src/types/supabase.ts

# Stop local Supabase
supabase stop
```

## Performance Tips

### 1. Partitioning (For 100M+ rows)

If your files table grows beyond 100M rows, consider partitioning:

```sql
-- Partition by user ID hash
ALTER TABLE files RENAME TO files_old;

CREATE TABLE files (LIKE files_old INCLUDING ALL)
PARTITION BY HASH(owner);

-- Create 8 partitions
CREATE TABLE files_p0 PARTITION OF files FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE files_p1 PARTITION OF files FOR VALUES WITH (MODULUS 8, REMAINDER 1);
-- ... etc
```

### 2. Connection Pooling

Supabase includes PgBouncer. Use the "connection pooling" URL in production:

```env
# Use this for high-traffic applications
VITE_SUPABASE_URL=https://your-project.supabase.co:6543
```

### 3. Indexes

The migration includes essential indexes. Monitor query performance with:

```sql
-- Find slow queries
SELECT * FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;
```

## Monitoring

### Supabase Dashboard

- **Database** → Query performance
- **Storage** → File storage usage
- **Logs** → Real-time logs
- **Reports** → Usage metrics

### Database Size

```sql
-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Troubleshooting

### Local Supabase Won't Start

```bash
# Stop and remove containers
supabase stop --no-backup
docker system prune

# Start fresh
supabase start
```

### Migration Errors

```bash
# Rollback last migration
supabase migration down

# Reset to clean state
supabase db reset
```

### RLS Policy Issues

Check policies in Supabase Studio → Authentication → Policies

Test with:
```sql
-- Test as specific user
SET request.jwt.claim.sub = 'user-id-here';
SELECT * FROM files;
```

## Migration from Firebase

See [MIGRATION.md](../docs/MIGRATION.md) for detailed migration guide.

## Further Reading

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
