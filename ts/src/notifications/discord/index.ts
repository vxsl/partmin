import Discord from "discord.js";
import dotenv from "dotenv";
import { By, WebDriver } from "selenium-webdriver";
import { kijijiVisit } from "../../kijiji/util/index.js";
import { Item } from "../../process.js";
import { clickByXPath } from "../../util/selenium.js";
import {
  attachVideosToEmbed,
  buildNextImgButton,
  buildPrevImgButton,
  convertItemToDiscordEmbed,
} from "./util.js";

dotenv.config();

const client = new Discord.Client({ intents: 512 });

const getChannel = async (id: string) => {
  const result = (await (client.channels.cache.get(id) ??
    client.channels.fetch(id))) as Discord.TextChannel;
  if (!result) {
    throw new Error(`Channel with ID ${id} not found`);
  }
  return result;
};

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

client.on("ready", async () => {
  // // delete all messages in channel:
  // const channel = await getChannel(channelId);
  // const messages = await channel.messages.fetch();
  // await channel.bulkDelete(messages);
  // process.exit();

  sendMessageToChannel(
    "I'm online! I'll send you a message when I find something."
  );
});

process.on("uncaughtException", (err) => {
  sendMessageToChannel(`**Crashed.**\n\`\`\`\n${err}\`\`\``);
});

export const sendMessageToChannel = async (
  ...args: Parameters<Discord.PartialTextBasedChannelFields["send"]>
) => {
  const channel = await getChannel(channelId);
  if (channel) {
    channel.send(...args);
  } else {
    console.error(`Channel with ID ${channelId} not found`);
  }
};

export const sendEmbedToChannel = async (driver: WebDriver, item: Item) => {
  const channel = await getChannel(channelId);
  const embed = convertItemToDiscordEmbed(item);

  if (item.imgURLs.length <= 1) {
    await channel.send({ embeds: [embed] });
    return;
  }

  const imgButton = new Discord.ButtonBuilder()
    .setCustomId("img")
    .setLabel(`️${1} / ${item.imgURLs.length}`)
    .setStyle(Discord.ButtonStyle.Secondary);
  const buttonRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>({
    components: [
      new Discord.ButtonBuilder()
        .setCustomId("prevImg")
        .setLabel("⬅")
        .setStyle(Discord.ButtonStyle.Secondary),
      imgButton,
      new Discord.ButtonBuilder()
        .setCustomId("nextImg")
        .setLabel(`➡`)
        .setStyle(Discord.ButtonStyle.Secondary),
    ],
  });

  const msg = await channel.send({
    embeds: [embed],
    components: [buttonRow],
  });

  const collector = msg.createMessageComponentCollector({
    filter: (interaction) => {
      interaction.deferUpdate();
      return (
        interaction.customId === "nextImg" || interaction.customId === "prevImg"
      );
    },
    time: 24 * 3600000,
  });

  let i = 0;

  const navigateImg = async (backwards = false) => {
    const len = item.imgURLs.length;
    i = (backwards ? i - 1 + len : i + 1) % len;
    imgButton.setLabel(`${i + 1} / ${len}`);
    if (len > 1) {
      embed.setThumbnail(item.imgURLs[(i + 1) % len]);
    }
    embed.setImage(item.imgURLs[i]);
    await msg.edit({ embeds: [embed], components: [buttonRow] });
  };

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "nextImg") {
      await navigateImg();
      return;
    }
    if (interaction.customId === "prevImg") {
      await navigateImg(true);
      return;
    }

    // await kijijiVisit(item.url, driver);
    // await clickByXPath(driver, `//div[@id='mainHeroImage']`);
    // let newImgs: string[];
    // try {
    //   const els = await driver.findElements(
    //     By.xpath('//div[contains(@class, "thumbnailList")]//img')
    //   );
    //   newImgs = await Promise.all(
    //     els.map((element, i) => element.getAttribute("src"))
    //   );
    //   imgs.push(
    //     ...newImgs.filter((src, i) => i > 0 && src && !imgs.includes(src))
    //   );
    // } catch (error) {}

    // attachVideosToEmbed(embed, imgs);

    // imgButton.setDisabled(false);
    // prevImgButton.setDisabled(false).setStyle(Discord.ButtonStyle.Primary);
    // nextImgButton.setDisabled(false).setStyle(Discord.ButtonStyle.Primary);
    // await msg.edit({ components: [buttonRow] });
    // await navigateImg();
  });
};

client.login(token);
