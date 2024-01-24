import dotenv from "dotenv";
import Discord from "discord.js";

dotenv.config();

const client = new Discord.Client({ intents: 512 });

const token = process.env.DISCORD_BOT_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;

if (!token) {
  console.error("No DISCORD_BOT_TOKEN provided in .env");
  process.exit(1);
}
if (!channelId) {
  console.error("No DISCORD_CHANNEL_ID provided in .env");
  process.exit(1);
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user?.tag}`);
  sendMessageToChannel(
    "I'm online! I'll send you a message when I find something."
  );
});

// notify the channel when the bot crashes: // TODO verify
process.on("uncaughtException", (err) => {
  sendMessageToChannel(`uncaughtException: ${err}`);
});

export const sendMessageToChannel = async (
  // message: string,
  // imagePath?: string
  // ...args: Parameters<typeof client.>
  // ...args: Parameters<typeof client.>
  // msg: Discord.MessagePayload
  ...args: Parameters<Discord.PartialTextBasedChannelFields["send"]>
) => {
  const channel = (await (client.channels.cache.get(channelId) ??
    client.channels.fetch(channelId))) as Discord.TextChannel;
  if (channel) {
    // channel.send(message);
    channel.send(...args);
    // channel.send({
    //   content: message,
    //   files: imagePath ? [imagePath] : undefined,
    // });
  } else {
    console.error(`Channel with ID ${channelId} not found`);
  }
};

export const sendEmbedToChannel = async (
  // embed: Discord.MessageEmbedOptions
  // ...args: Parameters<Discord.PartialTextBasedChannelFields["send"]>
  // embed: Discord.Embed
  // embed: Parameters<Discord.PartialTextBasedChannelFields["send"]>[0]["embeds"]
  ...embeds: Discord.APIEmbed[]
) => {
  const channel = (await (client.channels.cache.get(channelId) ??
    client.channels.fetch(channelId))) as Discord.TextChannel;
  if (channel) {
    await channel.send({ embeds });
  } else {
    console.error(`Channel with ID ${channelId} not found`);
  }
};

client.login(token);
