import Discord from "discord.js";
import { ChannelKey, getChannel } from "discord/index.js";
import { Item, getCommuteOrigin } from "item.js";
import { PlatformKey } from "types/platform.js";
import { mdQuote, trimAddress } from "util/data.js";
import { formatCommuteSummaryMD } from "util/geo.js";
import { notUndefined } from "util/misc.js";

const platformIcons: Record<PlatformKey, string> = {
  kijiji: "https://www.kijiji.ca/favicon.ico",
  fb: "https://www.facebook.com/favicon.ico",
};

export const convertItemToDiscordEmbed = (item: Item) => {
  let descriptionHeader = [
    `${
      item.details.price
        ? `**$${parseFloat(`${item.details.price}`).toFixed(2)}**`
        : undefined
    }`,
    item.computed?.locationLinkMD ??
      item.details.shortAddress ??
      (item.details.lat && item.details.lon
        ? `(${item.details.lat}, ${item.details.lon})`
        : undefined),
  ]
    .filter(notUndefined)
    .join(" / ");

  const dests = Object.keys(item.computed?.distanceTo ?? {});
  if (dests.length) {
    descriptionHeader = [
      descriptionHeader,
      dests
        .map((d) => {
          const o = getCommuteOrigin(item);
          const summ = item.computed?.distanceTo?.[d];
          return !summ || !o
            ? ""
            : [
                dests.length > 1 ? trimAddress(d) : undefined,
                formatCommuteSummaryMD(summ, o, d),
              ]
                .filter(notUndefined)
                .join("\n");
        })
        .join("\n"),
    ].join("\n");
  }

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

const getButtons = (item: Item) => {
  let descButton, prevImgButton, imgButton, nextImgButton, distanceToButton;

  const loc =
    item.details.longAddress ||
    item.details.shortAddress ||
    (item.details.lat && item.details.lon
      ? `(${item.details.lat}, ${item.details.lon})`
      : undefined);
  if (loc) {
    distanceToButton = new Discord.ButtonBuilder()
      .setCustomId("distanceTo")
      .setLabel(`📏`)
      .setStyle(Discord.ButtonStyle.Secondary);
  }
  if (item.details.longDescription !== undefined) {
    descButton = new Discord.ButtonBuilder()
      .setCustomId("desc")
      .setLabel(`📄`)
      .setStyle(Discord.ButtonStyle.Secondary);
  }
  if (item.imgURLs.length > 1) {
    prevImgButton = new Discord.ButtonBuilder()
      .setCustomId("prevImg")
      .setLabel("⬅")
      .setStyle(Discord.ButtonStyle.Secondary);
    imgButton = new Discord.ButtonBuilder()
      .setCustomId("img")
      .setLabel(`️${1} / ${item.imgURLs.length}`)
      .setStyle(Discord.ButtonStyle.Secondary);
    nextImgButton = new Discord.ButtonBuilder()
      .setCustomId("nextImg")
      .setLabel(`➡`)
      .setStyle(Discord.ButtonStyle.Secondary);
  }
  return { prevImgButton, imgButton, nextImgButton, descButton };
};

export const sendEmbedWithButtons = async (
  item: Item,
  c: ChannelKey = "main"
) => {
  const channel = await getChannel(c);

  const embed = convertItemToDiscordEmbed(item);

  const buttons = getButtons(item);
  const buttonsArr = Object.values(buttons).filter(notUndefined);

  const components = !buttonsArr.length
    ? undefined
    : [
        new Discord.ActionRowBuilder<Discord.ButtonBuilder>({
          components: buttonsArr,
        }),
      ];

  const msg = await channel.send({ embeds: [embed], components });

  if (!components) {
    return;
  }

  const { imgButton, descButton } = buttons;

  let i = 0;
  let descOpened = false;
  let origDesc = embed.data.description ?? null;

  const navigateImg = async (backwards = false) => {
    const len = item.imgURLs.length;
    i = (backwards ? i - 1 + len : i + 1) % len;
    imgButton?.setLabel(`${i + 1} / ${len}`);
    embed.setImage(item.imgURLs[i]);
    await msg.edit({ embeds: [embed], components });
  };

  msg
    .createMessageComponentCollector({
      filter: (interaction) => {
        interaction.deferUpdate();
        return (
          interaction.customId === "nextImg" ||
          interaction.customId === "prevImg" ||
          interaction.customId === "desc" ||
          interaction.customId === "distanceTo"
        );
      },
      time: 24 * 3600000,
    })
    .on("collect", async (interaction) => {
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
          descButton?.setDisabled(true);
          msg.edit({ components });

          if (!descOpened) {
            embed.setDescription(
              [origDesc, mdQuote(item.details.longDescription)]
                .filter(Boolean)
                .join("\n")
            );
            descButton?.setStyle(Discord.ButtonStyle.Primary);
            // TODO consider automatically closing the description after a minute or so
          } else {
            embed.setDescription(origDesc);
            descButton?.setStyle(Discord.ButtonStyle.Secondary);
          }
          descOpened = !descOpened;
          descButton?.setDisabled(false);
          await msg.edit({ embeds: [embed], components });
          break;
      }
    });
};
