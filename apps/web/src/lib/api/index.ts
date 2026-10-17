export { apiFetch, CACHE_TAGS, CATALOG_REVALIDATE_SECONDS, type ApiRequest } from './client';
export {
  findCategory,
  findProduct,
  findProductByCode,
  getCategories,
  getCategoryOrNotFound,
  getHome,
  getProductByCodeOrNotFound,
  getProductOrNotFound,
  getProducts,
  getSuggestions,
  type ProductListParams,
} from './catalog';
export { ApiError, ApiNotFoundError, ApiUnreachableError, isNotFound } from './errors';
