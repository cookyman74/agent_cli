/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import {
  ContentResolver,
  resolveContent,
  getMimeType,
  isImageUrl,
  isDataUrl,
} from './contentResolver.js';

describe('ContentResolver', () => {
  describe('getMimeType()', () => {
    it('should detect PNG MIME type', () => {
      expect(getMimeType('image.png')).toBe('image/png');
    });

    it('should detect JPEG MIME type', () => {
      expect(getMimeType('photo.jpg')).toBe('image/jpeg');
      expect(getMimeType('photo.jpeg')).toBe('image/jpeg');
    });

    it('should detect GIF MIME type', () => {
      expect(getMimeType('animation.gif')).toBe('image/gif');
    });

    it('should detect WebP MIME type', () => {
      expect(getMimeType('image.webp')).toBe('image/webp');
    });

    it('should return undefined for unknown types', () => {
      expect(getMimeType('document.pdf')).toBeUndefined();
      expect(getMimeType('file.txt')).toBeUndefined();
    });

    it('should handle URLs with query strings', () => {
      expect(getMimeType('https://example.com/image.png?v=1')).toBe(
        'image/png',
      );
    });
  });

  describe('isImageUrl()', () => {
    it('should return true for http image URLs', () => {
      expect(isImageUrl('http://example.com/image.png')).toBe(true);
    });

    it('should return true for https image URLs', () => {
      expect(isImageUrl('https://example.com/photo.jpg')).toBe(true);
    });

    it('should return false for non-image URLs', () => {
      expect(isImageUrl('https://example.com/file.pdf')).toBe(false);
    });

    it('should return false for local paths', () => {
      expect(isImageUrl('/path/to/image.png')).toBe(false);
    });
  });

  describe('isDataUrl()', () => {
    it('should return true for data URLs', () => {
      expect(isDataUrl('data:image/png;base64,iVBORw0KGgoAAAA')).toBe(true);
    });

    it('should return false for http URLs', () => {
      expect(isDataUrl('https://example.com/image.png')).toBe(false);
    });

    it('should return false for file paths', () => {
      expect(isDataUrl('/path/to/image.png')).toBe(false);
    });
  });

  describe('resolveContent()', () => {
    it('should pass through data URLs unchanged', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAA';
      const result = await resolveContent(dataUrl);

      expect(result.type).toBe('data_url');
      expect(result.data).toBe(dataUrl);
    });

    it('should extract mimeType from data URL', async () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ';
      const result = await resolveContent(dataUrl);

      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should identify http URLs', async () => {
      const url = 'https://example.com/image.png';
      const result = await resolveContent(url);

      expect(result.type).toBe('url');
      expect(result.data).toBe(url);
      expect(result.mimeType).toBe('image/png');
    });
  });

  describe('ContentResolver class', () => {
    it('should provide instance methods', () => {
      const resolver = new ContentResolver();

      expect(resolver.resolve).toBeDefined();
      expect(resolver.getMimeType).toBeDefined();
    });

    it('should resolve content using instance method', async () => {
      const resolver = new ContentResolver();
      const result = await resolver.resolve('data:image/gif;base64,R0lGODlh');

      expect(result.mimeType).toBe('image/gif');
    });
  });
});
