const MAX_PRODUCT_IMAGE_EDGE = 1600;
const MIN_PRODUCT_IMAGE_SIZE = 300 * 1024;
const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const optimizeProductImage = async (file) => {
  if (
    file.size < MIN_PRODUCT_IMAGE_SIZE ||
    !COMPRESSIBLE_IMAGE_TYPES.has(file.type) ||
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  ) {
    return file;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PRODUCT_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const compressedBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.82);
    });
    if (!compressedBlob || compressedBlob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'product-image';
    return new File([compressedBlob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch (error) {
    console.warn(`Could not optimize product image "${file.name}"; using the original file.`, error);
    return file;
  } finally {
    bitmap?.close();
  }
};
