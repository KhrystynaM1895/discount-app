/**
 * Builds a URL query string from the current params plus `updates`.
 *
 * - Keys with a `null`, `undefined`, or empty-string value are removed.
 * - Changing any filter resets pagination: whenever `updates` touches a key
 *   other than `page`, the `page` param is dropped (back to the default 1).
 *   Pass only `{ page }` to navigate between pages without clearing filters.
 */
export function buildSearchParams(
  current: URLSearchParams,
  updates: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams(current);

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  const keys = Object.keys(updates);
  const onlyUpdatingPage = keys.length === 1 && keys[0] === "page";
  if (!onlyUpdatingPage) {
    params.delete("page");
  }

  return params.toString();
}
