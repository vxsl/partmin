import { stdout as singleLineStdOut } from "single-line-log";

export const waitSeconds = async (s: number) =>
  await new Promise((resolve) => setTimeout(resolve, s * 1000));

export function notUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export const log = (...args: Parameters<typeof console.log>) =>
  console.log(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);

export const singleLineLog = (...args: Parameters<typeof singleLineStdOut>) =>
  singleLineStdOut(...args);

export const clearSingleLineLog = () => singleLineStdOut.clear();
