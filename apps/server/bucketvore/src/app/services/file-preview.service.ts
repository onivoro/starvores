import { Injectable } from '@nestjs/common';

@Injectable()
export class FilePreviewService {
  private readonly imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  private readonly textExtensions = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'yaml', 'yml', 'ts', 'js', 'jsx', 'tsx', 'html', 'css', 'scss', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'sh', 'bash'];
  private readonly videoExtensions = ['mp4', 'webm', 'ogg', 'mov'];
  private readonly audioExtensions = ['mp3', 'wav', 'ogg', 'flac'];
  private readonly pdfExtensions = ['pdf'];
  private readonly binaryExtensions = [
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'exe', 'dll', 'so', 'dylib', 'bin',
    'dmg', 'iso', 'img',
    'class', 'pyc', 'o', 'a', 'lib', 'wasm',
  ];

  canPreview(extension: string): boolean {
    const ext = extension.toLowerCase();
    return this.imageExtensions.includes(ext) ||
           this.textExtensions.includes(ext) ||
           this.videoExtensions.includes(ext) ||
           this.audioExtensions.includes(ext) ||
           this.pdfExtensions.includes(ext);
  }

  isImage(extension: string): boolean {
    return this.imageExtensions.includes(extension.toLowerCase());
  }

  isText(extension: string): boolean {
    return this.textExtensions.includes(extension.toLowerCase());
  }

  isVideo(extension: string): boolean {
    return this.videoExtensions.includes(extension.toLowerCase());
  }

  isAudio(extension: string): boolean {
    return this.audioExtensions.includes(extension.toLowerCase());
  }

  isPdf(extension: string): boolean {
    return this.pdfExtensions.includes(extension.toLowerCase());
  }

  getPreviewType(extension: string): 'image' | 'text' | 'video' | 'audio' | 'pdf' | 'none' {
    const ext = extension.toLowerCase();

    if (this.isImage(ext)) return 'image';
    if (this.isText(ext)) return 'text';
    if (this.isVideo(ext)) return 'video';
    if (this.isAudio(ext)) return 'audio';
    if (this.isPdf(ext)) return 'pdf';
    if (this.binaryExtensions.includes(ext)) return 'none';

    return 'text';
  }

  getFileIcon(extension: string): string {
    const ext = extension.toLowerCase();

    if (this.isImage(ext)) return '🖼️';
    if (this.isText(ext)) return '📄';
    if (this.isVideo(ext)) return '🎥';
    if (this.isAudio(ext)) return '🎵';
    if (this.isPdf(ext)) return '📕';
    if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return '📦';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx'].includes(ext)) return '📊';
    if (['ppt', 'pptx'].includes(ext)) return '📽️';

    return '📎';
  }

  async generateTextPreview(content: Uint8Array, maxLength: number = 1_000_000): Promise<string> {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(content);

    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength) + '\n\n... (truncated)';
  }

  formatJson(content: string): string {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return content;
    }
  }
}
