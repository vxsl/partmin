import {
  ActivityType,
  Client,
  GatewayIntentBits,
  PresenceData,
} from "discord.js";
import { discordIsReady, writeStatusForAuditor } from "discord/index.js";
import { log, logNoDiscord } from "util/log.js";

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

type Presence = "launching" | "online" | "shuttingDown" | "offline";
const defs: Record<Presence, PresenceData> = {
  launching: {
    status: "online",
    activities: [
      {
        name: "⏳ Initializing...",
        type: ActivityType.Custom,
      },
    ],
  },
  online: {
    status: "online",
    activities: [
      {
        name: "🔎 Online",
        type: ActivityType.Custom,
      },
    ],
  },
  shuttingDown: {
    status: "online",
    activities: [
      {
        name: "⛔ Shutting down...",
        type: ActivityType.Custom,
      },
    ],
  },
  offline: {
    status: "invisible",
  },
};

export const setDiscordPresence = async (
  p: Presence,
  options?: { skipDiscordLog?: boolean }
) => {
  if (!discordIsReady()) {
    logNoDiscord("Discord client not ready, skipping presence update");
    return;
  }
  await (discordClient as Client<true>).user.setPresence(defs[p]);
  return log(
    `Discord presence set to ${defs[p].activities?.[0].name ?? `{${p}}`}`,
    {
      skipDiscord: options?.skipDiscordLog,
    }
  );
};

export const shutdownDiscordBot = () => {
  logNoDiscord("Setting bot presence to offline");
  return setDiscordPresence("offline", { skipDiscordLog: true }).then(
    async () => {
      logNoDiscord("Destroying discord client");
      await discordClient?.destroy();
      writeStatusForAuditor("logged-out");
    }
  );
};
