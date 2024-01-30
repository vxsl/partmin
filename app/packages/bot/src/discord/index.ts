import config from "config.js";
import Discord from "discord.js";
import { greetings } from "discord/chat.js";
import { ChannelKey, discordSend } from "discord/util.js";
import dotenv from "dotenv-mono";

dotenv.load();

export const discordClient = new Discord.Client({ intents: 512 });

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

discordClient.on("ready", () => {
  if (!config.development?.skipGreeting) {
    discordSend(greetings[Math.floor(Math.random() * greetings.length)]);
  }
});

export const startDiscordBot = async () => {
  await discordClient.login(token);
  return discordClient;
};
