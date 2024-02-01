import config from "config.js";
import { statusPathForAuditor } from "constants.js";
import { greetings } from "discord/chat.js";
import { discordClient } from "discord/client.js";
import { ChannelKey, discordSend } from "discord/util.js";
import dotenv from "dotenv-mono";
import { writeFileSync } from "fs";

dotenv.load();

const token = process.env.DISCORD_BOT_TOKEN;
export const discordChannelIDs = (
  config.development?.testing
    ? {
        main: process.env.DISCORD_CHANNEL_ID_MAIN_TEST,
        logs: process.env.DISCORD_CHANNEL_ID_LOGS_TEST,
      }
    : {
        main: process.env.DISCORD_CHANNEL_ID_MAIN,
        logs: process.env.DISCORD_CHANNEL_ID_LOGS,
      }
) as Record<ChannelKey, string>;

if (!token) {
  throw new Error("No DISCORD_BOT_TOKEN environment variable provided");
}
if (!discordChannelIDs.main) {
  throw new Error("No DISCORD_CHANNEL_ID_MAIN environment variable provided");
}
if (!discordChannelIDs.logs) {
  throw new Error("No DISCORD_CHANNEL_ID_LOGS environment variable provided");
}

export const startDiscordBot = async () =>
  await new Promise<void>((resolve, reject) => {
    discordClient.on("ready", () => {
      if (!config.botBehaviour?.suppressGreeting) {
        discordSend(greetings[Math.floor(Math.random() * greetings.length)]);
      }
      resolve();
    });
    discordClient.login(token);
  });

type DiscordBotLoggedInStatus = "logged-in" | "logged-out";
export const writeStatusForAuditor = (status: DiscordBotLoggedInStatus) =>
  writeFileSync(statusPathForAuditor, status);
