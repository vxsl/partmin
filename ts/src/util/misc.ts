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

export const discordLog = (message: any) => {
  console.log(`${new Date().toLocaleTimeString("it-IT")}:`, message);
  discordMsg("main", message);
};

export const verboseLog = (...args: Parameters<typeof console.log>) => {
  if (config.verbose) {
    console.log(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);
  }
};

export const singleLineLog = (...args: Parameters<typeof singleLineStdOut>) =>
  singleLineStdOut(...args);

export const clearSingleLineLog = () => singleLineStdOut.clear();

export const randomWait = async () => {
  // const toWait = Math.round(Math.random() * 60 + 60);
  const toWait = Math.round(Math.random() * (300 - 180) + 180);
  for (let i = 0; i < toWait; i++) {
    singleLineLog(toWait - i === 1 ? "" : `Waiting ${toWait - i} seconds`);
    await waitSeconds(1);
  }
};
