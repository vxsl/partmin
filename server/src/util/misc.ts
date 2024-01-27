import { log, singleLineLog } from "util/log.js";

export function notUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export const waitSeconds = async (s: number) =>
  await new Promise((resolve) => setTimeout(resolve, s * 1000));

export const randomWait = async (options?: {
  short?: true;
  suppressLog?: boolean;
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
    log(
      `Waiting ${toWait} seconds${
        mins < 2 ? "" : ` (${mins} minute${mins !== 1 ? "s" : ""})`
      }`
    );
  for (let i = 0; i < toWait; i++) {
    !options?.suppressLog &&
      singleLineLog(toWait - i === 1 ? "" : `Waiting ${toWait - i} seconds`);
    await waitSeconds(1);
  }
};
