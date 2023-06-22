import { customAlphabet } from "nanoid";
const nanoid = customAlphabet("abcdef1234567890", 12);

export const createId = (id?: string) => id || nanoid();

export const omit = (obj: Record<string, any>, keys: string[]) => {
  const newObj = { ...obj };
  keys.forEach((key) => delete newObj[key]);
  return newObj;
};

