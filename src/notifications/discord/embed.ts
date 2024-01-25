import Discord from "discord.js";
import { ChannelKey, getChannel } from "notifications/discord/index.js";
import { Item } from "types/item.js";
import { PlatformKey } from "types/platform.js";
import { mdQuote } from "util/data.js";
import { notUndefined } from "util/misc.js";

const platformIcons: Record<PlatformKey, string> = {
  kijiji: "https://www.kijiji.ca/favicon.ico",
  fb: "https://www.facebook.com/favicon.ico",
};

export const convertItemToDiscordEmbed = (item: Item) => {
  const descriptionHeader = [
    `${
      item.details.price
        ? `**$${parseFloat(`${item.details.price}`).toFixed(2)}**`
        : undefined
    }`,
    item.computed?.locationLinkMD ??
      item.details.location ??
      (item.details.lat && item.details.lon
        ? `(${item.details.lat}, ${item.details.lon})`
        : undefined),
  ]
    .filter(notUndefined)
    .join(" / ");

  return new Discord.EmbedBuilder()
    .setTitle(item.details.title ?? null)
    .setDescription(
      [
        descriptionHeader,
        item.computed?.bulletPoints?.map((p) => `- ${p}`).join("\n") ?? "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .setURL(item.url)
    .setImage(item.imgURLs[0] ?? null)
    .setThumbnail(item.imgURLs[1] ?? null)
    .setFooter({
      text: item.platform,
      iconURL: platformIcons[item.platform],
    })
    .setTimestamp(new Date())
    .setFields(
      !item.videoURLs.length
        ? []
        : [
            item.videoURLs.length > 1
              ? {
                  name: `🎥 Video${item.videoURLs.length !== 1 ? "s" : ""}`,
                  value: item.videoURLs.join("\n"),
                }
              : {
                  name: `🎥 Video: ${item.videoURLs[0]}`,
                  value: " ",
                },
          ]
    );
};

export const sendEmbedWithButtons = async (
  item: Item,
  c: ChannelKey = "main"
) => {
  const channel = await getChannel(c);

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
