import config from "config.js";
import Discord from "discord.js";
import { greetings } from "discord/chat.js";
import { ChannelKey, discordSend as discordSend } from "discord/util.js";
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
  console.error("No DISCORD_BOT_TOKEN provided in .env");
  process.exit(1);
}
if (!discordChannelIDs.main) {
  console.error("No DISCORD_CHANNEL_ID_MAIN provided in .env");
  process.exit(1);
}
if (!discordChannelIDs.logs) {
  console.error("No DISCORD_CHANNEL_ID_LOGS provided in .env");
  process.exit(1);
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
