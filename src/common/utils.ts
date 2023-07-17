import { ulid } from "ulidx";

ulid(); 

export const createId = (id?: string) => id || ulid();
export const shortId = (id?: string) => id || ulid().toLowerCase().slice(0, 12);

export const omit = (obj: Record<string, any>, keys: string[]) => {
  const newObj = { ...obj };
  keys.forEach((key) => delete newObj[key]);
  return newObj;
};

