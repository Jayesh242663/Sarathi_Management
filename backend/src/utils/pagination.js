/**
 * Pagination helper utilities
 */

/**
 * Parse pagination parameters from request query
 * @param {Object} query - Express req.query object
 * @returns {Object} - { page, limit, offset }
 */
export function parsePagination(query) {
  let page = parseInt(query.page) || 1;
  let limit = parseInt(query.limit) || 20;

  // Ensure valid values
  page = Math.max(1, page);
  limit = Math.max(1, Math.min(limit, 100)); // Max 100 per page

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Format pagination response
 * @param {Array} data - Result data
 * @param {number} total - Total count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} - Formatted response with pagination metadata
 */
export function formatPaginatedResponse(data, total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Apply pagination to Supabase query
 * @param {Object} query - Supabase query object
 * @param {number} offset - Offset value
 * @param {number} limit - Limit value
 * @returns {Object} - Query with range applied
 */
export function applyPagination(query, offset, limit) {
  return query.range(offset, offset + limit - 1);
}
