'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, X, Star, Image as ImageIcon, Loader2, MoveVertical } from 'lucide-react';
import productImageService from '@/services/productImageService';

interface ProductImage {
  id?: number;
  image_path: string;
  image_url: string;
  alt_text?: string;
  is_primary: boolean;
  sort_order: number;
  is_active: boolean;
}

interface ImageItem {
  id?: number;
  file?: File;
  preview: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
  uploaded: boolean;
}

interface ImageGalleryManagerProps {
  productId?: number;
  existingImages?: ProductImage[];
  onImagesChange?: (images: ImageItem[]) => void;
  maxImages?: number;
  allowReorder?: boolean;
  disableAutoUpload?: boolean;
}

export default function ImageGalleryManager({
  productId,
  existingImages = [],
  onImagesChange,
  maxImages = 10,
  allowReorder = true,
  disableAutoUpload = false,
}: ImageGalleryManagerProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingImages, setIsLoadingImages] = useState(false);

  // Fetch existing images when productId changes
  useEffect(() => {
    if (productId) {
      loadExistingImages();
    } else if (existingImages.length > 0) {
      // Use prop images if no productId (for backward compatibility)
      const mappedImages = existingImages.map((img, index) => ({
        id: img.id,
        preview: img.image_url,
        alt_text: img.alt_text || '',
        is_primary: img.is_primary,
        sort_order: img.sort_order || index,
        uploaded: true,
      }));
      setImages(mappedImages);
    }
  }, [productId]);

  const loadExistingImages = async () => {
    if (!productId) return;
    
    setIsLoadingImages(true);
    try {
      const fetchedImages = await productImageService.getProductImages(productId);
      
      // Process images with proper URL construction (matching Gallery page)
      const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
      console.log('ImageGalleryManager - Base URL:', baseUrl);
      
      const mappedImages = fetchedImages
        .filter(img => img.is_active)
        .sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1;
          if (!a.is_primary && b.is_primary) return 1;
          return (a.sort_order || 0) - (b.sort_order || 0);
        })
        .map((img) => {
          // Get the image path from image_url or image_path
          let imagePath = img.image_url || img.image_path || '';
          console.log('ImageGalleryManager - Original path:', imagePath);
          
          let fullUrl = imagePath;

          // If it's not already a full URL
          if (imagePath && !imagePath.startsWith('http')) {
            // If it starts with /storage/, use it as is (Laravel's public symlink)
            if (imagePath.startsWith('/storage/')) {
              fullUrl = `${baseUrl}${imagePath}`;
            } 
            // If it starts with storage/ (without leading slash)
            else if (imagePath.startsWith('storage/')) {
              fullUrl = `${baseUrl}/${imagePath}`;
            }
            // If it's just a filename or relative path
            else {
              fullUrl = `${baseUrl}/storage/${imagePath}`;
            }
          }

          console.log('ImageGalleryManager - Constructed URL:', fullUrl);

          return {
            id: img.id,
            preview: fullUrl,
            alt_text: img.alt_text || '',
            is_primary: img.is_primary,
            sort_order: img.sort_order,
            uploaded: true,
          };
        });
      
      console.log('ImageGalleryManager - Final mapped images:', mappedImages);
      setImages(mappedImages);
      onImagesChange?.(mappedImages);
    } catch (err: any) {
      console.error('Failed to load existing images:', err);
      setError('Failed to load existing images');
    } finally {
      setIsLoadingImages(false);
    }
  };

  const notifyChange = useCallback(
    (updatedImages: ImageItem[]) => {
      setImages(updatedImages);
      onImagesChange?.(updatedImages);
    },
    [onImagesChange]
  );

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);
    const fileArray = Array.from(files);

    // Validate total images
    if (images.length + fileArray.length > maxImages) {
      setError(`Maximum ${maxImages} images allowed`);
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    for (const file of fileArray) {
      const validation = productImageService.validateImageFile(file);
      if (!validation.valid) {
        setError(validation.error || 'Invalid file');
        return;
      }
      validFiles.push(file);
    }

    // Create preview URLs
    const newImages: ImageItem[] = validFiles.map((file, index) => ({
      file,
      preview: productImageService.createPreviewUrl(file),
      alt_text: '',
      is_primary: images.length === 0 && index === 0,
      sort_order: images.length + index,
      uploaded: false,
    }));

    // If productId exists and auto-upload is not disabled, upload immediately
    if (productId && !disableAutoUpload) {
      setUploading(true);
      
      // Add placeholders to the UI immediately so user sees progress
      notifyChange([...images, ...newImages]);

      try {
        const uploadPromises = newImages.map(async (imageItem) => {
          if (!imageItem.file) return null;
          
          try {
            const uploadedImage = await productImageService.uploadImage(
              productId,
              imageItem.file,
              {
                alt_text: imageItem.alt_text,
                is_primary: imageItem.is_primary,
                sort_order: imageItem.sort_order,
              }
            );

            // Construct proper URL for the uploaded image
            const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
            let imagePath = uploadedImage.image_url || uploadedImage.image_path || '';
            let fullUrl = imagePath;

            if (imagePath && !imagePath.startsWith('http')) {
              if (imagePath.startsWith('/storage/')) {
                fullUrl = `${baseUrl}${imagePath}`;
              } else if (imagePath.startsWith('storage/')) {
                fullUrl = `${baseUrl}/${imagePath}`;
              } else {
                fullUrl = `${baseUrl}/storage/${imagePath}`;
              }
            }

            return {
              id: uploadedImage.id,
              preview: fullUrl,
              alt_text: uploadedImage.alt_text || '',
              is_primary: uploadedImage.is_primary,
              sort_order: uploadedImage.sort_order,
              uploaded: true,
            };
          } catch (err) {
            console.error(`Failed to upload ${imageItem.file.name}:`, err);
            return null;
          }
        });

        const results = await Promise.all(uploadPromises);
        const successfulUploads = results.filter((img): img is ImageItem => img !== null);

        // Update with final results (replacing placeholders)
        // Note: This logic is slightly simplified; in a production app we'd match 
        // placeholders by preview URL to replace them accurately.
        // For now, we'll just refresh the whole list by removing failed placeholders.
        const currentImages = images; // Images that were already there
        const finalImages = [...currentImages, ...successfulUploads];
        notifyChange(finalImages);
        
        if (successfulUploads.length < newImages.length) {
          setError(`Failed to upload ${newImages.length - successfulUploads.length} image(s)`);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to upload images');
      } finally {
        setUploading(false);
      }
    } else {
      // Just add to state if no productId (will upload on product creation)
      notifyChange([...images, ...newImages]);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      handleFileSelect(e.dataTransfer.files);
    },
    [images, maxImages, productId]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const removeImage = async (index: number) => {
    const imageItem = images[index];

    // If image is already uploaded, delete from server
    if (imageItem.uploaded && imageItem.id && productId) {
      try {
        await productImageService.deleteImage(imageItem.id);
      } catch (err: any) {
        setError(err.message || 'Failed to delete image');
        return;
      }
    }

    // Revoke preview URL if it's a local file
    if (!imageItem.uploaded && imageItem.file) {
      productImageService.revokePreviewUrl(imageItem.preview);
    }

    const updatedImages = images.filter((_, i) => i !== index);
    
    // Reorder sort_order for remaining images.
    // Only promote the first image to primary if NO other image already holds that flag.
    const remainingHasPrimary = updatedImages.some(img => img.is_primary);
    const reorderedImages = updatedImages.map((img, idx) => ({
      ...img,
      sort_order: idx,
      is_primary: remainingHasPrimary ? img.is_primary : idx === 0,
    }));

    notifyChange(reorderedImages);
  };

  const setPrimaryImage = async (index: number) => {
    const imageItem = images[index];

    // If image is uploaded and has ID, update on server
    if (imageItem.uploaded && imageItem.id && productId) {
      try {
        await productImageService.makePrimary(imageItem.id);
      } catch (err: any) {
        setError(err.message || 'Failed to set primary image');
        return;
      }
    }

    const updatedImages = images.map((img, idx) => ({
      ...img,
      is_primary: idx === index,
    }));

    notifyChange(updatedImages);
  };

  const updateAltText = async (index: number, altText: string) => {
    const imageItem = images[index];

    // If image is uploaded, update on server
    if (imageItem.uploaded && imageItem.id && productId) {
      try {
        await productImageService.updateImage(imageItem.id, { alt_text: altText });
      } catch (err: any) {
        console.error('Failed to update alt text:', err);
      }
    }

    const updatedImages = [...images];
    updatedImages[index] = { ...updatedImages[index], alt_text: altText };
    notifyChange(updatedImages);
  };

  // Drag and Drop Reordering
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragEnter = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;

    const newImages = [...images];
    const draggedItem = newImages[draggedIndex];
    newImages.splice(draggedIndex, 1);
    newImages.splice(index, 0, draggedItem);

    setImages(newImages);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);

    // Update sort orders
    const reorderedImages = images.map((img, idx) => ({
      ...img,
      sort_order: idx,
    }));

    // If uploaded, sync with server
    if (productId && reorderedImages.some((img) => img.uploaded)) {
      try {
        setReordering(true);
        const imageOrders = reorderedImages
          .filter((img) => img.id)
          .map((img) => ({
            image_id: img.id!,
            sort_order: img.sort_order,
          }));

        await productImageService.reorderImages(productId, imageOrders);
      } catch (err: any) {
        setError(err.message || 'Failed to reorder images');
      } finally {
        setReordering(false);
      }
    }

    notifyChange(reorderedImages);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
          <X className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoadingImages && (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading images...</p>
        </div>
      )}

      {/* Upload Zone */}
      {images.length < maxImages && !isLoadingImages && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-gray-400 dark:hover:border-gray-500 transition-colors cursor-pointer"
        >
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            id="image-upload"
            disabled={uploading}
          />
          <label htmlFor="image-upload" className="cursor-pointer">
            <div className="flex flex-col items-center gap-3">
              {uploading ? (
                <>
                  <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Uploading images...
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {productId ? 'Upload more images' : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      PNG, JPG, GIF, WebP up to 5MB (Max {maxImages} images)
                    </p>
                  </div>
                </>
              )}
            </div>
          </label>
        </div>
      )}

      {/* Image Gallery */}
      {images.length > 0 && !isLoadingImages && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Product Images ({images.length}/{maxImages})
            </h3>
            {allowReorder && images.length > 1 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <MoveVertical className="w-3 h-3 inline mr-1" />
                Drag to reorder
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {images.map((image, index) => (
              <div
                key={image.id || index}
                draggable={allowReorder}
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                className={`relative group border-2 rounded-lg overflow-hidden transition-all ${
                  image.is_primary
                    ? 'border-yellow-400 dark:border-yellow-500'
                    : 'border-gray-200 dark:border-gray-700'
                } ${draggedIndex === index ? 'opacity-50' : ''} ${
                  allowReorder ? 'cursor-move' : ''
                }`}
              >
                {/* Image */}
                <div className="aspect-square bg-gray-100 dark:bg-gray-800">
                  <img
                    src={image.preview}
                    alt={image.alt_text || `Product image ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.error('Image failed to load:', image.preview);
                      if (!e.currentTarget.src.includes('/placeholder-image.jpg')) {
                        e.currentTarget.src = '/placeholder-image.jpg';
                      }
                    }}
                  />
                </div>

                {/* Primary Badge */}
                {image.is_primary && (
                  <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 shadow-lg">
                    <Star className="w-3 h-3 fill-current" />
                    Primary
                  </div>
                )}

                {/* Uploading/Reordering Overlay */}
                {((!image.uploaded && uploading) || reordering) && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-20">
                    <div className="bg-white/20 p-2 rounded-full backdrop-blur-md">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  </div>
                )}

                {/* Actions Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                  {!image.is_primary && (
                    <button
                      onClick={() => setPrimaryImage(index)}
                      className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                    >
                      <Star className="w-3 h-3" />
                      Set as Primary
                    </button>
                  )}
                  <button
                    onClick={() => removeImage(index)}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Remove
                  </button>
                </div>

                {/* Alt Text Input */}
                <div className="p-2 bg-white dark:bg-gray-800">
                  <input
                    type="text"
                    placeholder="Alt text (optional)"
                    value={image.alt_text}
                    onChange={(e) => updateAltText(index, e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {images.length === 0 && !isLoadingImages && (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {productId ? 'No images uploaded yet.' : 'No images yet. Upload some to get started!'}
          </p>
        </div>
      )}
    </div>
  );
}