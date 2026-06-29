/**
 * File Type Detection Utility
 * Detects file types based on magic numbers (file signatures) like the Linux `file` command
 */

export interface FileTypeInfo {
  type: 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'document' | 'archive' | 'unknown';
  mimeType: string;
  extension: string;
  description: string;
}

/**
 * Check if bytes match a signature at a specific offset
 */
function matchesSignature(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (offset + signature.length > bytes.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Detect file type from file content using magic numbers
 */
export function detectFileType(content: ArrayBuffer, fileName?: string): FileTypeInfo {
  const bytes = new Uint8Array(content);
  
  // If file is too small, fall back to extension
  if (bytes.length < 4) {
    return detectFromExtension(fileName);
  }

  // Image formats
  
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (matchesSignature(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    return {
      type: 'image',
      mimeType: 'image/png',
      extension: '.png',
      description: 'PNG Image'
    };
  }

  // JPEG: FF D8 FF
  if (matchesSignature(bytes, [0xFF, 0xD8, 0xFF])) {
    return {
      type: 'image',
      mimeType: 'image/jpeg',
      extension: '.jpg',
      description: 'JPEG Image'
    };
  }

  // GIF: GIF87a or GIF89a
  if (matchesSignature(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      matchesSignature(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return {
      type: 'image',
      mimeType: 'image/gif',
      extension: '.gif',
      description: 'GIF Image'
    };
  }

  // WebP: RIFF....WEBP
  if (matchesSignature(bytes, [0x52, 0x49, 0x46, 0x46]) && 
      bytes.length >= 12 && matchesSignature(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return {
      type: 'image',
      mimeType: 'image/webp',
      extension: '.webp',
      description: 'WebP Image'
    };
  }

  // BMP: BM
  if (matchesSignature(bytes, [0x42, 0x4D])) {
    return {
      type: 'image',
      mimeType: 'image/bmp',
      extension: '.bmp',
      description: 'BMP Image'
    };
  }

  // TIFF: II or MM
  if (matchesSignature(bytes, [0x49, 0x49, 0x2A, 0x00]) ||
      matchesSignature(bytes, [0x4D, 0x4D, 0x00, 0x2A])) {
    return {
      type: 'image',
      mimeType: 'image/tiff',
      extension: '.tiff',
      description: 'TIFF Image'
    };
  }

  // ICO: 00 00 01 00
  if (matchesSignature(bytes, [0x00, 0x00, 0x01, 0x00])) {
    return {
      type: 'image',
      mimeType: 'image/x-icon',
      extension: '.ico',
      description: 'Icon'
    };
  }

  // SVG (check for XML + svg tag or just svg tag)
  if (bytes.length > 100) {
    const text = new TextDecoder().decode(bytes.slice(0, Math.min(1024, bytes.length)));
    const lowerText = text.toLowerCase();
    if ((lowerText.includes('<?xml') || lowerText.includes('<svg')) && lowerText.includes('svg')) {
      return {
        type: 'image',
        mimeType: 'image/svg+xml',
        extension: '.svg',
        description: 'SVG Image'
      };
    }
  }

  // Video formats
  
  // MP4: ftyp at offset 4
  if (bytes.length >= 12 && matchesSignature(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    return {
      type: 'video',
      mimeType: 'video/mp4',
      extension: '.mp4',
      description: 'MP4 Video'
    };
  }

  // AVI: RIFF....AVI
  if (matchesSignature(bytes, [0x52, 0x49, 0x46, 0x46]) && 
      bytes.length >= 12 && matchesSignature(bytes, [0x41, 0x56, 0x49, 0x20], 8)) {
    return {
      type: 'video',
      mimeType: 'video/x-msvideo',
      extension: '.avi',
      description: 'AVI Video'
    };
  }

  // WebM: 1A 45 DF A3
  if (matchesSignature(bytes, [0x1A, 0x45, 0xDF, 0xA3])) {
    return {
      type: 'video',
      mimeType: 'video/webm',
      extension: '.webm',
      description: 'WebM Video'
    };
  }

  // Audio formats
  
  // MP3: ID3 or FF FB
  if (matchesSignature(bytes, [0x49, 0x44, 0x33]) || 
      matchesSignature(bytes, [0xFF, 0xFB])) {
    return {
      type: 'audio',
      mimeType: 'audio/mpeg',
      extension: '.mp3',
      description: 'MP3 Audio'
    };
  }

  // WAV: RIFF....WAVE
  if (matchesSignature(bytes, [0x52, 0x49, 0x46, 0x46]) && 
      bytes.length >= 12 && matchesSignature(bytes, [0x57, 0x41, 0x56, 0x45], 8)) {
    return {
      type: 'audio',
      mimeType: 'audio/wav',
      extension: '.wav',
      description: 'WAV Audio'
    };
  }

  // OGG: OggS
  if (matchesSignature(bytes, [0x4F, 0x67, 0x67, 0x53])) {
    return {
      type: 'audio',
      mimeType: 'audio/ogg',
      extension: '.ogg',
      description: 'OGG Audio'
    };
  }

  // FLAC: fLaC
  if (matchesSignature(bytes, [0x66, 0x4C, 0x61, 0x43])) {
    return {
      type: 'audio',
      mimeType: 'audio/flac',
      extension: '.flac',
      description: 'FLAC Audio'
    };
  }

  // Documents
  
  // PDF: %PDF
  if (matchesSignature(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return {
      type: 'pdf',
      mimeType: 'application/pdf',
      extension: '.pdf',
      description: 'PDF Document'
    };
  }

  // ZIP (and formats based on ZIP: docx, xlsx, etc.): PK
  if (matchesSignature(bytes, [0x50, 0x4B, 0x03, 0x04]) || 
      matchesSignature(bytes, [0x50, 0x4B, 0x05, 0x06]) ||
      matchesSignature(bytes, [0x50, 0x4B, 0x07, 0x08])) {
    
    // Check for Office Open XML formats (docx, xlsx, pptx)
    if (fileName) {
      const ext = fileName.toLowerCase();
      if (ext.endsWith('.docx')) {
        return {
          type: 'document',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          extension: '.docx',
          description: 'Microsoft Word Document'
        };
      }
      if (ext.endsWith('.xlsx')) {
        return {
          type: 'document',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: '.xlsx',
          description: 'Microsoft Excel Spreadsheet'
        };
      }
      if (ext.endsWith('.pptx')) {
        return {
          type: 'document',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          extension: '.pptx',
          description: 'Microsoft PowerPoint Presentation'
        };
      }
    }
    
    return {
      type: 'archive',
      mimeType: 'application/zip',
      extension: '.zip',
      description: 'ZIP Archive'
    };
  }

  // RAR: Rar!
  if (matchesSignature(bytes, [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07])) {
    return {
      type: 'archive',
      mimeType: 'application/x-rar-compressed',
      extension: '.rar',
      description: 'RAR Archive'
    };
  }

  // 7z: 37 7A BC AF 27 1C
  if (matchesSignature(bytes, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) {
    return {
      type: 'archive',
      mimeType: 'application/x-7z-compressed',
      extension: '.7z',
      description: '7-Zip Archive'
    };
  }

  // GZIP: 1F 8B
  if (matchesSignature(bytes, [0x1F, 0x8B])) {
    return {
      type: 'archive',
      mimeType: 'application/gzip',
      extension: '.gz',
      description: 'GZIP Archive'
    };
  }

  // Check if it's text (UTF-8)
  if (isTextContent(bytes)) {
    return detectTextFileType(bytes, fileName);
  }

  // Fall back to extension-based detection
  return detectFromExtension(fileName);
}

/**
 * Check if content is likely text
 */
function isTextContent(bytes: Uint8Array): boolean {
  // Sample first 512 bytes
  const sample = bytes.slice(0, Math.min(512, bytes.length));
  
  // Count non-printable characters
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    // Allow common control chars: tab, newline, carriage return
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0A && byte !== 0x0D) {
      nonPrintable++;
    }
    // Disallow high control chars
    if (byte === 0x7F || (byte >= 0x80 && byte <= 0x9F)) {
      nonPrintable++;
    }
  }
  
  // If less than 5% non-printable, likely text
  return (nonPrintable / sample.length) < 0.05;
}

/**
 * Detect specific text file types
 */
function detectTextFileType(bytes: Uint8Array, fileName?: string): FileTypeInfo {
  const text = new TextDecoder().decode(bytes.slice(0, Math.min(1024, bytes.length)));
  const lowerText = text.toLowerCase();
  
  // SVG (final check if it slipped through earlier detection)
  if (lowerText.includes('<svg') || (lowerText.includes('<?xml') && lowerText.includes('svg'))) {
    return {
      type: 'image',
      mimeType: 'image/svg+xml',
      extension: '.svg',
      description: 'SVG Image'
    };
  }
  
  // HTML
  if (text.trim().toLowerCase().startsWith('<!doctype html') || 
      text.trim().toLowerCase().startsWith('<html')) {
    return {
      type: 'document',
      mimeType: 'text/html',
      extension: '.html',
      description: 'HTML Document'
    };
  }

  // XML
  if (text.trim().startsWith('<?xml')) {
    return {
      type: 'document',
      mimeType: 'application/xml',
      extension: '.xml',
      description: 'XML Document'
    };
  }

  // JSON
  if ((text.trim().startsWith('{') || text.trim().startsWith('[')) && 
      fileName?.toLowerCase().endsWith('.json')) {
    return {
      type: 'text',
      mimeType: 'application/json',
      extension: '.json',
      description: 'JSON Data'
    };
  }

  // Markdown
  if (fileName?.toLowerCase().endsWith('.md') || fileName?.toLowerCase().endsWith('.markdown')) {
    return {
      type: 'text',
      mimeType: 'text/markdown',
      extension: '.md',
      description: 'Markdown Document'
    };
  }

  // Default to plain text
  return {
    type: 'text',
    mimeType: 'text/plain',
    extension: '.txt',
    description: 'Text Document'
  };
}

/**
 * Fall back to extension-based detection
 */
function detectFromExtension(fileName?: string): FileTypeInfo {
  if (!fileName) {
    return {
      type: 'unknown',
      mimeType: 'application/octet-stream',
      extension: '',
      description: 'Unknown File Type'
    };
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const extensionMap: Record<string, FileTypeInfo> = {
    // Images
    'jpg': { type: 'image', mimeType: 'image/jpeg', extension: '.jpg', description: 'JPEG Image' },
    'jpeg': { type: 'image', mimeType: 'image/jpeg', extension: '.jpeg', description: 'JPEG Image' },
    'png': { type: 'image', mimeType: 'image/png', extension: '.png', description: 'PNG Image' },
    'gif': { type: 'image', mimeType: 'image/gif', extension: '.gif', description: 'GIF Image' },
    'webp': { type: 'image', mimeType: 'image/webp', extension: '.webp', description: 'WebP Image' },
    'svg': { type: 'image', mimeType: 'image/svg+xml', extension: '.svg', description: 'SVG Image' },
    'bmp': { type: 'image', mimeType: 'image/bmp', extension: '.bmp', description: 'BMP Image' },
    
    // Videos
    'mp4': { type: 'video', mimeType: 'video/mp4', extension: '.mp4', description: 'MP4 Video' },
    'webm': { type: 'video', mimeType: 'video/webm', extension: '.webm', description: 'WebM Video' },
    'avi': { type: 'video', mimeType: 'video/x-msvideo', extension: '.avi', description: 'AVI Video' },
    'mov': { type: 'video', mimeType: 'video/quicktime', extension: '.mov', description: 'QuickTime Video' },
    
    // Audio
    'mp3': { type: 'audio', mimeType: 'audio/mpeg', extension: '.mp3', description: 'MP3 Audio' },
    'wav': { type: 'audio', mimeType: 'audio/wav', extension: '.wav', description: 'WAV Audio' },
    'ogg': { type: 'audio', mimeType: 'audio/ogg', extension: '.ogg', description: 'OGG Audio' },
    'flac': { type: 'audio', mimeType: 'audio/flac', extension: '.flac', description: 'FLAC Audio' },
    
    // Documents
    'pdf': { type: 'pdf', mimeType: 'application/pdf', extension: '.pdf', description: 'PDF Document' },
    'txt': { type: 'text', mimeType: 'text/plain', extension: '.txt', description: 'Text Document' },
    'md': { type: 'text', mimeType: 'text/markdown', extension: '.md', description: 'Markdown Document' },
    'json': { type: 'text', mimeType: 'application/json', extension: '.json', description: 'JSON Data' },
    'xml': { type: 'document', mimeType: 'application/xml', extension: '.xml', description: 'XML Document' },
    'html': { type: 'document', mimeType: 'text/html', extension: '.html', description: 'HTML Document' },
    'csv': { type: 'text', mimeType: 'text/csv', extension: '.csv', description: 'CSV Data' },
    
    // Office
    'docx': { type: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: '.docx', description: 'Word Document' },
    'xlsx': { type: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx', description: 'Excel Spreadsheet' },
    'pptx': { type: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: '.pptx', description: 'PowerPoint Presentation' },
  };

  return extensionMap[ext] || {
    type: 'unknown',
    mimeType: 'application/octet-stream',
    extension: `.${ext}`,
    description: 'Unknown File Type'
  };
}

/**
 * Get file type category from detected info
 */
export function getFileTypeCategory(typeInfo: FileTypeInfo): string {
  return typeInfo.type;
}

/**
 * Get MIME type from detected info
 */
export function getMimeTypeFromDetection(typeInfo: FileTypeInfo): string {
  return typeInfo.mimeType;
}
