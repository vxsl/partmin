import config from "config.js";
import Discord from "discord.js";
import dotenv from "dotenv";
import { greetings } from "discord/chat.js";
import { errorLog, log } from "util/log.js";

dotenv.config();

const client = new Discord.Client({ intents: 512 });

export type ChannelKey = "main" | "logs";

const token = process.env.DISCORD_BOT_TOKEN;

const channelIDs = (
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
if (!channelIDs.main) {
  console.error("No DISCORD_CHANNEL_ID_MAIN provided in .env");
  process.exit(1);
}
if (!channelIDs.logs) {
  console.error("No DISCORD_CHANNEL_ID_LOGS provided in .env");
  process.exit(1);
}

export const getChannel = async (c: ChannelKey) => {
  const id = channelIDs[c];
  const result = (await (client.channels.cache.get(id) ??
    client.channels.fetch(id))) as Discord.TextChannel;
  if (!result) {
    throw new Error(`Channel with ID ${id} not found`);
  }
  return result;
};

client.on("ready", () => {
  // // delete all messages in channel:
  // const channel = await getChannel("main");
  // const messages = await channel.messages.fetch();
  // await channel.bulkDelete(messages);
  // process.exit();

  if (!config.development?.skipGreeting) {
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    discordMsg("main", g);
    log(g);
  }
});

export const discordMsg = async (
  c: ChannelKey,
  ...args: Parameters<Discord.PartialTextBasedChannelFields["send"]>
) => {
  try {
    const channel = await getChannel(c);
    if (!channel.client.isReady()) {
      console.error(`Client for channel with ID ${channelIDs[c]} not ready`);
      return;
    }
    if (channel) {
      return channel.send(...args);
    }
    console.error(`Channel with ID ${channelIDs[c]} not found`);
  } catch (e) {
    errorLog(`Error while sending message to Discord:`);
    errorLog(e);
  }
};

export const startDiscordBot = async () => {
  await client.login(token);
  return client;
};
