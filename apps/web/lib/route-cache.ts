// Older deployments cached unversioned Next RSC payloads as immutable for a year.
// Run before hydration so existing browser cache entries cannot restore old components.
export const ROUTE_CACHE_INIT_SCRIPT = `(() => {
  const request = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    return request(input, headers.get('RSC') === '1' ? { ...init, cache: 'no-store' } : init);
  };
})();`;
