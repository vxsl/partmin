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

  const greetings = [
    "👋 Hey there! I'm ready to help you find the perfect apartment!",
    "🏠 Welcome! Let's embark on this apartment hunting adventure together!",
    "🌟 Greetings! Ready to dive into the world of cozy living spaces?",
    "🚀 Hey! I'm on a mission to find your dream apartment. Let's get started!",
    "🔍 Searching for the ideal apartment? I've got your back!",
    "🎉 Woohoo! I'm here to make apartment hunting as exciting as possible!",
    "🌈 Hello! Let's make finding your new home a colorful experience!",
    "💼 Time to upgrade your living situation! Let's find that perfect pad.",
    "🌆 Welcome, urban explorer! Let's discover the best apartments in town!",
    "🚪 Knock, knock! Who's ready to open the door to their new home?",
    "🎈 Greetings, seeker of sanctuary! Let's find your happy place.",
    "💫 Hey! Ready to turn your apartment dreams into reality?",
    "🏰 Welcome to the kingdom of apartments! Your castle awaits.",
    "🌺 Aloha! Let's find an apartment that feels like a tropical paradise.",
    "🎊 It's apartment-hunting time! Get ready for some fun discoveries!",
    "🕵️‍♂️ Agent Apartment at your service! Let the hunt begin!",
    "🌠 Greetings, stargazer! Let's find a home that's out of this world.",
    "🛋️ Ready to cozy up in a new place? Let's find the perfect spot!",
    "🚪 Opening doors to new opportunities! Let's find your dream apartment.",
    "🎁 Surprise! I'm here to unwrap the best apartment options for you.",
    "🏙️ City slicker or suburban explorer? Let's find your ideal habitat!",
    "🔑 Unlocking the door to your next adventure! Let's find a great apartment.",
    "🏡 Home is where the heart is. Let's find the perfect place for yours!",
    "🌟 Starship Apartment, ready for liftoff! Let's explore the housing galaxy.",
    "🍀 Luck be your guide on this apartment hunting journey! Let's find gold!",
    "🌈 Rainbow of possibilities awaits! Let's find your perfect color.",
    "🎮 Game on! Ready to level up your living situation?",
    "🎵 Cue the apartment hunting anthem! Let's find your harmonious home.",
    "🌌 Welcome to the cosmic quest for the perfect apartment! Let's explore.",
    "🏰 Castle or condo? Let's find the fortress that suits you best!",
    "🌆 City lights or countryside charm? Let's discover your dream setting!",
    "🛌 Dreaming of the perfect sleep sanctuary? Let's make it a reality!",
    "🌠 Starry-eyed for a new home? Let's make your wish come true!",
    "🏠 Knock, knock! Who's ready to open the door to happiness?",
    "🚀 Blast off into the world of fantastic apartments! Let's explore together.",
    "🌺 Aloha! Ready to find a slice of paradise in your new home?",
  ];

  sendMessageToChannel(greetings[Math.floor(Math.random() * greetings.length)]);
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

  const descButton = new Discord.ButtonBuilder()
    .setCustomId("desc")
    .setLabel(`📄`)
    .setStyle(Discord.ButtonStyle.Secondary);

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
    if (len > 1) {
      embed.setThumbnail(item.imgURLs[(i + 1) % len]);
    }
    embed.setImage(item.imgURLs[i]);
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
        descButton.setDisabled(true);
        msg.edit({ components: [buttonRow] });

        if (!descOpened) {
          embed.setDescription(
            [origDesc, item.details.longDescription]
              .filter(Boolean)
              .join("\n---\n")
          );
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
