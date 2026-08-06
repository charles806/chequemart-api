export const paginate = (query, { page = 1, limit = 20, maxLimit = 100 }) => {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(maxLimit, Math.max(1, parseInt(limit) || 20));
  const skip = (safePage - 1) * safeLimit;
  return {
    query: query.skip(skip).limit(safeLimit),
    page: safePage,
    limit: safeLimit,
    skip,
  };
};

export const buildPaginationMetadata = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};
