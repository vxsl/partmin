import config from "config.js";
import { discordSend } from "discord/util.js";
import { errToString, isPlainObject } from "util/misc.js";

const time = () => new Date().toLocaleTimeString("it-IT");

export type LogLevel = "debug" | "verbose";
interface LogOptions {
  error?: boolean;
  level?: LogLevel;
  skipDiscord?: boolean;
}
export const log = (_v: any, options?: LogOptions) => {
  if (options?.level && !config.logging?.[options.level]) {
    return;
  }
  const t = time();
  const v = isPlainObject(_v) ? JSON.stringify(_v, null, 2) : errToString(_v);
  (options?.error ? console.error : console.log)(`${t}:`, v);
  if (options?.level === "verbose") {
    return;
  }

  if (!options?.skipDiscord) {
    try {
      return discordSend(`${t}: ${v}`, {
        channel: "logs",
        monospace: true,
        skipLog: true,
      });
    } catch (e) {
      if (e instanceof ReferenceError) {
        console.log("Discord client not initialized, skipping discord log.");
        return;
      }
      throw e;
    }
  }
};

export const debugLog = (msg: any, options?: Omit<LogOptions, "level">) =>
  log(msg, { ...options, level: "debug" });
export const verboseLog = (msg: any, options?: Omit<LogOptions, "level">) =>
  log(msg, { ...options, level: "debug" });
