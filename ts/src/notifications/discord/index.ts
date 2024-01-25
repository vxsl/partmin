import Discord from "discord.js";
import dotenv from "dotenv";
import { WebDriver } from "selenium-webdriver";
import config from "../../../../config.json" assert { type: "Config" };
import { Item } from "../../process.js";
import { convertItemToDiscordEmbed } from "./util.js";
import { errorLog, log } from "../../util/misc.js";
import { mdQuote } from "../../util/data.js";
import { greetings } from "./chat.js";

dotenv.config();

const client = new Discord.Client({ intents: 512 });

type Channel = "main" | "logs";

const getChannel = async (c: Channel) => {
  const id = channelIDs[c];
  const result = (await (client.channels.cache.get(id) ??
    client.channels.fetch(id))) as Discord.TextChannel;
  if (!result) {
    throw new Error(`Channel with ID ${id} not found`);
  }
  return result;
};

const token = process.env.DISCORD_BOT_TOKEN;

const channelIDs = {
  main: config.testing
    ? process.env.DISCORD_CHANNEL_ID_MAIN_TEST
    : process.env.DISCORD_CHANNEL_ID_MAIN,
  logs: config.testing
    ? process.env.DISCORD_CHANNEL_ID_LOGS_TEST
    : process.env.DISCORD_CHANNEL_ID_LOGS,
} as Record<Channel, string>; // TODO remove assertion

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

client.on("ready", async () => {
  // // delete all messages in channel:
  // const channel = await getChannel("main");
  // const messages = await channel.messages.fetch();
  // await channel.bulkDelete(messages);
  // process.exit();

  if (!config.skipGreeting) {
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    discordMsg("main", g);
    log(g);
  }
});

export const discordMsg = async (
  c: Channel,
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

export const discordEmbed = async (driver: WebDriver, item: Item) => {
  const channel = await getChannel("main");

  const embed = convertItemToDiscordEmbed(item);

  const descButton = new Discord.ButtonBuilder()
    .setCustomId("desc")
    .setLabel(`📄`)
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(item.details.longDescription === undefined);

  const buttonRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>({
    components: [descButton],
  });

  if (item.imgURLs.length <= 1) {
    await channel.send({ embeds: [embed], components: [buttonRow] });
    return;
  }

  const imgButton = new Discord.ButtonBuilder()
    .setCustomId("img")
    .setLabel(`️${1} / ${item.imgURLs.length}`)
    .setStyle(Discord.ButtonStyle.Secondary);
  buttonRow.setComponents([
    new Discord.ButtonBuilder()
      .setCustomId("prevImg")
      .setLabel("⬅")
      .setStyle(Discord.ButtonStyle.Secondary),
    imgButton,
    new Discord.ButtonBuilder()
      .setCustomId("nextImg")
      .setLabel(`➡`)
      .setStyle(Discord.ButtonStyle.Secondary),
    descButton,
  ]);

  const msg = await channel.send({
    embeds: [embed],
    components: [buttonRow],
  });

  const collector = msg.createMessageComponentCollector({
    filter: (interaction) => {
      interaction.deferUpdate();
      return (
        interaction.customId === "nextImg" ||
        interaction.customId === "prevImg" ||
        interaction.customId === "desc"
      );
    },
    time: 24 * 3600000,
  });

  let i = 0;
  let descOpened = false;
  let origDesc = embed.data.description ?? null;

  const navigateImg = async (backwards = false) => {
    const len = item.imgURLs.length;
    i = (backwards ? i - 1 + len : i + 1) % len;
    imgButton.setLabel(`${i + 1} / ${len}`);
    embed.setImage(item.imgURLs[i]).setThumbnail(null);
    await msg.edit({ embeds: [embed], components: [buttonRow] });
  };

  collector.on("collect", async (interaction) => {
    switch (interaction.customId) {
      case "nextImg":
        await navigateImg();
        break;
      case "prevImg":
        await navigateImg(true);
        break;
      case "desc":
        if (item.details.longDescription === undefined) {
          break;
        }
        descButton.setDisabled(true);
        msg.edit({ components: [buttonRow] });

        if (!descOpened) {
          embed
            .setDescription(
              [origDesc, mdQuote(item.details.longDescription)]
                .filter(Boolean)
                .join("\n")
            )
            .setThumbnail(null);
          descButton.setStyle(Discord.ButtonStyle.Primary);
          // TODO consider automatically closing the description after a minute or so
        } else {
          embed.setDescription(origDesc);
          descButton.setStyle(Discord.ButtonStyle.Secondary);
        }
        descOpened = !descOpened;
        descButton.setDisabled(false);
        await msg.edit({ embeds: [embed], components: [buttonRow] });
        // await kijijiVisit(item.url, driver);
        break;
    }
  });
};

export const startDiscordBot = async () => {
  await client.login(token);
  return client;
};
