import { stdout as singleLineStdOut } from "single-line-log";
import { debugLog } from "util/log.js";

export const errToString = (e: unknown) =>
  e instanceof Error ? `${e.stack || `${e.name}: ${e.message}`}` : `${e}`;
export const notUndefined = <T>(value: T | undefined): value is T =>
  value !== undefined;

export const isPlainObject = (value: unknown): value is Record<string, any> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
};

export const tryNTimes = async <T>(
  n: number,
  fn: () => Promise<T>
): Promise<T> => {
  let attempts = 0;
  while (++attempts <= n) {
    if (attempts > 1)
      debugLog(`Attempting action again (${attempts - 1} of ${n - 1})`);
    await waitSeconds(2);

    try {
      const res = await fn();
      if (attempts > 1) {
        debugLog(
          `Function completed successfully on try ${attempts - 1}/${n - 1}.`
        );
      }
      return res;
    } catch (e) {
      debugLog(`Function errored on try ${attempts - 1}/${n - 1}:`);
      debugLog(e);
    }
  }
  throw new Error(`Failed to execute function after ${n} attempt.`);
};

export const waitSeconds = async (s: number) =>
  await new Promise((resolve) => setTimeout(resolve, s * 1000));

export const randomWait = async (options?: {
  short?: true;
  suppressLog?: boolean;
  suppressProgressLog?: boolean;
}) => {
  const minShort = 2;
  const maxShort = 10;
  const minLong = 1 * 60;
  const maxLong = 3 * 60;
  const minLongNight = 10 * 60;
  const maxLongNight = 20 * 60;

  const toWait = options?.short
    ? Math.round(Math.random() * (maxShort - minShort) + minShort)
    : new Date().getHours() >= 5 && new Date().getHours() < 22
    ? Math.round(Math.random() * (maxLong - minLong) + minLong)
    : Math.round(Math.random() * (maxLongNight - minLongNight) + minLongNight);

  const mins = Math.round(toWait / 60);
  !options?.suppressLog &&
    debugLog(
      `Waiting ${toWait} seconds${
        mins < 2 ? "" : ` (${mins} minute${mins !== 1 ? "s" : ""})`
      }`
    );
  for (let i = 0; i < toWait; i++) {
    !options?.suppressProgressLog &&
      singleLineStdOut(toWait - i === 1 ? "" : `Waiting ${toWait - i} seconds`);
    await waitSeconds(1);
  }
};
