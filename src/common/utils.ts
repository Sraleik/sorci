import { monotonicFactory } from "ulidx";
const ulid = monotonicFactory();

/**
 * Generates a monotonic ULID (Universally Unique Lexicographically Sortable Identifier).
 * Returns the provided id if given, otherwise creates a new monotonic ULID that is guaranteed
 * to be greater than the previous one, even if generated in the same millisecond.
 * @param id - Optional existing identifier to use instead of generating a new one
 * @returns A ULID string
 */
export const createId = (id?: string) => id || ulid();
export const shortId = (id?: string) => id || ulid().toLowerCase().slice(0, 12);

export const omit = (obj: Record<string, any>, keys: string[]) => {
  const newObj = { ...obj };
  keys.forEach((key) => delete newObj[key]);
  return newObj;
};
