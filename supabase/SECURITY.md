# Supabase Security Configuration

This document outlines the security measures implemented in the Supabase database schema.

## 🔐 Row Level Security (RLS)

All tables have Row Level Security **ENABLED** to ensure users can only access their authorized data.

### Users Table Security

**CRITICAL**: The `encrypted_private_key` column contains sensitive encrypted data and is **NEVER** exposed to other users.

#### Policies:

1. **"Users can read own profile only"**
   - Users can ONLY read their own full profile
   - `USING (auth.uid() = uid)`
   - Includes access to `encrypted_private_key` for their own account

2. **"Users can update own profile"**
   - Users can only update their own data
   - `USING (auth.uid() = uid)`

3. **"Users can insert own profile"**
   - Users can create their own profile on signup
   - `WITH CHECK (auth.uid() = uid)`

#### Public User Information

For accessing public user info (contacts, sharing, etc.), use the **`users_public` view**:

```sql
-- Safe view that excludes encrypted_private_key
CREATE VIEW users_public AS
SELECT
  uid,
  email,
  display_name,
  public_key,
  created_at,
  theme
FROM users;
```

**What's exposed:**
- ✅ uid (for identification)
- ✅ email (for contact lookup)
- ✅ display_name (for UI display)
- ✅ public_key (for encryption/sharing)
- ✅ created_at (metadata)
- ✅ theme (preference)

**What's protected:**
- 🔒 encrypted_private_key (NEVER exposed to other users)
- 🔒 terms_accepted_at (private)
- 🔒 column_visibility (private settings)
- 🔒 show_print_warning (private settings)
- 🔒 key_version (internal)
- 🔒 last_modified (internal)

### Files Table Security

1. **"Users can read own or shared files"**
   - Read files you own OR files shared with you
   - `USING (owner = auth.uid() OR auth.uid() = ANY(shared_with))`

2. **"Users can insert own files"**
   - Only create files you own
   - `WITH CHECK (owner = auth.uid())`

3. **"Users can update own files"**
   - Only update files you own
   - `USING (owner = auth.uid())`

4. **"Users can delete own files"**
   - Only delete files you own
   - `USING (owner = auth.uid())`

### Folders Table Security

1. **"Users can read own folders"**
   - `USING (owner = auth.uid())`

2. **"Users can insert own folders"**
   - `WITH CHECK (owner = auth.uid())`

3. **"Users can update own folders"**
   - `USING (owner = auth.uid())`

4. **"Users can delete own folders"**
   - `USING (owner = auth.uid())`

### Contacts Table Security

1. **"Users can read own contacts"**
   - Read contacts where you're either user
   - `USING (user_id_1 = auth.uid() OR user_id_2 = auth.uid())`

2. **"Users can create contacts"**
   - Create contacts where you're one of the users
   - `WITH CHECK (user_id_1 = auth.uid() OR user_id_2 = auth.uid())`

3. **"Users can update own contacts"**
   - Update contacts you're part of
   - `USING (user_id_1 = auth.uid() OR user_id_2 = auth.uid())`

4. **"Users can delete own contacts"**
   - Delete contacts you're part of
   - `USING (user_id_1 = auth.uid() OR user_id_2 = auth.uid())`

### Contact Requests Table Security

1. **"Users can read own contact requests"**
   - Read requests you sent or received
   - `USING (from_user_id = auth.uid() OR to_user_id = auth.uid())`

2. **"Users can create contact requests"**
   - Only send requests from your account
   - `WITH CHECK (from_user_id = auth.uid())`

3. **"Users can update own contact requests"**
   - Update requests you're involved in
   - `USING (from_user_id = auth.uid() OR to_user_id = auth.uid())`

4. **"Users can delete own contact requests"**
   - Only delete requests you sent
   - `USING (from_user_id = auth.uid())`

## 🗄️ Storage Security

### Files Bucket Policies

The `files` storage bucket has RLS policies ensuring users can only access their own files:

1. **"Users can upload own files"**
   ```sql
   bucket_id = 'files' AND
   auth.uid()::text = (storage.foldername(name))[1]
   ```

2. **"Users can read own files"**
   - Only read files in your user folder

3. **"Users can update own files"**
   - Only update your own files

4. **"Users can delete own files"**
   - Only delete your own files

**Storage Path Convention:**
```
files/
  ├── {userId}/
  │   ├── {fileId1}
  │   ├── {fileId2}
  │   └── ...
  └── {userId2}/
      └── ...
```

## 🛡️ Data Integrity Constraints

### Check Constraints

1. **users.theme**
   - `CHECK (theme IN ('light', 'dark'))`
   - Ensures only valid theme values

2. **contacts.different_users**
   - `CHECK (user_id_1 != user_id_2)`
   - Prevents self-contacts

3. **contacts.status**
   - `CHECK (status IN ('pending', 'accepted', 'blocked'))`
   - Ensures valid contact status

4. **contact_requests.status**
   - `CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'))`
   - Ensures valid request status

### Unique Constraints

1. **users.email**
   - `UNIQUE` - One account per email

2. **contacts unique pair**
   - `UNIQUE INDEX idx_contacts_unique_pair ON contacts (LEAST(user_id_1, user_id_2), GREATEST(user_id_1, user_id_2))`
   - Prevents duplicate contact pairs (user1, user2) and (user2, user1)

### Foreign Key Constraints

All tables have proper foreign key relationships with CASCADE deletes:

- `files.owner` → `users.uid` (ON DELETE CASCADE)
- `files.parent` → `folders.id` (ON DELETE SET NULL)
- `folders.owner` → `users.uid` (ON DELETE CASCADE)
- `folders.parent` → `folders.id` (ON DELETE CASCADE)
- `contacts.user_id_1/2` → `users.uid` (ON DELETE CASCADE)
- `contact_requests.from_user_id/to_user_id` → `users.uid` (ON DELETE CASCADE)

## 🔍 Testing RLS Policies

### Test as Specific User

```sql
-- Set the user context (use actual user UUID)
SET request.jwt.claim.sub = 'user-uuid-here';

-- Try to read users table
SELECT * FROM users;
-- Should only see your own profile

-- Try to read another user's profile
SELECT * FROM users WHERE uid = 'other-user-uuid';
-- Should return empty (access denied)

-- Try to read public info
SELECT * FROM users_public WHERE uid = 'other-user-uuid';
-- Should work! (but no encrypted_private_key)
```

### Verify Policies

```sql
-- List all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

## 🚨 Security Best Practices

### DO:
- ✅ Always use `auth.uid()` in RLS policies
- ✅ Use the `users_public` view for public user data
- ✅ Test policies with different user contexts
- ✅ Keep `encrypted_private_key` strictly private
- ✅ Use `anon` key for client-side (it's safe with RLS)

### DON'T:
- ❌ Never expose `service_role` key to client
- ❌ Never disable RLS on tables with sensitive data
- ❌ Don't query `users` table for other users' data
- ❌ Don't trust client-side data validation alone
- ❌ Never store unencrypted sensitive data

## 📊 Security Audit Checklist

- [ ] All tables have RLS enabled
- [ ] All policies use `auth.uid()` for authorization
- [ ] `encrypted_private_key` is never exposed to other users
- [ ] Storage policies match database policies
- [ ] Foreign keys have appropriate CASCADE settings
- [ ] Check constraints enforce data integrity
- [ ] `anon` key is used for client (not `service_role`)
- [ ] Test policies with multiple user contexts

## 🔧 Monitoring

### Check for RLS Violations

```sql
-- Monitor failed queries (requires pg_stat_statements)
SELECT query, calls, total_exec_time
FROM pg_stat_statements
WHERE query LIKE '%users%'
  AND calls > 100
ORDER BY total_exec_time DESC;
```

### Audit User Access

```sql
-- See which users are accessing what
SELECT usename, application_name, state, query
FROM pg_stat_activity
WHERE datname = current_database();
```

## 📞 Security Incident Response

If you suspect a security breach:

1. **Immediately** rotate your `anon` and `service_role` keys
2. Check audit logs for unauthorized access
3. Review RLS policies for gaps
4. Update user passwords if needed
5. Contact Supabase support if data may be compromised

## 🔗 Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/security)
