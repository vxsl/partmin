import * as Discord from "discord.js";

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

export const setDiscordPresence = async (p: Presence) => {
  const { log } = await import("util/log.js");
  if (!discordClient.isReady()) {
    log("Discord client not ready, skipping presence update", {
      skipDiscord: true,
    });
    return;
  }
  await discordClient.user.setPresence(defs[p]);
  log(`Discord presence set to ${p}`);
};

export const shutdownDiscordBot = () => {
  console.log("Setting bot presence to offline");
  return setDiscordPresence("offline").then(() => {
    console.log("Destroying discord client");
    return discordClient?.destroy();
  });
};
