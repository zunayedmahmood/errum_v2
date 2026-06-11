<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImageOptimizer
{
    /**
     * Store an uploaded image exactly as provided.
     *
     * Compression/WebP conversion is intentionally disabled so image uploads
     * are saved immediately without CPU-heavy processing.
     */
    public static function storeOptimized(UploadedFile $file, string $directory, ?string $baseName = null): string
    {
        return self::storeOriginal($file, trim($directory, '/'), $baseName);
    }

    public static function thumbnailPathFor(?string $imagePath): ?string
    {
        if (!$imagePath) {
            return null;
        }

        $imagePath = trim($imagePath, '/');
        $directory = trim(dirname($imagePath), '.');
        $filename = basename($imagePath);

        return ($directory ? $directory . '/' : '') . 'thumbs/' . $filename;
    }

    public static function deleteImageAndThumbnailIfUnused(?string $imagePath, bool $deleteOriginal = true): void
    {
        if (!$imagePath) {
            return;
        }

        $disk = Storage::disk('public');
        $thumbPath = self::thumbnailPathFor($imagePath);

        if ($deleteOriginal && $disk->exists($imagePath)) {
            $disk->delete($imagePath);
        }

        // Keep this cleanup so old WebP-era thumbnails do not become orphaned.
        if ($thumbPath && $disk->exists($thumbPath)) {
            $disk->delete($thumbPath);
        }
    }

    private static function storeOriginal(UploadedFile $file, string $directory, ?string $baseName = null): string
    {
        $extension = Str::lower($file->getClientOriginalExtension() ?: 'jpg');
        $imageName = ($baseName ?: (time() . '_' . Str::random(10))) . '.' . $extension;

        return $file->storeAs($directory, $imageName, 'public');
    }
}
