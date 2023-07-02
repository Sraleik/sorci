import { customAlphabet } from "nanoid";
import { v4 } from "uuid";
const nanoid = customAlphabet("abcdef1234567890", 12);

export const createId = (id?: string) => id || v4();
export const shortId = (id?: string) => id || nanoid();

export const omit = (obj: Record<string, any>, keys: string[]) => {
  const newObj = { ...obj };
  keys.forEach((key) => delete newObj[key]);
  return newObj;
};

