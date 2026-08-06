/**
 * asyncHandler
 * Wraps an async Express route handler to catch rejected promises
 * and forward them to the Express error middleware.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 *
 * Without this wrapper, uncaught promise rejections in async route
 * handlers will hang the request until timeout in Express 4.x.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
