import { stdout as singleLineStdOut } from "single-line-log";
import { discordMsg } from "../notifications/discord/index.js";
import config from "../../../config.json" assert { type: "Config" };

export const waitSeconds = async (s: number) =>
  await new Promise((resolve) => setTimeout(resolve, s * 1000));

export function notUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export const fatalError = (
  ...args: Parameters<typeof console.error>
): never => {
  console.error(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);
  throw new Error(args[0]);
};

export const debugLog = (msg?: any) => {
  if (config.debug) {
    console.log(`${new Date().toLocaleTimeString("it-IT")}: ${msg}`);
  }
};

export const errorLog = (...args: Parameters<typeof console.error>) =>
  console.error(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);

export const log = (message: any) => {
  const date = new Date().toLocaleTimeString("it-IT");
  console.log(`${date}:`, message);
  return discordMsg("logs", `\`${date}: ${message}\``);
};

export const discordLog = (message: any, options?: { monospace?: true }) => {
  console.log(`${new Date().toLocaleTimeString("it-IT")}:`, message);
  discordMsg("main", String(options?.monospace ? `\`${message}\`` : message));
};

export const verboseLog = (...args: Parameters<typeof console.log>) => {
  if (config.verbose) {
    console.log(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);
  }
};

export const singleLineLog = (...args: Parameters<typeof singleLineStdOut>) =>
  singleLineStdOut(...args);

export const clearSingleLineLog = () => singleLineStdOut.clear();

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
    : new Date().getHours() >= 5 && new Date().getHours() < 20
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
