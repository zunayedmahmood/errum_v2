<?php

namespace App\Http\Controllers;

use Spatie\Activitylog\Models\Activity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Response;
use App\Traits\DatabaseAgnosticSearch;
use Carbon\Carbon;

class ActivityLogController extends Controller
{
    use DatabaseAgnosticSearch;

    /**
     * List all activity logs with advanced filtering
     * 
     * GET /api/activity-logs
     * 
     * Query Parameters:
     * - event: created, updated, deleted
     * - subject_type: Model class name (e.g., Order, Product, Customer)
     * - subject_id: ID of the subject
     * - causer_type: Employee, Customer
     * - causer_id: ID of the person who caused the activity
     * - log_name: Table name
     * - date_from: Start date (YYYY-MM-DD)
     * - date_to: End date (YYYY-MM-DD)
     * - search: Search in description
     * - sort_by: created_at, event, subject_type (default: created_at)
     * - sort_direction: asc, desc (default: desc)
     * - per_page: Items per page (default: 50)
     */
    public function index(Request $request)
    {
        $query = Activity::query();

        // Load relationships with soft-deleted models
        // This prevents crashes when causer or subject is soft-deleted
        $query->with([
            'causer' => function ($q) {
                // Load even if soft-deleted (for audit trail)
                if (method_exists($q->getModel(), 'withTrashed')) {
                    $q->withTrashed();
                }
            },
            'subject' => function ($q) {
                // Load even if soft-deleted (for audit trail)
                if (method_exists($q->getModel(), 'withTrashed')) {
                    $q->withTrashed();
                }
            }
        ]);

        // Filter by event type (created, updated, deleted)
        if ($request->filled('event')) {
            $query->where('event', $request->event);
        }

        // Filter by subject type (model)
        if ($request->filled('subject_type')) {
            $subjectType = $request->subject_type;
            
            // Allow short names like "Order" instead of full "App\Models\Order"
            if (!str_contains($subjectType, '\\')) {
                $subjectType = "App\\Models\\{$subjectType}";
            }
            
            $query->where('subject_type', $subjectType);
        }

        // Filter by subject ID
        if ($request->filled('subject_id')) {
            $query->where('subject_id', $request->subject_id);
        }

        // Filter by causer type (Employee, Customer)
        if ($request->filled('causer_type')) {
            $causerType = $request->causer_type;
            
            if (!str_contains($causerType, '\\')) {
                $causerType = "App\\Models\\{$causerType}";
            }
            
            $query->where('causer_type', $causerType);
        }

        // Filter by causer ID (specific user)
        if ($request->filled('causer_id')) {
            $query->where('causer_id', $request->causer_id);
        }

        // Filter by log name (table name)
        if ($request->filled('log_name')) {
            $query->where('log_name', $request->log_name);
        }

        // Business category filter. New logs carry properties.category; the
        // subject type fallback keeps historical logs visible as well.
        if ($request->filled('category') && $request->category !== 'all') {
            $category = $request->category;
            $subjectTypes = $this->subjectTypesForCategory($category);
            $query->where(function ($q) use ($category, $subjectTypes) {
                $q->whereJsonContains('properties->category', $category);

                if ($category === 'store-assignments') {
                    $q->orWhere(function ($assignmentQ) {
                        $assignmentQ->where('subject_type', 'App\Models\Order')
                            ->where('event', 'updated')
                            ->whereRaw("JSON_EXTRACT(properties, '$.attributes.store_id') IS NOT NULL");
                    });
                } elseif ($subjectTypes) {
                    $q->orWhereIn('subject_type', $subjectTypes);
                }
            });
        }

        // Date range filter
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        // Search in description
        if ($request->filled('search')) {
            $this->whereLike($query, 'description', $request->search);
        }

        // Sorting
        $sortBy = $request->get('sort_by', 'created_at');
        $sortDirection = $request->get('sort_direction', 'desc');
        
        $allowedSortFields = ['created_at', 'event', 'subject_type', 'causer_type', 'log_name'];
        if (in_array($sortBy, $allowedSortFields)) {
            $query->orderBy($sortBy, $sortDirection);
        } else {
            $query->orderByDesc('created_at');
        }

        // Pagination
        $perPage = $request->get('per_page', 50);
        $paginatedLogs = $query->paginate($perPage);

        // Transform data into a human-readable, stable frontend contract.
        $transformedItems = collect($paginatedLogs->items())->map(function ($log) {
            return $this->formatForFrontend($log);
        });

        // Rebuild pagination with transformed items
        $logs = new \Illuminate\Pagination\LengthAwarePaginator(
            $transformedItems,
            $paginatedLogs->total(),
            $paginatedLogs->perPage(),
            $paginatedLogs->currentPage(),
            ['path' => \Illuminate\Pagination\Paginator::resolveCurrentPath()]
        );

        return response()->json($logs);
    }

    /**
     * Get details of a specific activity log
     * 
     * GET /api/activity-logs/{id}
     */
    public function show($id)
    {
        $log = Activity::with([
            'causer' => function ($q) {
                if (method_exists($q->getModel(), 'withTrashed')) {
                    $q->withTrashed();
                }
            },
            'subject' => function ($q) {
                if (method_exists($q->getModel(), 'withTrashed')) {
                    $q->withTrashed();
                }
            }
        ])->findOrFail($id);

        // Safely get properties
        $properties = $log->properties ?? collect([]);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $log->id,
                'event' => $log->event,
                'description' => $log->description,
                'log_name' => $log->log_name,
                'batch_uuid' => $log->batch_uuid,
                
                'subject' => [
                    'type' => $log->subject_type ? class_basename($log->subject_type) : null,
                    'full_type' => $log->subject_type,
                    'id' => $log->subject_id,
                    'data' => $log->subject,
                ],
                
                'causer' => [
                    'type' => $log->causer_type ? class_basename($log->causer_type) : null,
                    'full_type' => $log->causer_type,
                    'id' => $log->causer_id,
                    'name' => $log->causer ? ($log->causer->name ?? $log->causer->email ?? 'Unknown') : 'System',
                    'data' => $log->causer,
                ],
                
                'properties' => $properties,
                
                'changes' => [
                    'attributes' => $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('attributes', []) 
                        : ($properties['attributes'] ?? []),
                    'old' => $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('old', []) 
                        : ($properties['old'] ?? []),
                ],
                
                'metadata' => [
                    'ip_address' => $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('ip_address') 
                        : ($properties['ip_address'] ?? null),
                    'user_agent' => $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('user_agent') 
                        : ($properties['user_agent'] ?? null),
                    'url' => $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('url') 
                        : ($properties['url'] ?? null),
                    'method' => $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('method') 
                        : ($properties['method'] ?? null),
                ],
                
                'created_at' => $log->created_at ? $log->created_at->toIso8601String() : null,
                'created_at_human' => $log->created_at ? $log->created_at->diffForHumans() : null,
                'created_at_formatted' => $log->created_at ? $log->created_at->format('Y-m-d H:i:s') : null,
                'updated_at' => $log->updated_at ? $log->updated_at->toIso8601String() : null,
            ]
        ]);
    }

    /**
     * Get statistics for activity logs
     * 
     * GET /api/activity-logs/statistics
     */
    public function getStatistics(Request $request)
    {
        $query = Activity::query();

        // Apply same filters as index
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        } else {
            // Default to last 30 days
            $query->where('created_at', '>=', now()->subDays(30));
        }

        $stats = [
            'total_activities' => (clone $query)->count(),
            'by_event' => (clone $query)->selectRaw('event, COUNT(*) as count')
                ->groupBy('event')
                ->pluck('count', 'event')
                ->toArray(),
            'by_model' => (clone $query)->selectRaw('subject_type, COUNT(*) as count')
                ->groupBy('subject_type')
                ->orderByDesc('count')
                ->limit(10)
                ->get()
                ->map(fn($item) => [
                    'model' => class_basename($item->subject_type),
                    'count' => $item->count
                ])
                ->toArray(),
            'by_user' => (clone $query)->selectRaw('causer_type, causer_id, COUNT(*) as count')
                ->whereNotNull('causer_id')
                ->groupBy('causer_type', 'causer_id')
                ->orderByDesc('count')
                ->limit(10)
                ->get()
                ->map(function($item) {
                    $causer = app($item->causer_type)->find($item->causer_id);
                    return [
                        'user' => $causer ? ($causer->name ?? $causer->email) : 'Unknown',
                        'type' => class_basename($item->causer_type),
                        'count' => $item->count
                    ];
                })
                ->toArray(),
            'today' => (clone $query)->whereDate('created_at', today())->count(),
            'this_week' => (clone $query)->whereBetween('created_at', [
                now()->startOfWeek(),
                now()->endOfWeek()
            ])->count(),
            'this_month' => (clone $query)->whereMonth('created_at', now()->month)
                ->whereYear('created_at', now()->year)
                ->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $stats
        ]);
    }

    /**
     * Get activity logs for a specific model instance
     * 
     * GET /api/activity-logs/model/{model}/{id}
     * Example: /api/activity-logs/model/Order/123
     */
    public function getModelLogs($modelType, $modelId)
    {
        // Allow short names
        if (!str_contains($modelType, '\\')) {
            $modelType = "App\\Models\\{$modelType}";
        }

        $logs = Activity::where('subject_type', $modelType)
            ->where('subject_id', $modelId)
            ->with([
                'causer' => function ($q) {
                    if (method_exists($q->getModel(), 'withTrashed')) {
                        $q->withTrashed();
                    }
                }
            ])
            ->orderByDesc('created_at')
            ->get()
            ->map(function ($log) {
                $properties = $log->properties ?? collect([]);
                
                return [
                    'id' => $log->id,
                    'event' => $log->event,
                    'description' => $log->description,
                    'causer' => [
                        'type' => $log->causer_type ? class_basename($log->causer_type) : null,
                        'name' => $log->causer ? ($log->causer->name ?? $log->causer->email ?? 'Unknown') : 'System',
                    ],
                    'changes' => [
                        'attributes' => $properties instanceof \Illuminate\Support\Collection 
                            ? $properties->get('attributes', []) 
                            : ($properties['attributes'] ?? []),
                        'old' => $properties instanceof \Illuminate\Support\Collection 
                            ? $properties->get('old', []) 
                            : ($properties['old'] ?? []),
                    ],
                    'created_at' => $log->created_at ? $log->created_at->toIso8601String() : null,
                    'created_at_human' => $log->created_at ? $log->created_at->diffForHumans() : null,
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $logs
        ]);
    }

    /**
     * Export activity logs to CSV
     * 
     * GET /api/activity-logs/export/csv
     */
    public function exportCsv(Request $request)
    {
        $query = Activity::query()->with([
            'causer' => function ($q) {
                if (method_exists($q->getModel(), 'withTrashed')) {
                    $q->withTrashed();
                }
            }
        ]);

        // Apply same filters as index
        $this->applyFilters($query, $request);

        // Limit export to prevent memory issues
        $logs = $query->limit(10000)->get();

        $filename = 'activity-logs-' . now()->format('Y-m-d-His') . '.csv';
        
        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ];

        $callback = function() use ($logs) {
            $file = fopen('php://output', 'w');
            
            // CSV Headers
            fputcsv($file, [
                'ID',
                'Event',
                'Description',
                'Model',
                'Model ID',
                'User Type',
                'User Name',
                'IP Address',
                'Date Time',
            ]);

            // CSV Rows
            foreach ($logs as $log) {
                $properties = $log->properties ?? collect([]);
                
                fputcsv($file, [
                    $log->id,
                    $log->event,
                    $log->description,
                    $log->subject_type ? class_basename($log->subject_type) : 'N/A',
                    $log->subject_id,
                    $log->causer_type ? class_basename($log->causer_type) : 'System',
                    $log->causer ? ($log->causer->name ?? $log->causer->email ?? 'Unknown') : 'System',
                    $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('ip_address', 'N/A') 
                        : ($properties['ip_address'] ?? 'N/A'),
                    $log->created_at ? $log->created_at->format('Y-m-d H:i:s') : 'N/A',
                ]);
            }

            fclose($file);
        };

        return Response::stream($callback, 200, $headers);
    }

    /**
     * Export activity logs to Excel (using CSV with proper headers)
     * 
     * GET /api/activity-logs/export/excel
     */
    public function exportExcel(Request $request)
    {
        $query = Activity::query()->with([
            'causer' => function ($q) {
                if (method_exists($q->getModel(), 'withTrashed')) {
                    $q->withTrashed();
                }
            }
        ]);

        // Apply same filters as index
        $this->applyFilters($query, $request);

        $logs = $query->limit(10000)->get();

        $filename = 'activity-logs-' . now()->format('Y-m-d-His') . '.xlsx';
        
        $headers = [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ];

        // For simplicity, using CSV with Excel headers
        // In production, consider using maatwebsite/excel package
        $callback = function() use ($logs) {
            $file = fopen('php://output', 'w');
            
            // Add BOM for Excel UTF-8 support
            fprintf($file, chr(0xEF).chr(0xBB).chr(0xBF));
            
            // Headers
            fputcsv($file, [
                'ID',
                'Event',
                'Description',
                'Model',
                'Model ID',
                'User Type',
                'User Name',
                'IP Address',
                'URL',
                'Method',
                'Date Time',
                'Changes',
            ]);

            foreach ($logs as $log) {
                $properties = $log->properties ?? collect([]);
                $old = $properties instanceof \Illuminate\Support\Collection 
                    ? $properties->get('old', []) 
                    : ($properties['old'] ?? []);
                $new = $properties instanceof \Illuminate\Support\Collection 
                    ? $properties->get('attributes', []) 
                    : ($properties['attributes'] ?? []);
                $changes = [];
                
                foreach ($new as $key => $value) {
                    if (isset($old[$key]) && $old[$key] != $value) {
                        $changes[] = "{$key}: {$old[$key]} → {$value}";
                    }
                }
                
                fputcsv($file, [
                    $log->id,
                    $log->event,
                    $log->description,
                    $log->subject_type ? class_basename($log->subject_type) : 'N/A',
                    $log->subject_id,
                    $log->causer_type ? class_basename($log->causer_type) : 'System',
                    $log->causer ? ($log->causer->name ?? $log->causer->email ?? 'Unknown') : 'System',
                    $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('ip_address', 'N/A') 
                        : ($properties['ip_address'] ?? 'N/A'),
                    $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('url', 'N/A') 
                        : ($properties['url'] ?? 'N/A'),
                    $properties instanceof \Illuminate\Support\Collection 
                        ? $properties->get('method', 'N/A') 
                        : ($properties['method'] ?? 'N/A'),
                    $log->created_at ? $log->created_at->format('Y-m-d H:i:s') : 'N/A',
                    implode('; ', $changes),
                ]);
            }

            fclose($file);
        };

        return Response::stream($callback, 200, $headers);
    }

    /**
     * Convert an activity row into a readable audit record.
     */
    private function formatForFrontend(Activity $log): array
    {
        $properties = $this->propertiesToArray($log->properties);
        $old = $this->arrayValue($properties, 'old');
        $attributes = $this->arrayValue($properties, 'attributes');
        $fieldChanges = $log->event === 'updated'
            ? $this->buildFieldChanges($old, $attributes)
            : [];
        $subjectType = $log->subject_type ? class_basename($log->subject_type) : null;
        $category = $properties['category'] ?? $this->categoryFromSubject($subjectType, $log->log_name);
        $identifier = $properties['subject_identifier'] ?? $this->subjectIdentifier($log->subject, $log->subject_id);
        $action = $properties['business_action'] ?? $this->deriveBusinessAction($log->event, $old, $attributes);
        $subjectLabel = $properties['subject_label'] ?? $this->humanize($subjectType ?: $log->log_name ?: 'Record');
        $description = $this->readableDescription($log->description, $action, $subjectLabel, $identifier, $old, $attributes);

        return [
            'id' => $log->id,
            'event' => $log->event,
            'description' => $description,
            'log_name' => $log->log_name,
            'category' => $category,

            'subject' => [
                'type' => $subjectType,
                'full_type' => $log->subject_type,
                'id' => $log->subject_id,
                'label' => $subjectLabel,
                'identifier' => $identifier,
                'data' => $this->subjectSnapshot($log->subject),
            ],

            'causer' => [
                'type' => $log->causer_type ? class_basename($log->causer_type) : null,
                'full_type' => $log->causer_type,
                'id' => $log->causer_id,
                'name' => $log->causer ? ($log->causer->name ?? $log->causer->email ?? 'Unknown') : 'System',
                'email' => $log->causer->email ?? null,
            ],

            'changes' => [
                'attributes' => $attributes,
                'old' => $old,
                'field_changes' => $fieldChanges,
            ],

            'presentation' => [
                'action' => $action,
                'action_label' => $this->humanize($action),
                'summary' => $description,
                'subject_label' => $subjectLabel,
                'identifier' => $identifier,
                'fields_changed' => array_keys($fieldChanges),
                'field_changes' => $fieldChanges,
            ],

            'details' => [
                'request_data' => $properties['request_data'] ?? [],
                'route_parameters' => $properties['route_parameters'] ?? [],
                'response_status' => $properties['response_status'] ?? null,
                'successful' => $properties['successful'] ?? null,
                'duration_ms' => $properties['duration_ms'] ?? null,
                'controller' => $properties['controller'] ?? null,
                'controller_action' => $properties['controller_action'] ?? null,
            ],

            'metadata' => [
                'ip_address' => $properties['ip_address'] ?? null,
                'user_agent' => $properties['user_agent'] ?? null,
                'url' => $properties['url'] ?? null,
                'method' => $properties['method'] ?? null,
                'route' => $properties['route'] ?? null,
                'route_name' => $properties['route_name'] ?? null,
            ],

            'created_at' => $log->created_at?->toIso8601String(),
            'created_at_human' => $log->created_at?->diffForHumans(),
            'created_at_formatted' => $log->created_at?->format('Y-m-d H:i:s'),
        ];
    }

    private function propertiesToArray($properties): array
    {
        if ($properties instanceof \Illuminate\Support\Collection) {
            return $properties->toArray();
        }
        if (is_array($properties)) {
            return $properties;
        }
        if ($properties instanceof \JsonSerializable) {
            $value = $properties->jsonSerialize();
            return is_array($value) ? $value : [];
        }
        return [];
    }

    private function arrayValue(array $properties, string $key): array
    {
        $value = $properties[$key] ?? [];
        if ($value instanceof \Illuminate\Support\Collection) {
            return $value->toArray();
        }
        return is_array($value) ? $value : (array) $value;
    }

    private function buildFieldChanges(array $old, array $attributes): array
    {
        $changes = [];
        foreach (array_unique(array_merge(array_keys($old), array_keys($attributes))) as $field) {
            $from = $old[$field] ?? null;
            $to = $attributes[$field] ?? null;
            if ($this->normalizeComparable($from) !== $this->normalizeComparable($to)) {
                $changes[$field] = ['from' => $from, 'to' => $to];
            }
        }
        return $changes;
    }

    private function normalizeComparable($value): string
    {
        if (is_array($value)) {
            ksort($value);
            return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if ($value === null) {
            return 'null';
        }
        return (string) $value;
    }

    private function deriveBusinessAction(?string $event, array $old, array $attributes): string
    {
        if ($event === 'updated' && array_key_exists('status', $attributes)) {
            $status = strtolower((string) $attributes['status']);
            return match ($status) {
                'approved' => 'approved',
                'received', 'fully_received', 'partially_received' => 'received',
                'dispatched', 'shipped', 'in_transit' => 'dispatched',
                'delivered' => 'delivered',
                'cancelled', 'canceled' => 'cancelled',
                'rejected' => 'rejected',
                'returned' => 'returned',
                'exchanged', 'exchange_completed' => 'exchanged',
                'completed' => 'completed',
                'fulfilled' => 'fulfilled',
                'refunded' => 'refunded',
                default => 'status_changed',
            };
        }

        if ($event === 'updated' && array_key_exists('store_id', $attributes)) {
            return 'assigned';
        }

        return match ($event) {
            'created' => 'created',
            'updated' => 'edited',
            'deleted' => 'deleted',
            'restored' => 'restored',
            default => $event ?: 'changed',
        };
    }

    private function readableDescription(?string $stored, string $action, string $subjectLabel, ?string $identifier, array $old, array $attributes): string
    {
        $stored = trim((string) $stored);
        $isGeneric = $stored === '' || preg_match('/^(Created|Updated|Deleted) [A-Za-z ]+(?:\:|$)/', $stored);
        if (!$isGeneric && !str_contains($stored, '{') && !str_contains($stored, '[')) {
            return $stored;
        }

        $verb = match ($action) {
            'created' => 'Created',
            'edited' => 'Edited',
            'deleted' => 'Deleted',
            'approved' => 'Approved',
            'received' => 'Received',
            'dispatched' => 'Dispatched',
            'delivered' => 'Delivered',
            'cancelled' => 'Cancelled',
            'rejected' => 'Rejected',
            'returned' => 'Returned',
            'exchanged' => 'Processed exchange for',
            'completed' => 'Completed',
            'fulfilled' => 'Fulfilled',
            'refunded' => 'Refunded',
            'assigned' => 'Assigned',
            'status_changed' => 'Changed status for',
            default => $this->humanize($action),
        };

        $description = trim($verb . ' ' . $subjectLabel . ($identifier ? ': ' . $identifier : ''));
        if (isset($old['status'], $attributes['status']) && $old['status'] !== $attributes['status']) {
            $description .= ' (' . $this->humanize($old['status']) . ' → ' . $this->humanize($attributes['status']) . ')';
        }
        return $description;
    }

    private function subjectIdentifier($subject, $subjectId): ?string
    {
        if ($subject) {
            foreach (['order_number', 'po_number', 'dispatch_number', 'return_number', 'service_order_number', 'shipment_number', 'invoice_number', 'barcode', 'sku', 'name', 'title'] as $field) {
                $value = $subject->{$field} ?? null;
                if ($value !== null && $value !== '') {
                    return (string) $value;
                }
            }
        }
        return $subjectId ? '#' . $subjectId : null;
    }

    private function subjectSnapshot($subject): array
    {
        if (!$subject) {
            return [];
        }

        $data = method_exists($subject, 'toArray') ? $subject->toArray() : (array) $subject;
        $hidden = ['password', 'remember_token', 'api_token', 'access_token', 'pathao_response', 'metadata', 'status_history', 'payment_history'];
        $snapshot = [];
        foreach ($data as $key => $value) {
            if (in_array($key, $hidden, true)) {
                continue;
            }
            if (count($snapshot) >= 35) {
                break;
            }
            $snapshot[$key] = $value;
        }
        return $snapshot;
    }

    private function categoryFromSubject(?string $subjectType, ?string $logName): string
    {
        $name = strtolower(($subjectType ?? '') . ' ' . ($logName ?? ''));
        return match (true) {
            str_contains($name, 'purchaseorder'), str_contains($name, 'purchase_order'), str_contains($name, 'vendorpayment') => 'purchase-orders',
            str_contains($name, 'productdispatch'), str_contains($name, 'product_dispatch') => 'product-dispatches',
            str_contains($name, 'productreturn'), str_contains($name, 'refund'), str_contains($name, 'exchange') => 'returns-exchanges',
            str_contains($name, 'serviceorder'), str_contains($name, 'service_order') => 'service-orders',
            str_contains($name, 'shipment') => 'shipments',
            str_contains($name, 'order') => 'orders',
            str_contains($name, 'product'), str_contains($name, 'inventory'), str_contains($name, 'barcode'), str_contains($name, 'batch') => 'products',
            default => 'other',
        };
    }

    private function subjectTypesForCategory(string $category): array
    {
        $models = match ($category) {
            'orders' => ['Order', 'OrderItem', 'OrderPayment', 'Customer'],
            'purchase-orders' => ['PurchaseOrder', 'PurchaseOrderItem', 'VendorPayment', 'VendorPaymentItem'],
            'product-dispatches' => ['ProductDispatch', 'ProductDispatchItem'],
            'returns-exchanges' => ['ProductReturn', 'Refund'],
            'service-orders' => ['ServiceOrder', 'ServiceOrderItem', 'ServiceOrderPayment'],
            'shipments' => ['Shipment'],
            'store-assignments' => [],
            'products' => ['Product', 'ProductBatch', 'ProductBarcode', 'ProductMovement', 'MasterInventory', 'DefectiveProduct'],
            default => [],
        };

        return array_map(fn ($model) => "App\\Models\\{$model}", $models);
    }

    private function humanize($value): string
    {
        if ($value === null || $value === '') {
            return 'Not set';
        }
        $value = preg_replace('/(?<!^)[A-Z]/', ' $0', (string) $value);
        return ucwords(str_replace(['_', '-'], ' ', $value));
    }

    /**
     * Apply filters to query (reusable for export)
     */
    private function applyFilters($query, Request $request)
    {
        if ($request->filled('event')) {
            $query->where('event', $request->event);
        }

        if ($request->filled('subject_type')) {
            $subjectType = $request->subject_type;
            if (!str_contains($subjectType, '\\')) {
                $subjectType = "App\\Models\\{$subjectType}";
            }
            $query->where('subject_type', $subjectType);
        }

        if ($request->filled('subject_id')) {
            $query->where('subject_id', $request->subject_id);
        }

        if ($request->filled('causer_type')) {
            $causerType = $request->causer_type;
            if (!str_contains($causerType, '\\')) {
                $causerType = "App\\Models\\{$causerType}";
            }
            $query->where('causer_type', $causerType);
        }

        if ($request->filled('causer_id')) {
            $query->where('causer_id', $request->causer_id);
        }

        if ($request->filled('log_name')) {
            $query->where('log_name', $request->log_name);
        }

        if ($request->filled('category') && $request->category !== 'all') {
            $category = $request->category;
            $subjectTypes = $this->subjectTypesForCategory($category);
            $query->where(function ($q) use ($category, $subjectTypes) {
                $q->whereJsonContains('properties->category', $category);

                if ($category === 'store-assignments') {
                    $q->orWhere(function ($assignmentQ) {
                        $assignmentQ->where('subject_type', 'App\Models\Order')
                            ->where('event', 'updated')
                            ->whereRaw("JSON_EXTRACT(properties, '$.attributes.store_id') IS NOT NULL");
                    });
                } elseif ($subjectTypes) {
                    $q->orWhereIn('subject_type', $subjectTypes);
                }
            });
        }

        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        if ($request->filled('search')) {
            $this->whereLike($query, 'description', $request->search);
        }

        $sortBy = $request->get('sort_by', 'created_at');
        $sortDirection = $request->get('sort_direction', 'desc');
        $query->orderBy($sortBy, $sortDirection);
    }

    /**
     * Get unique model types for filtering
     * 
     * GET /api/activity-logs/models
     */
    public function getAvailableModels()
    {
        $models = Activity::selectRaw('DISTINCT subject_type')
            ->whereNotNull('subject_type')
            ->orderBy('subject_type')
            ->pluck('subject_type')
            ->map(fn($type) => [
                'label' => class_basename($type),
                'value' => class_basename($type),
                'full_name' => $type,
            ])
            ->toArray();

        return response()->json([
            'success' => true,
            'data' => $models
        ]);
    }

    /**
     * Get unique users for filtering
     * 
     * GET /api/activity-logs/users
     */
    public function getAvailableUsers()
    {
        $users = Activity::selectRaw('DISTINCT causer_type, causer_id')
            ->whereNotNull('causer_id')
            ->get()
            ->map(function($item) {
                $causer = app($item->causer_type)->find($item->causer_id);
                return [
                    'label' => $causer ? ($causer->name ?? $causer->email) : 'Unknown',
                    'value' => $item->causer_id,
                    'type' => class_basename($item->causer_type),
                ];
            })
            ->unique('value')
            ->values()
            ->toArray();

        return response()->json([
            'success' => true,
            'data' => $users
        ]);
    }
}
