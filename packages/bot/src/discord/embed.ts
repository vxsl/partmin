import Discord from "discord.js";
import { ChannelKey, getChannel } from "discord/util.js";
import { Listing, getCommuteOrigin } from "listing.js";
import { platforms } from "types/platform.js";
import { mdQuote, trimAddress } from "util/data.js";
import { formatCommuteSummaryMD } from "util/geo.js";
import { notUndefined } from "util/misc.js";

const listingEmbed = (l: Listing) => {
  let descriptionHeader = [
    `${
      l.details.price
        ? `**$${parseFloat(`${l.details.price}`).toFixed(2)}**`
        : undefined
    }`,
    l.computed?.locationLinkMD ??
      l.details.shortAddress ??
      l.details.coords?.toString(),
  ]
    .filter(notUndefined)
    .join(" / ");

  const dests = Object.keys(l.computed?.distanceTo ?? {});
  if (dests.length) {
    descriptionHeader = [
      descriptionHeader,
      dests
        .map((d) => {
          const o = getCommuteOrigin(l);
          const summ = l.computed?.distanceTo?.[d];
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
    .setTitle(l.details.title ?? null)
    .setDescription(
      [
        descriptionHeader,
        l.computed?.bulletPoints?.map((p) => `- ${p}`).join("\n") ?? "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .setURL(l.url)
    .setImage(l.imgURLs[0] ?? null)
    .setFooter({
      text: l.platform,
      iconURL: platforms[l.platform].icon,
    })
    .setTimestamp(new Date())
    .setFields(
      !l.videoURLs.length
        ? []
        : [
            l.videoURLs.length > 1
              ? {
                  name: `🎥 Video${l.videoURLs.length !== 1 ? "s" : ""}`,
                  value: l.videoURLs.join("\n"),
                }
              : {
                  name: `🎥 Video: ${l.videoURLs[0]}`,
                  value: " ",
                },
          ]
    );
};

const getButtons = (l: Listing) => {
  let prevImgButton, imgButton, nextImgButton, descButton;

  if (l.details.longDescription !== undefined) {
    descButton = new Discord.ButtonBuilder()
      .setCustomId("desc")
      .setLabel(`📄`)
      .setStyle(Discord.ButtonStyle.Secondary);
  }
  if (l.imgURLs.length > 1) {
    prevImgButton = new Discord.ButtonBuilder()
      .setCustomId("prevImg")
      .setLabel("⬅")
      .setStyle(Discord.ButtonStyle.Secondary);
    imgButton = new Discord.ButtonBuilder()
      .setCustomId("img")
      .setLabel(`️${1} / ${l.imgURLs.length}`)
      .setStyle(Discord.ButtonStyle.Secondary);
    nextImgButton = new Discord.ButtonBuilder()
      .setCustomId("nextImg")
      .setLabel(`➡`)
      .setStyle(Discord.ButtonStyle.Secondary);
  }
  return { prevImgButton, imgButton, nextImgButton, descButton };
};

export const sendEmbedWithButtons = async (
  l: Listing,
  c: ChannelKey = "main"
) => {
  const channel = await getChannel(c);

  const embed = listingEmbed(l);

  const buttons = getButtons(l);
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
    const len = l.imgURLs.length;
    i = (backwards ? i - 1 + len : i + 1) % len;
    imgButton?.setLabel(`${i + 1} / ${len}`);
    embed.setImage(l.imgURLs[i]);
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
          if (l.details.longDescription === undefined) {
            break;
          }
          descButton?.setDisabled(true);
          msg.edit({ components });

          if (!descOpened) {
            embed.setDescription(
              [origDesc, mdQuote(l.details.longDescription)]
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
