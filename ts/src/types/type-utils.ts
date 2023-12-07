export type RecursiveKeyMap<O, V> = {
  [K in keyof O]?: O[K] extends object
    ? O[K] extends any[]
      ? V
      : RecursiveKeyMap<O[K], V> | V
    : V;
};
