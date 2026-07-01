<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImageCompressionService
{
    // Target around 65% smaller when possible, without resizing dimensions.
    private const TARGET_RATIO = 0.35;
    private const QUALITIES = [82, 78, 74, 70, 66, 62, 58, 54, 50, 46];

    public function storeUploadedImage(UploadedFile $file, string $directory, ?string $baseName = null): string
    {
        $this->ensureWebpSupport();

        $directory = trim($directory, '/');
        Storage::disk('public')->makeDirectory($directory);

        $fileName = $this->webpFileName($file, $baseName);
        $relativePath = $directory . '/' . $fileName;
        $absolutePath = Storage::disk('public')->path($relativePath);

        $this->saveBestWebp(
            $file->getRealPath(),
            $absolutePath,
            $file->getSize(),
            $file->getMimeType()
        );

        return $relativePath;
    }

    public function compressPublicDiskImage(string $path): array
    {
        $this->ensureWebpSupport();

        $oldPath = ltrim($path, '/');
        if ($oldPath === '' || !Storage::disk('public')->exists($oldPath)) {
            return [
                'changed' => false,
                'skipped' => true,
                'reason' => 'File not found on public disk.',
                'old_path' => $oldPath,
                'new_path' => $oldPath,
            ];
        }

        $absoluteSource = Storage::disk('public')->path($oldPath);
        $mimeType = @mime_content_type($absoluteSource);

        if (!$this->isSupportedMime($mimeType)) {
            return [
                'changed' => false,
                'skipped' => true,
                'reason' => 'Unsupported image type: ' . ($mimeType ?: 'unknown'),
                'old_path' => $oldPath,
                'new_path' => $oldPath,
            ];
        }

        $originalSize = @filesize($absoluteSource) ?: 0;
        $newPath = $this->webpPathFor($oldPath);
        $absoluteTarget = Storage::disk('public')->path($newPath);
        $targetDirectory = dirname($absoluteTarget);

        if (!is_dir($targetDirectory)) {
            mkdir($targetDirectory, 0775, true);
        }

        $tmpPath = $absoluteTarget . '.tmp-' . Str::random(8) . '.webp';
        $compressedSize = $this->saveBestWebp($absoluteSource, $tmpPath, $originalSize, $mimeType);

        if ($newPath === $oldPath && $compressedSize >= $originalSize) {
            @unlink($tmpPath);
            return [
                'changed' => false,
                'skipped' => true,
                'reason' => 'Already WebP and recompression was not smaller.',
                'old_path' => $oldPath,
                'new_path' => $newPath,
                'original_size' => $originalSize,
                'compressed_size' => $originalSize,
            ];
        }

        if ($newPath !== $oldPath && Storage::disk('public')->exists($newPath)) {
            $newPath = $this->uniqueWebpPath($oldPath);
            $absoluteTarget = Storage::disk('public')->path($newPath);
        }

        if (!@rename($tmpPath, $absoluteTarget)) {
            @unlink($tmpPath);
            throw new \RuntimeException('Could not save compressed WebP image: ' . $newPath);
        }

        $finalSize = @filesize($absoluteTarget) ?: $compressedSize;

        return [
            'changed' => true,
            'skipped' => false,
            'old_path' => $oldPath,
            'new_path' => $newPath,
            'original_size' => $originalSize,
            'compressed_size' => $finalSize,
            'saved_bytes' => max(0, $originalSize - $finalSize),
        ];
    }

    private function webpFileName(UploadedFile $file, ?string $baseName): string
    {
        $name = $baseName ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $name = trim(Str::slug($name), '-');

        if ($name === '') {
            $name = 'image';
        }

        return $name . '-' . time() . '-' . Str::random(8) . '.webp';
    }

    private function webpPathFor(string $path): string
    {
        $directory = trim(dirname($path), '.');
        $fileName = pathinfo($path, PATHINFO_FILENAME) . '.webp';

        return ($directory ? trim($directory, '/') . '/' : '') . $fileName;
    }

    private function uniqueWebpPath(string $path): string
    {
        $directory = trim(dirname($path), '.');
        $fileName = pathinfo($path, PATHINFO_FILENAME) . '-' . Str::random(6) . '.webp';

        return ($directory ? trim($directory, '/') . '/' : '') . $fileName;
    }

    private function saveBestWebp(string $sourcePath, string $targetPath, int $originalSize = 0, ?string $mimeType = null): int
    {
        if (function_exists('imagewebp')) {
            return $this->saveBestWebpWithGd($sourcePath, $targetPath, $originalSize, $mimeType);
        }

        if (class_exists('Imagick')) {
            return $this->saveBestWebpWithImagick($sourcePath, $targetPath, $originalSize);
        }

        throw new \RuntimeException('PHP GD WebP support or Imagick is required to compress images.');
    }

    private function saveBestWebpWithGd(string $sourcePath, string $targetPath, int $originalSize = 0, ?string $mimeType = null): int
    {
        $image = $this->imageResourceFromFile($sourcePath, $mimeType);
        $image = $this->normalizeCanvas($image);
        $targetSize = $originalSize > 0 ? (int) floor($originalSize * self::TARGET_RATIO) : null;
        $bestSize = null;

        foreach (self::QUALITIES as $quality) {
            if (file_exists($targetPath)) {
                @unlink($targetPath);
            }

            if (!imagewebp($image, $targetPath, $quality)) {
                imagedestroy($image);
                throw new \RuntimeException('GD could not encode WebP image.');
            }

            clearstatcache(true, $targetPath);
            $bestSize = @filesize($targetPath) ?: 0;

            if (!$targetSize || $bestSize <= $targetSize) {
                break;
            }
        }

        imagedestroy($image);

        return (int) $bestSize;
    }

    private function saveBestWebpWithImagick(string $sourcePath, string $targetPath, int $originalSize = 0): int
    {
        $targetSize = $originalSize > 0 ? (int) floor($originalSize * self::TARGET_RATIO) : null;
        $bestSize = null;

        foreach (self::QUALITIES as $quality) {
            if (file_exists($targetPath)) {
                @unlink($targetPath);
            }

            $image = new \Imagick($sourcePath);
            if ($image->getNumberImages() > 1) {
                $image->setIteratorIndex(0);
            }
            if (method_exists($image, 'autoOrient')) {
                $image->autoOrient();
            }
            $image->setImagePage(0, 0, 0, 0);
            $image->setImageFormat('webp');
            $image->setOption('webp:method', '6');
            $image->setImageCompressionQuality($quality);
            $image->stripImage();
            $image->writeImage($targetPath);
            $image->clear();
            $image->destroy();

            clearstatcache(true, $targetPath);
            $bestSize = @filesize($targetPath) ?: 0;

            if (!$targetSize || $bestSize <= $targetSize) {
                break;
            }
        }

        return (int) $bestSize;
    }

    private function imageResourceFromFile(string $sourcePath, ?string $mimeType = null)
    {
        $mimeType = $mimeType ?: @mime_content_type($sourcePath);

        switch ($mimeType) {
            case 'image/jpeg':
            case 'image/jpg':
                $image = imagecreatefromjpeg($sourcePath);
                return $this->applyJpegOrientation($image, $sourcePath);
            case 'image/png':
                return imagecreatefrompng($sourcePath);
            case 'image/gif':
                return imagecreatefromgif($sourcePath);
            case 'image/webp':
                return imagecreatefromwebp($sourcePath);
            default:
                throw new \RuntimeException('Unsupported image type: ' . ($mimeType ?: 'unknown'));
        }
    }

    private function normalizeCanvas($image)
    {
        if (!$image) {
            throw new \RuntimeException('Could not read image file.');
        }

        $width = imagesx($image);
        $height = imagesy($image);
        $canvas = imagecreatetruecolor($width, $height);

        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
        imagefilledrectangle($canvas, 0, 0, $width, $height, $transparent);
        imagecopy($canvas, $image, 0, 0, 0, 0, $width, $height);
        imagedestroy($image);

        return $canvas;
    }

    private function applyJpegOrientation($image, string $sourcePath)
    {
        if (!$image || !function_exists('exif_read_data')) {
            return $image;
        }

        $exif = @exif_read_data($sourcePath);
        $orientation = $exif['Orientation'] ?? null;

        if ($orientation == 3) {
            return imagerotate($image, 180, 0);
        }

        if ($orientation == 6) {
            return imagerotate($image, -90, 0);
        }

        if ($orientation == 8) {
            return imagerotate($image, 90, 0);
        }

        return $image;
    }

    private function ensureWebpSupport(): void
    {
        if (!function_exists('imagewebp') && !class_exists('Imagick')) {
            throw new \RuntimeException('PHP GD WebP support or Imagick is required to compress images.');
        }
    }

    private function isSupportedMime(?string $mimeType): bool
    {
        return in_array($mimeType, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'], true);
    }
}
