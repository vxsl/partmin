import Discord from "discord.js";
import dotenv from "dotenv";
import { WebDriver } from "selenium-webdriver";
import config from "../../../../config.json" assert { type: "Config" };
import { Item } from "../../process.js";
import { convertItemToDiscordEmbed } from "./util.js";
import { log } from "../../util/misc.js";

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
    ? process.env.DISCORD_CHANNEL_ID_TEST
    : process.env.DISCORD_CHANNEL_ID_MAIN,
  logs: process.env.DISCORD_CHANNEL_ID_LOGS,
} as Record<Channel, string>; // TODO remove assertion

if (!token) {
  console.error("No DISCORD_BOT_TOKEN provided in .env");
  process.exit(1);
}
if (!channelIDs.main) {
  console.error("No DISCORD_CHANNEL_ID provided in .env");
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

  const g = greetings[Math.floor(Math.random() * greetings.length)];
  discordMsg("main", g);
  log(g);
});

process.on("uncaughtException", async (err) => {
  await log(`**Crashed.**\n\`\`\`\n${err}\`\`\``);
  process.exit(1);
});

export const discordMsg = async (
  c: Channel,
  ...args: Parameters<Discord.PartialTextBasedChannelFields["send"]>
) => {
  const channel = await getChannel(c);
  if (channel) {
    return channel.send(...args);
  } else {
    console.error(`Channel with ID ${channelIDs[c]} not found`);
  }
};

export const discordEmbed = async (driver: WebDriver, item: Item) => {
  const channel = await getChannel("main");

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
            [origDesc, `\`\`\`\n${item.details.longDescription}\n\`\`\``]
              .filter(Boolean)
              .join("\n")
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
  });
};

client.login(token);
