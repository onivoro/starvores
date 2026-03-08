import { Controller, Get } from '@nestjs/common';
import { $html, $head, $title, $meta, $script, $style, $body, $div, $h1, $p, $header, $aside, $main, $button, $input, $link } from '@onivoro/server-html';
import { AppServerBucketvoreConfig } from '../app-server-bucketvore-config.class';
import { DESIGN_SYSTEM_STYLES } from '../styles/design-system';

@Controller()
export class AppController {
  constructor(private config: AppServerBucketvoreConfig) {}

  @Get()
  get() {
    return $html({
      lang: 'en',
      children: [
        $head({
          children: [
            $meta({ charset: 'UTF-8' }),
            $meta({ name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
            $title({ textContent: 'BucketVore - S3 File Explorer' }),
            $link({ rel: 'icon', type: 'image/x-icon', href: '/assets/images/bear.ico' }),
            $style({ textContent: DESIGN_SYSTEM_STYLES }),
            // Load our Alpine component first
            $script({ src: '/assets/scripts/s3-explorer.bundle.js' }),
            // Then load Alpine.js (will auto-start after DOM ready)
            $script({ src: 'https://unpkg.com/alpinejs@3.13.5/dist/cdn.min.js', defer: true })
          ]
        }),
        $body({
          'x-data': 's3Explorer()',
          'x-init': 'init()',
          children: [
            // Header
            $header({
              children: [
                $div({
                  className: 'header-left',
                  children: [
                    $div({
                      className: 'header-info',
                      children: [
                        $h1({ textContent: '🪣 BucketVore' }),
                        $p({
                          'x-show': 'selectedBucket',
                          'x-text': 'selectedBucket',
                          textContent: 'Select a bucket'
                        })
                      ]
                    })
                  ]
                }),
                $div({
                  className: 'header-actions',
                  'x-show': 'selectedBucket',
                  children: [
                    $button({
                      className: 'btn',
                      '@click': 'showUpload = true',
                      textContent: '⬆️ Upload'
                    }),
                    $button({
                      className: 'btn secondary',
                      '@click': 'refresh()',
                      textContent: '🔄 Refresh'
                    })
                  ]
                })
              ]
            }),

            $div({
              className: 'container',
              children: [
                // Sidebar - Bucket List
                $aside({
                  children: [
                    $div({
                      className: 'sidebar-header',
                      children: [
                        $h1({ textContent: '📋 Buckets', style: { fontSize: 'var(--size-sm)', marginBottom: 'var(--space-3)' } }),
                        $input({
                          type: 'text',
                          placeholder: 'Filter buckets...',
                          'x-model': 'bucketFilter',
                          '@input': 'filterBuckets()',
                          className: 'filter-input',
                          style: { width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', fontSize: 'var(--size-sm)' }
                        })
                      ]
                    }),
                    $div({
                      className: 'bucket-list',
                      'x-html': 'filteredBucketsHtml'
                    })
                  ]
                }),

                // Main Content - File Explorer
                $main({
                  children: [
                    // Toolbar with breadcrumbs
                    $div({
                      className: 'toolbar',
                      'x-show': 'selectedBucket',
                      children: [
                        $div({
                          style: { flex: '1', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
                          children: [
                            $div({
                              'x-html': 'breadcrumbsHtml'
                            }),
                            $input({
                              type: 'text',
                              placeholder: 'Filter files and folders...',
                              'x-model': 'fileFilter',
                              '@input': 'filterFiles()',
                              className: 'filter-input',
                              style: { width: '100%', maxWidth: '400px', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', fontSize: 'var(--size-sm)' }
                            })
                          ]
                        }),
                        $div({
                          className: 'toolbar-actions',
                          children: [
                            $button({
                              className: 'btn-icon',
                              '@click': "viewMode = viewMode === 'list' ? 'grid' : 'list'",
                              'x-text': "viewMode === 'list' ? '⊞' : '☰'",
                              title: 'Toggle view'
                            })
                          ]
                        })
                      ]
                    }),

                    // File Explorer
                    $div({
                      className: 'file-explorer',
                      children: [
                        $div({
                          className: 'file-list',
                          'x-html': 'filteredFilesHtml'
                        })
                      ]
                    })
                  ]
                })
              ]
            }),

            // Upload Modal
            $div({
              className: 'modal-overlay',
              'x-show': 'showUpload',
              '@click.self': 'showUpload = false',
              style: { display: 'none' },
              children: [
                $div({
                  className: 'modal',
                  style: { width: '500px' },
                  children: [
                    $div({
                      className: 'preview-header',
                      children: [
                        $h1({ textContent: 'Upload Files', style: { fontSize: 'var(--size-lg)', margin: 0 } }),
                        $button({
                          className: 'btn-close',
                          '@click': 'showUpload = false',
                          textContent: '✕'
                        })
                      ]
                    }),
                    $div({
                      className: 'preview-content',
                      children: [
                        $div({
                          className: 'upload-zone',
                          '@click': '$refs.fileInput.click()',
                          '@drop.prevent': 'handleDrop($event)',
                          '@dragover.prevent': "$el.classList.add('drag-over')",
                          '@dragleave.prevent': "$el.classList.remove('drag-over')",
                          children: [
                            $div({ className: 'upload-zone-icon', textContent: '📁' }),
                            $p({ textContent: 'Click to select files or drag and drop' }),
                            $input({
                              type: 'file',
                              multiple: true,
                              'x-ref': 'fileInput',
                              '@change': 'handleFileSelect($event)'
                            })
                          ]
                        }),
                        $div({
                          'x-show': 'uploadProgress.length > 0',
                          style: { marginTop: 'var(--space-4)' },
                          children: [
                            $h1({ textContent: 'Uploading...', style: { fontSize: 'var(--size-sm)', marginBottom: 'var(--space-2)' } }),
                            $div({
                              'x-html': 'uploadProgressHtml'
                            })
                          ]
                        })
                      ]
                    })
                  ]
                })
              ]
            }),

            // Preview Modal
            $div({
              className: 'modal-overlay',
              'x-show': 'showPreview',
              '@click.self': 'closePreview()',
              style: { display: 'none' },
              children: [
                $div({
                  className: 'modal',
                  style: { maxWidth: '95vw', maxHeight: '95vh', width: '95vw' },
                  'x-html': 'previewHtml'
                })
              ]
            }),

            // Load client bundle at end of body
            $script({ src: '/assets/scripts/s3-explorer.bundle.js' })
          ]
        })
      ]
    });
  }
}
