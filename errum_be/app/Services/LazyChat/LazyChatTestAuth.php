<?php

namespace App\Services\LazyChat;

use App\Models\Employee;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;
use Throwable;

class LazyChatTestAuth
{
    public function ensureToken(bool $forceRefresh = false): array
    {
        if (!$forceRefresh) {
            $cached = $this->readCachedToken();
            if ($cached && $this->isUsable($cached)) {
                return array_merge($cached, [
                    'cached' => true,
                    'employee_id' => $cached['employee_id'] ?? $this->employee()?->id,
                ]);
            }
        }

        $email = config('lazychat.testing.auth.email');
        $password = config('lazychat.testing.auth.password');

        if (!$email || !$password) {
            throw new \RuntimeException('LazyChat test login email/password is missing. Set LAZYCHAT_TEST_LOGIN_EMAIL and LAZYCHAT_TEST_LOGIN_PASSWORD.');
        }

        $token = Auth::guard('api')->attempt([
            'email' => $email,
            'password' => $password,
        ]);

        if (!$token) {
            throw new \RuntimeException('LazyChat test login failed for configured account.');
        }

        $ttl = (int) Auth::guard('api')->factory()->getTTL() * 60;
        $employee = Auth::guard('api')->user() ?: $this->employee();

        $data = [
            'access_token' => $token,
            'token_type' => 'bearer',
            'expires_in' => $ttl,
            'expires_at' => now()->addSeconds($ttl)->toIso8601String(),
            'email' => $email,
            'employee_id' => $employee?->id,
            'saved_at' => now()->toIso8601String(),
            'cached' => false,
        ];

        $this->writeCachedToken($data);

        if ($employee) {
            Auth::guard('api')->setUser($employee);
        }

        return $data;
    }

    public function headers(): array
    {
        $tokenData = $this->ensureToken();
        $accessToken = $tokenData['access_token'] ?? null;

        if (!$accessToken) {
            return [];
        }

        return [
            'X-Errum-Authorization' => 'Bearer ' . $accessToken,
            'X-Errum-Access-Token' => $accessToken,
            'X-Backend-Authorization' => 'Bearer ' . $accessToken,
            'X-Backend-Access-Token' => $accessToken,
            'X-Admin-Authorization' => 'Bearer ' . $accessToken,
            'X-Errum-Auth-Email' => (string) ($tokenData['email'] ?? config('lazychat.testing.auth.email')),
        ];
    }

    public function employee(): ?Employee
    {
        $email = config('lazychat.testing.auth.email');

        if (!$email) {
            return null;
        }

        return Employee::where('email', $email)->first();
    }

    public function safeSummary(?array $tokenData = null): array
    {
        $tokenData = $tokenData ?: $this->readCachedToken() ?: [];

        return [
            'email' => $tokenData['email'] ?? config('lazychat.testing.auth.email'),
            'employee_id' => $tokenData['employee_id'] ?? $this->employee()?->id,
            'token_saved' => !empty($tokenData['access_token']),
            'token_type' => $tokenData['token_type'] ?? null,
            'expires_at' => $tokenData['expires_at'] ?? null,
            'cached' => (bool) ($tokenData['cached'] ?? false),
            'cache_file' => $this->path(),
        ];
    }

    private function readCachedToken(): ?array
    {
        try {
            if (!File::exists($this->path())) {
                return null;
            }

            $decoded = json_decode(File::get($this->path()), true);

            return is_array($decoded) ? $decoded : null;
        } catch (Throwable) {
            return null;
        }
    }

    private function writeCachedToken(array $data): void
    {
        File::ensureDirectoryExists(dirname($this->path()));
        File::put($this->path(), json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function isUsable(array $cached): bool
    {
        if (empty($cached['access_token']) || empty($cached['expires_at'])) {
            return false;
        }

        return now()->addMinute()->lt($cached['expires_at']);
    }

    private function path(): string
    {
        $relativePath = config('lazychat.testing.auth.token_cache_path', 'lazychat-test-auth.json');

        return storage_path('app/' . ltrim($relativePath, '/'));
    }
}
