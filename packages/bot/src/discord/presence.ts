import { ActivityType, PresenceData } from "discord.js";
import { presences } from "discord/constants.js";
import { getDiscordClient } from "discord/index.js";
import { debugLog, log } from "util/log.js";
import { randomElement } from "util/misc.js";

type ActivityProgress = {
  percentage: number;
  cur: number;
  max: number;
};
export type PresenceActivityDef = {
  emoji?: string;
  message: ((p: ActivityProgress) => string) | string;
  customProgress?: (p: ActivityProgress) => string;
  skipLongRunningWarning?: boolean;
};
type PresenceActivityConstructorArgs = [
  def: PresenceActivityDef,
  max: ActivityProgress["max"],
  options?: {
    initUpdate?: boolean;
  }
];

export const setPresence = async (
  p?: string,
  options?: { skipDiscordLog?: boolean }
) => {
  if (p === undefined) {
    log("No presence provided, skipping presence update");
    return;
  }
  const client = getDiscordClient();
  if (!client) return;

  const presence: PresenceData =
    p in presences
      ? presences[p as keyof typeof presences]
      : {
          status: "online",
          activities: [{ name: p, type: ActivityType.Custom }],
        };

  await client.user.setPresence(presence);
  return log(
    `Discord presence set to "${presence.activities?.[0]?.state || `{${p}}`}"`,
    {
      skipDiscord: options?.skipDiscordLog,
    }
  );
};

const longRunningWarningEmojis = [`🐢`, `🐌`, `🐢️`, `💤`];
const longRunningWarnings = [
  `I'm going slowly so nobody thinks I'm a bot`,
  `I'm taking my time in order to dodge bot detection`,
  `️I'm taking it slow to avoid being blocked`,
  `I'm moving slowly to avoid being flagged`,
];

const timeBetweenWarnings = 2 * 60 * 1000;
const warningTimeout = 30 * 1000;
const presenceRateLimit = 15 * 1000;

export class PresenceActivity {
  def: PresenceActivityDef;
  lastWarningEndedAt?: number;
  curWarning?: {
    emoji?: string;
    message: string;
  };
  lastSetAt?: number;
  progress: ActivityProgress;
  constructor(...[def, max, options]: PresenceActivityConstructorArgs) {
    this.progress = {
      percentage: 0,
      cur: 0,
      max,
    };
    this.def = def;
    this.lastWarningEndedAt = Date.now();
    if (options?.initUpdate) {
      this.update(this.progress.cur);
    }
  }
  private get progressStr() {
    if (!this.progress.percentage) return "";
    const v = this.def.customProgress
      ? this.def.customProgress(this.progress)
      : `${this.progress.percentage}%`;
    return `[${v}]`;
  }
  private getMessage() {
    return typeof this.def.message === "string"
      ? this.def.message
      : this.def.message(this.progress);
  }
  private value() {
    let v = "";
    const msg = this.getMessage();
    if (this.curWarning) {
      const w = this.curWarning;
      if (!w) return;
      if (w.emoji) {
        v += `${w.emoji} `;
      }
      const p = this.progressStr;
      if (p) {
        v += `${p} `;
      }
      v += `${w.message}. ${`${msg.charAt(0).toUpperCase()}${msg.slice(1)}`}`;
    } else {
      if (this.def.emoji) {
        v += `${this.def.emoji} `;
      }
      const p = this.progressStr;
      if (p) {
        v += `${p} `;
      }
      v += msg;
    }
    return v;
  }
  update(
    cur: number,
    options?: {
      suppressRateLimitWarning?: boolean;
    }
  ) {
    if (this.progress) {
      this.progress.cur = cur;
    }

    const now = Date.now();
    if (this.lastSetAt && now - this.lastSetAt < presenceRateLimit) {
      if (!options?.suppressRateLimitWarning) {
        debugLog(
          `Refusing to update presence for activity, only updating activity every ${
            presenceRateLimit / 1000
          } seconds`
        );
      }
      return;
    }

    if (this.progress) {
      this.progress.percentage = Math.round((cur / this.progress.max) * 100);
    }
    if (
      !this.def.skipLongRunningWarning &&
      !this.curWarning &&
      (!this.progress || this.progress.percentage < 100) &&
      now - (this.lastWarningEndedAt ?? 0) >= timeBetweenWarnings
    ) {
      this.curWarning = {
        emoji: randomElement(longRunningWarningEmojis),
        message: randomElement(longRunningWarnings),
      };
      setTimeout(() => {
        this.curWarning = undefined;
        this.lastWarningEndedAt = Date.now();
      }, warningTimeout);
    }
    setPresence(this.value());
    this.lastSetAt = now;
  }
}

export const startActivity = (
  def: PresenceActivityConstructorArgs[0] | undefined,
  max: PresenceActivityConstructorArgs[1] | undefined,
  options?: PresenceActivityConstructorArgs[2]
) =>
  typeof def !== "undefined" && typeof max !== "undefined"
    ? new PresenceActivity(def, max, options)
    : undefined;
