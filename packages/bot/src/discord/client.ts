import * as Discord from "discord.js";
import { log, logNoDiscord } from "util/log.js";

export const discordClient = new Discord.Client({ intents: 512 });

type Presence = "launching" | "online" | "shuttingDown" | "offline";
const defs: Record<Presence, Discord.PresenceData> = {
  launching: {
    status: "online",
    activities: [
      {
        name: "⏳ Initializing...",
        type: Discord.ActivityType.Custom,
      },
    ],
  },
  online: {
    status: "online",
    activities: [
      {
        name: "🔎 Online",
        type: Discord.ActivityType.Custom,
      },
    ],
  },
  shuttingDown: {
    status: "online",
    activities: [
      {
        name: "⛔ Shutting down...",
        type: Discord.ActivityType.Custom,
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
  if (!discordClient.isReady()) {
    logNoDiscord("Discord client not ready, skipping presence update");
    return;
  }
  await discordClient.user.setPresence(defs[p]);
  return log(`Discord presence set to ${p}`, {
    skipDiscord: options?.skipDiscordLog,
  });
};

export const shutdownDiscordBot = () => {
  console.log("Setting bot presence to offline");
  return setDiscordPresence("offline").then(() => {
    console.log("Destroying discord client");
    return discordClient?.destroy();
  });
};
