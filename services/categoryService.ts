import axiosInstance from '@/lib/axios';

// Types
export interface Category {
  id: number;
  title: string;
  slug: string;
  description?: string;
  image?: string;
  image_url?: string;
  banner?: string;
  banner_url?: string;
  color?: string;
  icon?: string;
  order: number;
  parent_id?: number;
  is_active: boolean;
  level: number;
  created_at: string;
  updated_at: string;
  parent?: Category | null;
  children?: Category[];
  all_children?: Category[];
  full_path?: string;
  ancestors?: Category[];
  has_children?: boolean;
  is_root?: boolean;
  active_products?: Array<{
    id: number;
    name: string;
    category_id: number;
    is_active: boolean;
  }>;
}

export interface CategoryTree extends Category {
  children: CategoryTree[];
  all_children?: CategoryTree[];
}

export interface CategoryStats {
  total_categories: number;
  active_categories: number;
  inactive_categories: number;
  categories_with_products: number;
  total_products_by_category: Array<{
    title: string;
    products_count: number;
  }>;
  recent_categories: Array<{
    title: string;
    slug: string;
    is_active: boolean;
    created_at: string;
  }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number;
  to: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface BreadcrumbItem extends Category {
  // Same as Category but used in breadcrumb
}

// Query Params Interface
export interface GetCategoriesParams {
  page?: number;
  per_page?: number;
  search?: string;
  is_active?: boolean;
  parent_id?: number | 'null' | null;
  level?: number;
  sort_by?: 'title' | 'slug' | 'order' | 'created_at' | 'level';
  sort_direction?: 'asc' | 'desc';
  tree?: boolean;
}

class CategoryService {
  private baseUrl = '/categories';

  // Helper to build query string
  private buildQueryString(queryParams: Record<string, any>): string {
    const pairs: string[] = [];
    
    for (const key in queryParams) {
      if (queryParams[key] !== undefined && queryParams[key] !== null) {
        const value = encodeURIComponent(String(queryParams[key]));
        pairs.push(key + '=' + value);
      }
    }
    
    return pairs.length > 0 ? '?' + pairs.join('&') : '';
  }

  
private normalizeCategory<T extends Category | CategoryTree>(category: T): T {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (category.image_url && !category.image_url.startsWith('http')) {
    // Legacy category image paths can arrive as `category/...`.
    // Public assets are served from `/storage/category/...`.
    if (/^\/?category\//i.test(category.image_url) && !/\/storage\/category\//i.test(category.image_url)) {
      category.image_url = category.image_url.replace(/^\/?category\//i, '/storage/category/');
    }
    // Simply prepend base URL - no need to replace anything
    category.image_url = baseUrl + category.image_url;
  }
  
  if (category.banner_url && !category.banner_url.startsWith('http')) {
    if (/^\/?category\/banners\//i.test(category.banner_url) && !/\/storage\/category\/banners\//i.test(category.banner_url)) {
      category.banner_url = category.banner_url.replace(/^\/?category\/banners\//i, '/storage/category/banners/');
    }
    category.banner_url = baseUrl + category.banner_url;
  }

  // Recursively normalize nested categories
  if (category.parent) {
    this.normalizeCategory(category.parent);
  }
  if (category.children) {
    category.children.forEach(child => this.normalizeCategory(child));
  }
  if (category.all_children) {
    category.all_children.forEach(child => this.normalizeCategory(child));
  }
  if (category.ancestors) {
    category.ancestors.forEach(anc => this.normalizeCategory(anc));
  }

  return category;
}


  // Utility to normalize arrays or paginated data
  private normalizeCategories<T extends Category[] | CategoryTree[] | PaginatedResponse<Category>>(data: T): T {
    if (Array.isArray(data)) {
      data.forEach(category => this.normalizeCategory(category));
    } else if ('data' in data && Array.isArray(data.data)) {
      data.data.forEach(category => this.normalizeCategory(category));
    }
    return data;
  }

  // CREATE
  async create(data: FormData): Promise<Category> {
    const response = await axiosInstance.post<ApiResponse<Category>>(
      this.baseUrl,
      data,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return this.normalizeCategory(response.data.data);
  }

  // UPDATE
  async update(id: number, data: FormData): Promise<Category> {
    const url = this.baseUrl + '/' + id;
    
    // Add _method field for Laravel to treat POST as PUT
    data.append('_method', 'PUT');
    
    const response = await axiosInstance.post<ApiResponse<Category>>(
      url,
      data,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return this.normalizeCategory(response.data.data);
  }

  // DELETE (Soft delete)
  async delete(id: number): Promise<void> {
    const url = this.baseUrl + '/' + id;
    await axiosInstance.delete<ApiResponse<null>>(url);
  }

  // HARD DELETE (Permanent delete)
  async hardDelete(id: number): Promise<{ success: boolean; message?: string }> {
    const url = this.baseUrl + '/' + id + '/hard-delete';
    const response = await axiosInstance.delete<ApiResponse<null>>(url);
    return {
      success: !!response.data?.success,
      message: response.data?.message,
    };
  }

  // ACTIVATE
  async activate(id: number): Promise<Category> {
    const url = this.baseUrl + '/' + id + '/activate';
    const response = await axiosInstance.patch<ApiResponse<Category>>(url);
    return this.normalizeCategory(response.data.data);
  }

  // DEACTIVATE
  async deactivate(id: number): Promise<void> {
    const url = this.baseUrl + '/' + id + '/deactivate';
    await axiosInstance.patch<ApiResponse<null>>(url);
  }

  // GET ALL (with filters, pagination, tree)
  async getAll(queryParams: GetCategoriesParams = {}): Promise<PaginatedResponse<Category> | CategoryTree[]> {
    const queryString = this.buildQueryString(queryParams);
    const url = this.baseUrl + queryString;
    const response = await axiosInstance.get<ApiResponse<any>>(url);

    let data: PaginatedResponse<Category> | CategoryTree[];
    if (queryParams.tree) {
      data = response.data.data;
    } else {
      data = response.data.data;
    }

    return this.normalizeCategories(data);
  }

  // GET SINGLE
  async getById(id: number): Promise<Category> {
    const url = this.baseUrl + '/' + id;
    const response = await axiosInstance.get<ApiResponse<Category>>(url);
    return this.normalizeCategory(response.data.data);
  }

  // GET STATS
  async getStats(): Promise<CategoryStats> {
    const url = this.baseUrl + '/stats';
    const response = await axiosInstance.get<ApiResponse<CategoryStats>>(url);
    return response.data.data;
  }

  // BULK UPDATE STATUS
  async bulkUpdateStatus(
    categoryIds: number[],
    is_active: boolean
  ): Promise<{ message: string }> {
    const url = this.baseUrl + '/bulk/status';
    const response = await axiosInstance.patch<ApiResponse<void>>(
      url,
      { category_ids: categoryIds, is_active }
    );
    return { message: response.data.message || 'Status updated successfully' };
  }

  // REORDER
  async reorder(categories: { id: number; order: number }[]): Promise<void> {
    const url = this.baseUrl + '/reorder';
    await axiosInstance.patch<ApiResponse<null>>(url, {
      categories,
    });
  }

  // TREE
  async getTree(is_active?: boolean): Promise<CategoryTree[]> {
    const queryString = is_active !== undefined 
      ? this.buildQueryString({ is_active }) 
      : '';
    const url = this.baseUrl + '/tree' + queryString;
    const response = await axiosInstance.get<ApiResponse<CategoryTree[]>>(url);
    return this.normalizeCategories(response.data.data);
  }

  // ROOT CATEGORIES
  async getRoot(is_active?: boolean): Promise<Category[]> {
    const queryString = is_active !== undefined 
      ? this.buildQueryString({ is_active }) 
      : '';
    const url = this.baseUrl + '/root' + queryString;
    const response = await axiosInstance.get<ApiResponse<Category[]>>(url);
    return this.normalizeCategories(response.data.data);
  }

  // SUBCATEGORIES
  async getSubcategories(parentId: number): Promise<{
    parent: Category;
    subcategories: Category[];
  }> {
    const url = this.baseUrl + '/' + parentId + '/subcategories';
    const response = await axiosInstance.get<ApiResponse<{ parent: Category; subcategories: Category[] }>>(url);
    const data = response.data.data;
    this.normalizeCategory(data.parent);
    this.normalizeCategories(data.subcategories);
    return data;
  }

  // MOVE CATEGORY
  async move(id: number, new_parent_id?: number | null): Promise<Category> {
    const url = this.baseUrl + '/' + id + '/move';
    const response = await axiosInstance.patch<ApiResponse<Category>>(
      url,
      { new_parent_id }
    );
    return this.normalizeCategory(response.data.data);
  }

  // BREADCRUMB
  async getBreadcrumb(id: number): Promise<BreadcrumbItem[]> {
    const url = this.baseUrl + '/' + id + '/breadcrumb';
    const response = await axiosInstance.get<ApiResponse<BreadcrumbItem[]>>(url);
    return this.normalizeCategories(response.data.data);
  }

  // DESCENDANTS
  async getDescendants(id: number): Promise<{
    category: Category;
    descendants: Category[];
    total_descendants: number;
  }> {
    const url = this.baseUrl + '/' + id + '/descendants';
    const response = await axiosInstance.get<ApiResponse<{
      category: Category;
      descendants: Category[];
      total_descendants: number;
    }>>(url);
    const data = response.data.data;
    this.normalizeCategory(data.category);
    this.normalizeCategories(data.descendants);
    return data;
  }
}

// Export a singleton instance
const categoryService = new CategoryService();
export default categoryService;