import { stdout as singleLineStdOut } from "single-line-log";
import { discordMsg } from "discord/index.js";
import config from "config.js";

export const debugLog = (msg?: any) => {
  if (config.logging?.debug) {
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
  if (config.logging?.verbose) {
    console.log(`${new Date().toLocaleTimeString("it-IT")}:`, ...args);
  }
};

export const singleLineLog = (...args: Parameters<typeof singleLineStdOut>) =>
  singleLineStdOut(...args);

export const clearSingleLineLog = () => singleLineStdOut.clear();
