import Discord from "discord.js";
import { ChannelKey } from "discord/constants.js";
import { discordFormat, discordSend } from "discord/util.js";
import { Listing, getCommuteOrigin } from "listing.js";
import { platforms } from "types/platform.js";
import { mdQuote, trimAddress } from "util/data.js";
import { formatCommuteSummaryMD } from "util/geo.js";
import { notUndefined } from "util/misc.js";

const uninteractedColor = "#7289da";
const interactedColor = "#424549";

const locationLink = (l: Listing) => {
  const text = l.computed?.locationLinkText;
  const url = l.computed?.locationLinkURL;
  return text && url
    ? `[${discordFormat(
        `${text}${
          l.computed?.locationLinkIsApproximate
            ? discordFormat(" (approx.)", { bold: true })
            : ""
        }`,
        { italic: true }
      )}](${url})`
    : undefined;
};

const listingEmbed = (l: Listing) => {
  let descriptionHeader = [
    `${
      l.details.price
        ? `**$${parseFloat(`${l.details.price}`).toFixed(2)}**`
        : undefined
    }`,
    locationLink(l) ?? l.details.shortAddress ?? l.details.coords?.toString(),
  ]
    .filter(notUndefined)
    .join(" / ");

  const dests = Object.keys(l.computed?.commuteDestinations ?? {});

  return new Discord.EmbedBuilder()
    .setColor(uninteractedColor)
    .setTitle(l.details.title ?? null)
    .setDescription(
      [
        descriptionHeader,
        dests
          .map((d) => {
            const o = getCommuteOrigin(l);
            const summ = l.computed?.commuteDestinations?.[d];
            return !summ || !o
              ? ""
              : [
                  dests.length > 1
                    ? discordFormat(`${trimAddress(d)}:`, { italic: true })
                    : undefined,
                  formatCommuteSummaryMD(summ, o, d),
                ]
                  .filter(notUndefined)
                  .join("\n");
          })
          .join("\n"),
        l.computed?.bulletPoints
          ?.map((p) => {
            const prefix = `- `;
            if (typeof p === "string") {
              return prefix + p;
            }
            const v = `${p.value}`.toLowerCase();
            return (
              prefix +
              `${
                v === "yes"
                  ? `✅ ${p.key}`
                  : v === "no"
                  ? `❌ ${p.key}`
                  : `${p.key}: ${p.value}`
              }`
            );
          })
          .join("\n") ?? "",
      ]
        .filter(Boolean)
        .join("\n\n")
    )
    .setURL(l.url)
    .setImage(l.imgURLs.find((url) => url.startsWith("http")) ?? null)
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

export const sendEmbedWithButtons = async (l: Listing, _k?: ChannelKey) => {
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

  const msg = await discordSend(embed, { components });

  if (!components || !msg) {
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
          interaction.customId === "commuteDestinations"
        );
      },
      time: 24 * 3600000,
    })
    .on("collect", async (interaction) => {
      switch (interaction.customId) {
        case "nextImg":
          embed.setColor(interactedColor);
          await navigateImg();
          break;
        case "prevImg":
          embed.setColor(interactedColor);
          await navigateImg(true);
          break;
        case "desc":
          embed.setColor(interactedColor);
          if (l.details.longDescription === undefined) {
            break;
          }
          descButton?.setDisabled(true);
          msg.edit({ components });

          if (!descOpened) {
            embed.setDescription(
              [origDesc, mdQuote(l.details.longDescription)]
                .filter(Boolean)
                .join("\n\n")
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
