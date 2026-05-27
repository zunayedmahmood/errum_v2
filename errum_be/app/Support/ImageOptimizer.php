<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImageOptimizer
{
    private const MAX_WIDTH = 1600;
    private const MAX_HEIGHT = 1600;
    private const THUMB_MAX_WIDTH = 420;
    private const THUMB_MAX_HEIGHT = 420;
    private const WEBP_QUALITY = 76;

    /**
     * Store an uploaded image as optimized WebP and create a lightweight thumbnail.
     * Falls back to the original upload if GD/WebP support is unavailable.
     */
    public static function storeOptimized(UploadedFile $file, string $directory, ?string $baseName = null): string
    {
        $directory = trim($directory, '/');

        if (!self::canOptimize($file)) {
            return self::storeOriginal($file, $directory, $baseName);
        }

        $source = self::createImageResource($file);
        if (!$source) {
            return self::storeOriginal($file, $directory, $baseName);
        }

        if (self::isJpeg($file) && function_exists('exif_read_data')) {
            $source = self::applyJpegOrientation($source, $file->getRealPath());
        }

        $imageName = ($baseName ?: (time() . '_' . Str::random(10))) . '.webp';
        $imagePath = $directory . '/' . $imageName;
        $thumbPath = self::thumbnailPathFor($imagePath);

        try {
            $optimized = self::resizeImage($source, self::MAX_WIDTH, self::MAX_HEIGHT);
            $thumbnail = self::resizeImage($source, self::THUMB_MAX_WIDTH, self::THUMB_MAX_HEIGHT);

            Storage::disk('public')->put($imagePath, self::webpContents($optimized));
            Storage::disk('public')->put($thumbPath, self::webpContents($thumbnail));

            imagedestroy($optimized);
            imagedestroy($thumbnail);
            imagedestroy($source);

            return $imagePath;
        } catch (\Throwable $e) {
            if (isset($optimized)) {
                self::destroyImage($optimized);
            }
            if (isset($thumbnail)) {
                self::destroyImage($thumbnail);
            }
            self::destroyImage($source);

            return self::storeOriginal($file, $directory, $baseName);
        }
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

        if ($thumbPath && $disk->exists($thumbPath)) {
            $disk->delete($thumbPath);
        }
    }

    private static function canOptimize(UploadedFile $file): bool
    {
        return extension_loaded('gd')
            && function_exists('imagewebp')
            && in_array($file->getMimeType(), ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true);
    }

    private static function storeOriginal(UploadedFile $file, string $directory, ?string $baseName = null): string
    {
        $extension = Str::lower($file->getClientOriginalExtension() ?: 'jpg');
        $imageName = ($baseName ?: (time() . '_' . Str::random(10))) . '.' . $extension;

        return $file->storeAs($directory, $imageName, 'public');
    }

    private static function createImageResource(UploadedFile $file)
    {
        $path = $file->getRealPath();

        return match ($file->getMimeType()) {
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/png' => @imagecreatefrompng($path),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false,
            'image/gif' => @imagecreatefromgif($path),
            default => false,
        };
    }

    private static function resizeImage($source, int $maxWidth, int $maxHeight)
    {
        $sourceWidth = imagesx($source);
        $sourceHeight = imagesy($source);

        if ($sourceWidth <= 0 || $sourceHeight <= 0) {
            throw new \RuntimeException('Invalid image dimensions.');
        }

        $ratio = min($maxWidth / $sourceWidth, $maxHeight / $sourceHeight, 1);
        $targetWidth = max(1, (int) round($sourceWidth * $ratio));
        $targetHeight = max(1, (int) round($sourceHeight * $ratio));

        $target = imagecreatetruecolor($targetWidth, $targetHeight);
        imagealphablending($target, false);
        imagesavealpha($target, true);

        $transparent = imagecolorallocatealpha($target, 255, 255, 255, 127);
        imagefilledrectangle($target, 0, 0, $targetWidth, $targetHeight, $transparent);

        imagecopyresampled(
            $target,
            $source,
            0,
            0,
            0,
            0,
            $targetWidth,
            $targetHeight,
            $sourceWidth,
            $sourceHeight
        );

        return $target;
    }

    private static function webpContents($image): string
    {
        ob_start();
        imagewebp($image, null, self::WEBP_QUALITY);
        $contents = ob_get_clean();

        if ($contents === false || $contents === '') {
            throw new \RuntimeException('Failed to generate WebP image.');
        }

        return $contents;
    }

    private static function isJpeg(UploadedFile $file): bool
    {
        return $file->getMimeType() === 'image/jpeg';
    }

    private static function applyJpegOrientation($image, string $path)
    {
        try {
            $exif = @exif_read_data($path);
            $orientation = $exif['Orientation'] ?? null;

            if (!$orientation) {
                return $image;
            }

            $rotated = match ((int) $orientation) {
                3 => imagerotate($image, 180, 0),
                6 => imagerotate($image, -90, 0),
                8 => imagerotate($image, 90, 0),
                default => $image,
            };

            return $rotated ?: $image;
        } catch (\Throwable $e) {
            return $image;
        }
    }

    private static function destroyImage($image): void
    {
        if ($image instanceof \GdImage || is_resource($image)) {
            imagedestroy($image);
        }
    }
}
