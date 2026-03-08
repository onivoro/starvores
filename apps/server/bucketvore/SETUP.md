# BucketVore Setup Guide

## Overview

BucketVore is an S3 file explorer application that mirrors the architecture of DataVore. It provides a modern web interface for browsing, uploading, downloading, and previewing files in AWS S3 buckets.

## Architecture

### Similarities to DataVore

1. **Server-Side Rendering**: Uses `@onivoro/server-html` for type-safe HTML generation
2. **Alpine.js Frontend**: Reactive UI without build step, loaded from CDN
3. **NestJS Backend**: Modular architecture with controllers and services
4. **Dark Theme UI**: Modern design system with CSS variables
5. **SPA-like Experience**: Fast navigation without page reloads

### Key Differences

1. **Data Source**: S3 buckets instead of MySQL databases
2. **File Operations**: Upload, download, preview instead of SQL queries
3. **Navigation**: Folder-based with breadcrumbs instead of table-based
4. **Preview System**: Supports images, text, video, audio, and PDFs

## Project Structure

```
apps/server/bucketvore/
├── src/
│   ├── app/
│   │   ├── controllers/
│   │   │   ├── app.controller.ts         # Main HTML page
│   │   │   ├── buckets.controller.ts     # Bucket listing API
│   │   │   ├── files.controller.ts       # File operations API
│   │   │   └── upload.controller.ts      # File upload API
│   │   ├── services/
│   │   │   ├── s3.service.ts             # S3 operations wrapper
│   │   │   ├── html-generator.service.ts # HTML generation
│   │   │   └── file-preview.service.ts   # File preview logic
│   │   ├── styles/
│   │   │   └── design-system.ts          # CSS styles
│   │   ├── app-server-bucketvore-config.class.ts
│   │   └── app-server-bucketvore.module.ts
│   ├── assets/                           # Static assets
│   ├── index.ts                          # Bootstrap function
│   └── main.ts                           # Entry point
├── project.json                          # Nx project config
├── package.json                          # Package metadata
├── webpack.config.js                     # Build config
├── tsconfig.json                         # TypeScript config
└── README.md                             # This file
```

## Features

### File Explorer
- 📁 Browse S3 buckets and folders
- 🍞 Breadcrumb navigation
- 🔍 File metadata display (size, modified date)
- 📊 File type icons

### File Operations
- ⬆️ Upload files via drag-and-drop or file picker
- ⬇️ Download files with pre-signed URLs
- 🗑️ Delete files and folders
- 🔄 Refresh current view

### File Preview
- 🖼️ Images (jpg, png, gif, webp, svg, etc.)
- 📄 Text files (txt, md, json, xml, csv, code files)
- 🎥 Videos (mp4, webm, ogg, mov)
- 🎵 Audio (mp3, wav, ogg, flac)
- 📕 PDFs

### UI/UX
- 🌙 Dark theme with modern design
- ⚡ Fast, SPA-like navigation
- 📱 Responsive layout
- ♿ Accessible controls

## Configuration

### Environment Variables

```bash
# Required
HTTP_PORT=3007                    # Server port

# Optional
AWS_PROFILE=my-profile      # AWS CLI profile for credentials
```

The application dynamically:
- Lists all S3 buckets that are accessible with the provided AWS credentials
- Auto-detects each bucket's region using the S3 API
- Creates region-specific S3 clients as needed for optimal performance

No region configuration needed - it's all automatic!

### AWS Credentials

BucketVore uses the AWS SDK's standard credential chain:

1. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. AWS profile (if `AWS_PROFILE` is set)
3. EC2 instance metadata
4. ECS task credentials

For local development, either:
- Set environment variables
- Configure `AWS_PROFILE` to use `~/.aws/credentials`

## Development

### Prerequisites

- Node.js >= 18.0.0
- AWS credentials configured
- Access to S3 bucket(s)

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
# Using Nx
nx serve app-server-bucketvore

# Using the local target
nx run app-server-bucketvore:local

# Or set environment variables
HTTP_PORT=3007 nx serve app-server-bucketvore
```

### Build for Production

```bash
nx build app-server-bucketvore --configuration=production
```

### Run Production Build

```bash
node dist/apps/server/bucketvore/main.js
```

## API Endpoints

### GET /
Returns the main HTML application page

### GET /api/buckets
Returns HTML list of available S3 buckets

### GET /api/files?bucket=BUCKET&prefix=PREFIX
Returns JSON with file list and breadcrumbs:
```json
{
  "filesHtml": "...",
  "breadcrumbsHtml": "...",
  "objects": 10,
  "folders": 3
}
```

### GET /api/files/preview?bucket=BUCKET&key=KEY
Returns HTML preview of file

### GET /api/files/download?bucket=BUCKET&key=KEY
Returns pre-signed download URL:
```json
{
  "url": "https://..."
}
```

### POST /api/files/delete
Deletes a single file:
```json
{
  "bucket": "my-bucket",
  "key": "path/to/file.txt"
}
```

### POST /api/files/delete-folder
Deletes folder and all contents:
```json
{
  "bucket": "my-bucket",
  "prefix": "path/to/folder/"
}
```

### POST /api/upload
Uploads a file (multipart/form-data):
- `file`: File to upload
- `bucket`: Target bucket
- `prefix`: Optional folder prefix

## Services

### S3Service
Wraps AWS S3 SDK operations:
- `listBuckets()`: Get all accessible buckets
- `listObjects(prefix, bucket)`: List objects in folder
- `getObject(key, bucket)`: Download object
- `getObjectMetadata(key, bucket)`: Get object metadata
- `uploadObject(key, body, contentType, bucket)`: Upload file
- `deleteObject(key, bucket)`: Delete single object
- `deleteFolder(prefix, bucket)`: Delete folder recursively
- `getPresignedDownloadUrl()`: Generate download URL
- `getPresignedViewUrl()`: Generate preview URL

### HtmlGeneratorService
Generates HTML fragments:
- `generateBucketsListHtml()`: Bucket list sidebar
- `generateBreadcrumbs()`: Navigation breadcrumbs
- `generateFileListHtml()`: File/folder listing
- `generateFilePreviewHtml()`: File preview modal
- `generateErrorHtml()`: Error messages
- `generateLoadingHtml()`: Loading states

### FilePreviewService
File type detection and preview logic:
- `canPreview(extension)`: Check if file can be previewed
- `getPreviewType(extension)`: Determine preview type
- `getFileIcon(extension)`: Get emoji icon for file type
- `generateTextPreview()`: Format text content
- `formatJson()`: Pretty-print JSON

## Technologies

- **NestJS**: Backend framework
- **Alpine.js 3**: Reactive frontend
- **AWS SDK v3**: S3 operations
- **TypeScript**: Type safety
- **Webpack**: Build tool
- **Nx**: Monorepo tooling

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6+ features required
- No IE11 support

## Security Considerations

1. **Pre-signed URLs**: Download/preview URLs expire after 1 hour
2. **Credential Management**: Uses AWS SDK credential chain
3. **Input Validation**: File keys are validated before operations
4. **CORS**: Configure S3 bucket CORS if accessing from different domain

## Troubleshooting

### "Error loading buckets"
- Check AWS credentials are configured
- Verify IAM permissions include `s3:ListAllMyBuckets`

### "Error loading files"
- Check bucket exists and is accessible
- Verify IAM permissions include `s3:ListBucket`

### "Error uploading file"
- Check IAM permissions include `s3:PutObject`
- Verify bucket allows uploads

### "Preview not available"
- File type may not support preview
- Large files may timeout - try downloading instead

## IAM Permissions

Minimum required permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

## Future Enhancements

- [ ] Search/filter files
- [ ] Bulk operations
- [ ] Copy/move files between buckets
- [ ] Object versioning support
- [ ] Access control (ACL) management
- [ ] Folder creation
- [ ] File renaming
- [ ] Grid view mode
- [ ] Sorting options
- [ ] Storage class management

## License

MIT
