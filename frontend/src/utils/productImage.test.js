import { optimizeProductImage } from './productImage';

describe('optimizeProductImage', () => {
  it('leaves small and unsupported image files unchanged', async () => {
    const smallImage = new File(['small'], 'small.jpg', { type: 'image/jpeg' });
    const gifImage = new File(['animated'], 'animated.gif', { type: 'image/gif' });

    await expect(optimizeProductImage(smallImage)).resolves.toBe(smallImage);
    await expect(optimizeProductImage(gifImage)).resolves.toBe(gifImage);
  });

  it('resizes large supported images and uses the smaller WebP output', async () => {
    const originalImage = new File([new Uint8Array(500_000)], 'large-photo.jpg', {
      type: 'image/jpeg',
      lastModified: 123,
    });
    const bitmap = { width: 3000, height: 2000, close: jest.fn() };
    const context = { drawImage: jest.fn() };
    const compressedBlob = new Blob([new Uint8Array(100_000)], { type: 'image/webp' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => context),
      toBlob: jest.fn((callback) => callback(compressedBlob)),
    };
    const originalCreateImageBitmap = global.createImageBitmap;
    const originalCreateElement = document.createElement.bind(document);
    const createElement = jest.spyOn(document, 'createElement').mockImplementation((tagName, options) => (
      tagName === 'canvas' ? canvas : originalCreateElement(tagName, options)
    ));
    global.createImageBitmap = jest.fn().mockResolvedValue(bitmap);

    try {
      const optimized = await optimizeProductImage(originalImage);

      expect(optimized).not.toBe(originalImage);
      expect(optimized.name).toBe('large-photo.webp');
      expect(optimized.type).toBe('image/webp');
      expect(optimized.size).toBeLessThan(originalImage.size);
      expect(canvas.width).toBe(1600);
      expect(canvas.height).toBe(1067);
      expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1067);
      expect(bitmap.close).toHaveBeenCalled();
    } finally {
      createElement.mockRestore();
      if (originalCreateImageBitmap) {
        global.createImageBitmap = originalCreateImageBitmap;
      } else {
        delete global.createImageBitmap;
      }
    }
  });
});
