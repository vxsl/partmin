import config from "config.js";
import { discordSend } from "discord/util.js";

const time = () => new Date().toLocaleTimeString("it-IT");

export type LogLevel = "debug" | "verbose";
interface LogOptions {
  error?: boolean;
  level?: LogLevel;
}
export const log = (message: any, options?: LogOptions) => {
  if (options?.level && !config.logging?.[options.level]) {
    return;
  }
  const t = time();
  (options?.error ? console.error : console.log)(`${t}:`, message);
  return discordSend(`${t}: ${message}`, {
    channel: "logs",
    monospace: true,
    skipLog: true,
  });
};

export const debugLog = (msg: any, options?: Omit<LogOptions, "level">) =>
  log(msg, { ...options, level: "debug" });
export const verboseLog = (msg: any, options?: Omit<LogOptions, "level">) =>
  log(msg, { ...options, level: "debug" });
