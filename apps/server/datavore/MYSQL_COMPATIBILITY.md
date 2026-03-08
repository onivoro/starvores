# MySQL Compatibility for Datavore Application

## Changes Made

The datavore application has been updated to support both PostgreSQL and MySQL databases without breaking existing PostgreSQL functionality.

### Key Improvements

1. **Database Type Detection**: The application now detects the database type from `dataSource.options.type` and uses appropriate SQL queries.

2. **Database-Specific Queries**:
   - **PostgreSQL**: Uses `$1`, `$2` parameter placeholders and `"table_name"` syntax
   - **MySQL**: Uses `?` parameter placeholders and `\`table_name\`` syntax
   - **SQLite**: Basic support added as fallback

3. **Information Schema Compatibility**:
   - **PostgreSQL**: Queries `information_schema` with `table_schema = 'public'`
   - **MySQL**: Queries `information_schema` with `table_schema = DATABASE()`

### Modified Files

- `apps/server/datavore/src/app/services/table.service.ts`: Main service with database-agnostic logic
- `apps/server/datavore/src/app/controllers/tables.controller.ts`: Added debug endpoint

### New Features

1. **Database Info Endpoint**: `GET /api/tables/debug/info` returns database type and connection status
2. **Enhanced Error Handling**: Better error messages with database type context
3. **Logging**: Added console logging for debugging database operations

### Supported Operations

✅ **PostgreSQL**:
- List tables
- Show table data
- Display table structure (columns, primary keys, foreign keys, indices)

✅ **MySQL**:
- List tables
- Show table data
- Display table structure (columns, primary keys, foreign keys, indices)

⚠️ **Other Databases**:
- Basic table listing and data display
- Limited structure information

### Configuration

Set the `DV_TYPE` environment variable to match your database:
- `postgres` for PostgreSQL
- `mysql` for MySQL
- Other TypeORM-supported types as fallback

### Example Environment Variables

```bash
# For PostgreSQL (existing)
DV_TYPE=postgres
DV_HOST=localhost
DV_PORT=5432
DV_USER=postgres
DV_PASSWORD=password
DV_DB=myapp

# For MySQL (new support)
DV_TYPE=mysql
DV_HOST=localhost
DV_PORT=3306
DV_USER=root
DV_PASSWORD=password
DV_DB=myapp
```

### Testing

The application can be tested with both database types by:
1. Setting appropriate environment variables
2. Running the application
3. Visiting `/api/tables/debug/info` to verify database type detection
4. Using the UI to browse tables and data

### Future Enhancements

- Support for more database-specific features
- Query optimization for each database type
- Enhanced metadata extraction for database-specific types
