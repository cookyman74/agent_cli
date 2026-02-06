/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported image MIME types.
 */
const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/**
 * Resolved content result.
 */
export interface ResolvedContent {
  /** Content type: data_url, url, or file */
  type: 'data_url' | 'url' | 'file';
  /** Content data (URL, base64, or path) */
  data: string;
  /** MIME type if detected */
  mimeType?: string;
}

/**
 * Get MIME type from file path or URL.
 *
 * @param pathOrUrl - File path or URL
 * @returns MIME type or undefined
 *
 * @example
 * ```ts
 * getMimeType('image.png') // 'image/png'
 * getMimeType('photo.jpg') // 'image/jpeg'
 * ```
 */
export function getMimeType(pathOrUrl: string): string | undefined {
  // Remove query string if present
  const cleanPath = pathOrUrl.split('?')[0];

  // Get extension
  const ext = cleanPath.split('.').pop()?.toLowerCase();

  if (ext && ext in IMAGE_EXTENSIONS) {
    return IMAGE_EXTENSIONS[ext];
  }

  return undefined;
}

/**
 * Check if a string is an http/https image URL.
 *
 * @param str - String to check
 * @returns True if http/https image URL
 */
export function isImageUrl(str: string): boolean {
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    return false;
  }

  const mimeType = getMimeType(str);
  return mimeType?.startsWith('image/') ?? false;
}

/**
 * Check if a string is a data URL.
 *
 * @param str - String to check
 * @returns True if data URL
 */
export function isDataUrl(str: string): boolean {
  return str.startsWith('data:');
}

/**
 * Extract MIME type from data URL.
 *
 * @param dataUrl - Data URL
 * @returns MIME type or undefined
 */
function extractMimeTypeFromDataUrl(dataUrl: string): string | undefined {
  const match = dataUrl.match(/^data:([^;,]+)/);
  return match?.[1];
}

/**
 * Resolve content from various sources.
 *
 * Handles:
 * - Data URLs (passed through)
 * - HTTP/HTTPS URLs
 * - File paths (future: will read and convert to base64)
 *
 * @param source - Content source (URL, data URL, or path)
 * @returns Resolved content with type and data
 *
 * @example
 * ```ts
 * const result = await resolveContent('data:image/png;base64,iVBOR...');
 * // { type: 'data_url', data: '...', mimeType: 'image/png' }
 * ```
 */
export async function resolveContent(source: string): Promise<ResolvedContent> {
  // Handle data URLs
  if (isDataUrl(source)) {
    return {
      type: 'data_url',
      data: source,
      mimeType: extractMimeTypeFromDataUrl(source),
    };
  }

  // Handle http/https URLs
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return {
      type: 'url',
      data: source,
      mimeType: getMimeType(source),
    };
  }

  // Handle file paths (basic implementation)
  return {
    type: 'file',
    data: source,
    mimeType: getMimeType(source),
  };
}

/**
 * Content resolver for handling various content sources.
 *
 * Provides utilities for resolving images and other content
 * from URLs, data URLs, and file paths.
 *
 * @example
 * ```ts
 * const resolver = new ContentResolver();
 * const content = await resolver.resolve('https://example.com/image.png');
 * ```
 *
 * @see docs/ai_adapter/03-technical-design.md §3.8
 */
export class ContentResolver {
  /**
   * Resolve content from a source.
   */
  async resolve(source: string): Promise<ResolvedContent> {
    return resolveContent(source);
  }

  /**
   * Get MIME type for a path or URL.
   */
  getMimeType(pathOrUrl: string): string | undefined {
    return getMimeType(pathOrUrl);
  }

  /**
   * Check if source is an image URL.
   */
  isImageUrl(str: string): boolean {
    return isImageUrl(str);
  }

  /**
   * Check if source is a data URL.
   */
  isDataUrl(str: string): boolean {
    return isDataUrl(str);
  }
}
