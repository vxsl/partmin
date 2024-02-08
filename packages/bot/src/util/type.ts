export type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>;
};
export type NonEmptyArray<T> = [T, ...T[]];
