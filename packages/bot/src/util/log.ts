import { LogLevel, logLevels } from "advanced-config.js";
import { discordSend } from "discord/util.js";
import { isPlainObject } from "util/misc.js";
import { errToString } from "util/string.js";

const time = () => new Date().toLocaleTimeString("it-IT");

interface LogOptions {
  error?: boolean;
  level?: LogLevel;
  skipDiscord?: boolean;
}
export const log = (_v: any, options?: LogOptions) => {
  if (options?.level && !logLevels?.[options.level]) {
    return;
  }
  const t = time();
  const v = isPlainObject(_v) ? JSON.stringify(_v, null, 2) : errToString(_v);

  (options?.error || _v instanceof Error ? console.error : console.log)(
    `${t}:`,
    (!options?.level ? "" : `[${options.level.toUpperCase()}] `) + v
  );

  if (!options?.skipDiscord) {
    try {
      return discordSend(`${t}: ${v}`, {
        channel: "logs",
        monospace: true,
        skipLog: true,
        silent: true,
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
  log(msg, { ...options, level: "verbose" });

export const logNoDiscord = (
  v: any,
  options?: Omit<LogOptions, "skipDiscord">
) => log(v, { ...(options ?? {}), skipDiscord: true });
