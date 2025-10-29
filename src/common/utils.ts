import { monotonicFactory } from "ulidx";
const ulid = monotonicFactory();

/**
 * Creates a unique identifier. If an ID is provided, it returns that ID;
 * otherwise, it generates a new ULID (Universally Unique Lexicographically Sortable Identifier).
 *
 * @param {string} [id] - Optional existing ID to return. If not provided, a new ULID will be generated.
 * @returns {string} The provided ID or a newly generated ULID.
 *
 * @example
 * ```typescript
 * const newId = createId(); // Returns a new ULID, e.g., "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 * const existingId = createId("custom-id"); // Returns "custom-id"
 * ```
 */
export const createId = (id?: string) => id || ulid();
export const shortId = (id?: string) => id || ulid().toLowerCase().slice(0, 12);

export const omit = (obj: Record<string, any>, keys: string[]) => {
  const newObj = { ...obj };
  keys.forEach((key) => delete newObj[key]);
  return newObj;
};
