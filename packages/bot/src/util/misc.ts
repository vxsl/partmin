import { presenceActivities } from "discord/constants.js";
import { startActivity } from "discord/presence.js";
import { stdout as singleLineStdOut } from "single-line-log";
import { readableSeconds } from "util/data.js";
import { debugLog, log } from "util/log.js";
import { NonEmptyArray } from "util/type.js";

export const splitString = (s: string, maxLength: number) => {
  const regex = new RegExp(`[\\s\\S]{1,${maxLength}}`, "g");
  const matches = s.match(regex);
  if (!matches) {
    return [s];
  }
  return matches;
};

export const errToString = (e: unknown) =>
  e instanceof Error ? `${e.stack || `${e.name}: ${e.message}`}` : `${e}`;
export const notUndefined = <T>(value: T | undefined): value is T =>
  value !== undefined;
export const notNull = <T>(value: T | null): value is T => value !== null;
export const notNullOrUndefined = <T>(
  value: T | null | undefined
): value is T => notNull(value) && notUndefined(value);

export const isPlainObject = (value: unknown): value is Record<string, any> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
};

export const waitSeconds = async (s: number) =>
  await new Promise((resolve) => setTimeout(resolve, s * 1000));

export const tryNTimes = async <T>(
  n: number,
  fn: () => Promise<T>
): Promise<T> => {
  let attempts = 0;
  let err: unknown;
  while (++attempts <= n) {
    if (attempts > 1) debugLog(`Attempting action again (${attempts} of ${n})`);
    await waitSeconds(2);

    try {
      const res = await fn();
      if (attempts > 1) {
        debugLog(`Function completed successfully on try ${attempts}/${n}.`);
      }
      return res;
    } catch (e) {
      err = e;
      debugLog(`Function errored on try ${attempts}/${n}:`);
      debugLog(err);
    }
  }
  log(`Failed to execute function after ${n} attempts:`);
  log(err);
  throw err;
};

export const randomWait = async (options?: {
  short?: true;
  suppressLog?: boolean;
  suppressProgressLog?: boolean;
  setPresence?: boolean;
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

  const str = readableSeconds(toWait);
  if (!options?.suppressLog) {
    debugLog(`Waiting ${str}`);
  }
  let i = 0;
  let activity = options?.setPresence
    ? startActivity(presenceActivities.waiting, toWait, { initUpdate: true })
    : undefined;
  while (i < toWait) {
    const readable = readableSeconds(toWait - i);
    if (!options?.suppressProgressLog) {
      singleLineStdOut(toWait - i === 1 ? "" : readable);
    }
    activity?.update(i, { suppressRateLimitWarning: true });
    await waitSeconds(1);
    i++;
  }
};

export const throwError = (message: string) => {
  throw new Error(message);
};

export const nonEmptyArrayOrError = <T>(arr: T[]): NonEmptyArray<T> => {
  if (arr.length === 0) {
    throw new Error("Expected non-empty array");
  }
  return arr as NonEmptyArray<T>;
};
export const nonEmptyArrayOrUndefined = <T>(
  arr: T[]
): NonEmptyArray<T> | undefined => {
  if (arr.length === 0) {
    return;
  }
  return arr as NonEmptyArray<T>;
};
