# BucketVore Quick Start

## Configuration

BucketVore only requires one optional environment variable:

```bash
AWS_PROFILE=myprofile   # Optional: AWS CLI profile name
```

**That's it!** No region configuration needed - bucket regions are auto-detected!

## How It Works

1. **Launch the app** - BucketVore loads and fetches all S3 buckets you have access to
2. **Select a bucket** - Click any bucket in the sidebar to browse its contents
3. **Navigate folders** - Click folders to dive deeper, use breadcrumbs to go back
4. **Manage files** - Upload, download, preview, and delete files

## Quick Commands

```bash
# Run locally (minimal)
HTTP_PORT=3007 nx serve app-server-bucketvore

# With AWS profile
HTTP_PORT=3007 AWS_PROFILE=myprofile nx serve app-server-bucketvore

# Build
nx build app-server-bucketvore --configuration=production

# Run production build
HTTP_PORT=3007 node dist/apps/server/bucketvore/main.js
```

## User Workflow

```
1. Open http://localhost:3001
2. See list of all accessible buckets in left sidebar
3. Click a bucket → view its contents in main area
4. Click folders → navigate deeper
5. Click files → preview (if supported) or download
6. Upload button → drag & drop or select files
7. Delete button → remove files/folders
```

## Features at a Glance

- ✅ Auto-discovers all accessible S3 buckets
- ✅ Auto-detects bucket regions (works across all AWS regions!)
- ✅ No hardcoded bucket names or regions needed
- ✅ Works with any AWS credential method
- ✅ Dynamic bucket switching
- ✅ Full file management capabilities
- ✅ File previews for common formats
- ✅ Modern, responsive UI

## Minimal IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListAllMyBuckets"],
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
        "arn:aws:s3:::*",
        "arn:aws:s3:::*/*"
      ]
    }
  ]
}
```
