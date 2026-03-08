# BucketVore - S3 File Explorer

A modern web-based S3 bucket file explorer built with NestJS, Alpine.js, and server-side rendering.

## Features

- 🗂️ Browse all accessible S3 buckets
- 📁 Folder navigation with breadcrumbs
- 👁️ File previews (images, text, JSON, etc.)
- ⬆️ Upload files and folders
- ⬇️ Download files
- 🗑️ Delete files and folders
- 🔍 Search and filter
- 📊 File metadata display
- 🎨 Modern dark theme UI

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

```bash
# Required
HTTP_PORT=3007                    # Server port

# Optional
AWS_PROFILE=my-profile      # AWS CLI profile for credentials
```

The application will automatically:
- List all S3 buckets accessible with the provided credentials
- Detect the region for each bucket automatically
- Work seamlessly across multiple AWS regions

## Running

```bash
# Development
nx serve app-server-bucketvore

# Production
nx build app-server-bucketvore
node dist/apps/server/bucketvore/main.js
```

## Usage

Navigate to `http://localhost:3001` to access the file explorer interface.

## Architecture

BucketVore uses:
- **NestJS** for the server framework
- **Alpine.js** for reactive UI without build step
- **@onivoro/server-aws-s3** for S3 operations
- **@onivoro/server-html** for type-safe HTML generation
- Server-side rendering for fast initial load

## License

MIT
