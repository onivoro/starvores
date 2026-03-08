import { Injectable } from '@nestjs/common';
import { $div, $span, $button, $a, $p, $h3, $em, $pre, $code, $img, $video, $audio, $iframe } from '@onivoro/server-html';
import { S3Object } from './s3.service';
import { FilePreviewService } from './file-preview.service';

@Injectable()
export class HtmlGeneratorService {
  constructor(private readonly filePreviewService: FilePreviewService) {}

  generateBucketsListHtml(buckets: { name: string; creationDate?: Date }[]): string {
    if (!buckets || buckets.length === 0) {
      return $div({
        className: 'empty-state',
        children: [
          $div({ className: 'empty-state-icon', textContent: '🪣' }),
          $p({ textContent: 'No buckets found' })
        ]
      });
    }

    const bucketElements = buckets.map(bucket =>
      $div({
        className: 'bucket-item',
        'data-bucket-name': bucket.name,
        '@click': 'selectBucket($el.dataset.bucketName)',
        children: [
          $div({ className: 'bucket-icon', textContent: '🪣' }),
          $div({
            className: 'bucket-info',
            children: [
              $div({ className: 'bucket-name', textContent: bucket.name }),
              bucket.creationDate ? $div({
                className: 'bucket-date',
                textContent: new Date(bucket.creationDate).toLocaleDateString()
              }) : ''
            ].filter(Boolean)
          })
        ]
      })
    );

    return bucketElements.join('');
  }

  generateBreadcrumbs(prefix: string, bucket: string): string {
    const parts = prefix ? prefix.split('/').filter(Boolean) : [];

    const breadcrumbs = [
      $button({
        className: 'breadcrumb-item',
        '@click': 'navigateToFolder(\'\')',
        textContent: '🪣 ' + bucket
      })
    ];

    let currentPath = '';
    parts.forEach((part, index) => {
      currentPath += part + '/';
      breadcrumbs.push(
        $span({ className: 'breadcrumb-separator', textContent: '/' })
      );
      breadcrumbs.push(
        $button({
          className: 'breadcrumb-item',
          'data-path': currentPath,
          '@click': 'navigateToFolder($el.dataset.path)',
          textContent: part
        })
      );
    });

    return $div({
      className: 'breadcrumbs',
      children: breadcrumbs
    });
  }

  generateFileListHtml(
    objects: S3Object[],
    folders: string[],
    s3Service: any,
    currentPrefix: string = ''
  ): string {
    if (folders.length === 0 && objects.length === 0) {
      return $div({
        className: 'empty-state',
        children: [
          $div({ className: 'empty-state-icon', textContent: '📂' }),
          $p({ textContent: 'This folder is empty' })
        ]
      });
    }

    const folderElements = folders.map(folderPrefix => {
      const folderName = s3Service.getFolderName(folderPrefix);
      return $div({
        className: 'file-item folder',
        'data-folder-path': folderPrefix,
        '@click': 'navigateToFolder($el.dataset.folderPath)',
        children: [
          $div({ className: 'file-icon', textContent: '📁' }),
          $div({
            className: 'file-info',
            children: [
              $div({ className: 'file-name', textContent: folderName }),
              $div({ className: 'file-meta', textContent: 'Folder' })
            ]
          }),
          $div({
            className: 'file-actions',
            children: [
              $button({
                className: 'btn-icon',
                'data-folder-path': folderPrefix,
                '@click.stop': 'deleteFolder($el.dataset.folderPath)',
                title: 'Delete folder',
                textContent: '🗑️'
              })
            ]
          })
        ]
      });
    });

    const fileElements = objects.map(obj => {
      const fileName = s3Service.getFileName(obj.Key);
      const extension = s3Service.getFileExtension(obj.Key);
      const icon = this.filePreviewService.getFileIcon(extension);
      const canPreview = this.filePreviewService.canPreview(extension);

      return $div({
        className: 'file-item',
        'data-file-key': obj.Key,
        '@click': canPreview ? 'previewFile($el.dataset.fileKey)' : '',
        style: { cursor: canPreview ? 'pointer' : 'default' },
        children: [
          $div({ className: 'file-icon', textContent: icon }),
          $div({
            className: 'file-info',
            children: [
              $div({ className: 'file-name', textContent: fileName }),
              $div({
                className: 'file-meta',
                textContent: `${s3Service.formatFileSize(obj.Size)} · ${obj.LastModified ? new Date(obj.LastModified).toLocaleString() : ''}`
              })
            ]
          }),
          $div({
            className: 'file-actions',
            children: [
              canPreview ? $button({
                className: 'btn-icon',
                'data-file-key': obj.Key,
                '@click.stop': 'previewFile($el.dataset.fileKey)',
                title: 'Preview',
                textContent: '👁️'
              }) : '',
              $button({
                className: 'btn-icon',
                'data-file-key': obj.Key,
                '@click.stop': 'copyS3Path($el.dataset.fileKey, $el)',
                title: 'Copy S3 path (s3://bucket/key)',
                textContent: '📋'
              }),
              $button({
                className: 'btn-icon',
                'data-file-key': obj.Key,
                '@click.stop': 'downloadFile($el.dataset.fileKey)',
                title: 'Download',
                textContent: '⬇️'
              }),
              $button({
                className: 'btn-icon',
                'data-file-key': obj.Key,
                '@click.stop': 'deleteFile($el.dataset.fileKey)',
                title: 'Delete',
                textContent: '🗑️'
              })
            ].filter(Boolean)
          })
        ]
      });
    });

    return [...folderElements, ...fileElements].join('');
  }

  generateFilePreviewHtml(
    key: string,
    previewType: string,
    content: any,
    metadata: any,
    s3Service: any,
    presignedUrl?: string
  ): string {
    const fileName = s3Service.getFileName(key);
    const extension = s3Service.getFileExtension(key);

    let previewContent = '';

    switch (previewType) {
      case 'image':
        previewContent = $div({
          className: 'preview-image-container',
          children: [
            $img({
              src: presignedUrl!,
              alt: fileName,
              style: { maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }
            })
          ]
        });
        break;

      case 'text':
        const textContent = content.toString('utf-8');
        const formatted = extension === 'json' ? this.filePreviewService.formatJson(textContent) : textContent;
        previewContent = $div({
          className: 'preview-text-container',
          children: [
            $pre({
              children: [
                $code({
                  textContent: formatted.substring(0, 50000) // Limit to 50KB for display
                })
              ]
            })
          ]
        });
        break;

      case 'video':
        previewContent = $div({
          className: 'preview-video-container',
          children: [
            $video({
              src: presignedUrl!,
              controls: true,
              style: { maxWidth: '100%', maxHeight: '70vh' }
            })
          ]
        });
        break;

      case 'audio':
        previewContent = $div({
          className: 'preview-audio-container',
          children: [
            $audio({
              src: presignedUrl!,
              controls: true,
              style: { width: '100%' }
            })
          ]
        });
        break;

      case 'pdf':
        previewContent = $div({
          className: 'preview-pdf-container',
          children: [
            $iframe({
              src: presignedUrl!,
              style: { width: '100%', height: '85vh', border: 'none' }
            })
          ]
        });
        break;

      default:
        previewContent = $div({
          className: 'preview-unavailable',
          children: [
            $p({ textContent: 'Preview not available for this file type' }),
            $button({
              className: 'btn',
              'data-file-key': key,
              '@click': 'downloadFile($el.dataset.fileKey)',
              textContent: '⬇️ Download File'
            })
          ]
        });
    }

    return $div({
      className: 'file-preview',
      children: [
        $div({
          className: 'preview-header',
          children: [
            $h3({ textContent: fileName }),
            $button({
              className: 'btn-close',
              '@click': 'closePreview()',
              textContent: '✕'
            })
          ]
        }),
        $div({
          className: 'preview-meta',
          children: [
            $span({ textContent: `Size: ${s3Service.formatFileSize(metadata.ContentLength)}` }),
            $span({ textContent: ` · Type: ${metadata.ContentType || 'unknown'}` }),
            metadata.LastModified ? $span({ textContent: ` · Modified: ${new Date(metadata.LastModified).toLocaleString()}` }) : ''
          ].filter(Boolean)
        }),
        $div({
          className: 'preview-content',
          children: [previewContent]
        }),
        $div({
          className: 'preview-actions',
          children: [
            $button({
              className: 'btn',
              'data-file-key': key,
              '@click': 'copyS3Path($el.dataset.fileKey, $el)',
              textContent: '📋 Copy S3 Path'
            }),
            $button({
              className: 'btn',
              'data-file-key': key,
              '@click': 'downloadFile($el.dataset.fileKey)',
              textContent: '⬇️ Download'
            }),
            $button({
              className: 'btn secondary',
              '@click': 'closePreview()',
              textContent: 'Close'
            })
          ]
        })
      ]
    });
  }

  generateErrorHtml(message: string): string {
    return $div({
      className: 'error',
      children: [
        $div({ className: 'error-icon', textContent: '⚠️' }),
        $p({ textContent: message })
      ]
    });
  }

  generateLoadingHtml(message: string = 'Loading...'): string {
    return $div({
      className: 'loading',
      children: [
        $div({ className: 'spinner' }),
        $p({ textContent: message })
      ]
    });
  }
}
