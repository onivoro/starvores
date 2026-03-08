# DataVore Server Application

A NestJS-based database exploration and query tool that provides web-based access to any TypeORM-supported database.

## Description

DataVore is a powerful database inspection server that allows you to connect to various database systems (PostgreSQL, MySQL, MariaDB, etc.) and explore their structure and data through a web interface. It provides RESTful endpoints for listing tables, viewing table structures, browsing data, and executing custom SQL queries.

## Installation

```bash
npm install @onivoro/app-server-datavore
```

## Usage

### As a CLI Tool

```bash
npx datavore
```

### Programmatic Usage

```javascript
import { bootstrap } from '@onivoro/app-server-datavore';

// Start the server
bootstrap();
```

## Configuration

The application requires the following environment variables for database connection:

- `DV_TYPE` - Database type (postgres, mysql, mariadb, etc.)
- `DV_HOST` - Database host address
- `DV_PORT` - Database port number
- `DV_DB` - Database name
- `DV_USER` - Database username
- `DV_PASSWORD` - Database password

Optional configuration:
- `PORT` - HTTP server port (defaults to 3000)
- `DV_SYNCHRONIZE` - TypeORM synchronize option (true/false)
- `DV_SSL` - SSL connection (true/false)
- `DV_POOL_MIN` - Minimum connection pool size
- `DV_POOL_MAX` - Maximum connection pool size

### Example Configuration

```bash
# PostgreSQL example
export DV_TYPE=postgres
export DV_HOST=localhost
export DV_PORT=5432
export DV_DB=mydatabase
export DV_USER=myuser
export DV_PASSWORD=mypassword
export PORT=3333

npx datavore
```

## API Endpoints

DataVore provides the following RESTful endpoints:

### Database Information
- `GET /api/tables/debug/info` - Returns database connection information

### Table Operations
- `GET /api/tables` - Lists all tables in the connected database
- `GET /api/table/:tableName` - Retrieves data from a specific table
- `GET /api/table/:tableName/structure` - Shows the structure/schema of a specific table

### Query Execution
- `POST /api/query` - Executes custom SQL queries
  ```json
  {
    "query": "SELECT * FROM users WHERE created_at > '2023-01-01'"
  }
  ```

## Features

- **Universal Database Support**: Connect to any TypeORM-supported database
- **Web-Based Interface**: HTML responses for direct browser usage
- **Table Exploration**: List tables, view structures, and browse data
- **Query Execution**: Run custom SQL queries safely
- **Connection Pooling**: Efficient database connection management
- **Modular Architecture**: Clean separation of concerns with NestJS modules

## Security Considerations

⚠️ **Warning**: DataVore provides direct database access. Consider the following security measures:

1. **Access Control**: Implement authentication/authorization if exposing to networks
2. **Read-Only Access**: Use database users with minimal privileges when possible
3. **Network Security**: Deploy behind a firewall or VPN for production use
4. **Environment Variables**: Secure database credentials properly
5. **Query Validation**: Be cautious with custom query execution in production

## Use Cases

- **Development**: Quick database inspection during development
- **Debugging**: Troubleshoot data issues without complex database clients
- **Integration Testing**: Verify database state in automated tests
- **Admin Tools**: Embed in internal admin panels for data viewing
- **Data Validation**: Quick checks on data integrity and consistency

## Development

This package is part of the Onivoro monorepo and is built using Nx.

### Building

```bash
nx build server-datavore
```

### Running in Development

```bash
nx serve server-datavore
```

### Testing

```bash
nx test server-datavore
```

## License

MIT