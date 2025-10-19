export type BuilderOrId<T> =
  | { builder: T; id?: never }
  | { builder?: never; id: string };
