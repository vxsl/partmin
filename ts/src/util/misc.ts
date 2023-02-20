export const waitSeconds = async (s: number) =>
  new Promise((resolve) => setTimeout(resolve, s * 1000));

export function notUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export const log = (...args: Parameters<typeof console.log>) =>
  console.log(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);
