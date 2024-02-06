import cache from "cache.js";
import Discord, {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
  MentionableSelectMenuBuilder,
  Message,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from "discord.js";
import { ChannelKey } from "discord/constants.js";
import { discordFormat, discordSend, getChannel } from "discord/util.js";
import { Listing, getCommuteOrigin } from "listing.js";
import { platforms } from "types/platform.js";
import { trimAddress } from "util/data.js";
import { formatCommuteSummaryMD, getGoogleMapsLink } from "util/geo.js";
import { debugLog, log, verboseLog } from "util/log.js";
import { notUndefined, splitString } from "util/misc.js";

const maxEmbedLength = 2048;
const maxFieldLength = 1024;
const uninteractedColor = "#7289da";
const interactedColor = "#424549";

const getListingEmbed = (l: Listing) => {
  let descriptionHeader = [
    `${
      l.details.price
        ? `**$${parseFloat(`${l.details.price}`).toFixed(2)}**`
        : undefined
    }`,
    l.computed?.locationLinkText && l.computed?.locationLinkURL
      ? discordFormat(
          `${l.computed.locationLinkText}${
            l.computed?.locationLinkIsApproximate
              ? discordFormat(" (approx.)", { bold: true })
              : ""
          }`,
          { italic: true, link: l.computed.locationLinkURL }
        )
      : l.details.shortAddress
      ? discordFormat(l.details.shortAddress, {
          italic: true,
          link: getGoogleMapsLink(l.details.shortAddress),
        })
      : l.details.coords
      ? discordFormat(l.details.coords.toString(), {
          italic: true,
          link: getGoogleMapsLink(l.details.coords.toString()),
        })
      : undefined,
  ]
    .filter(notUndefined)
    .join(" ┃ ");

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

const imageButtonID = "img" as const;
const nextImageButtonID = "nextImg" as const;
const prevImageButtonID = "prevImg" as const;
const descButtonID = "desc" as const;
const buttonIDs = [
  imageButtonID,
  nextImageButtonID,
  prevImageButtonID,
  descButtonID,
] as const;
const isButtonID = (id?: string | null) =>
  !!id && buttonIDs.includes(id as any);

type ListingButtons = {
  descButton?: Discord.ButtonBuilder;
} & (
  | {
      prevImgButton: Discord.ButtonBuilder;
      imgButton: Discord.ButtonBuilder;
      nextImgButton: Discord.ButtonBuilder;
    }
  | {
      prevImgButton?: undefined;
      imgButton?: undefined;
      nextImgButton?: undefined;
    }
);

const getButtons = (l: Listing): ListingButtons => {
  let result: ListingButtons = {};
  if (l.imgURLs.length > 1) {
    result = {
      ...result,
      prevImgButton: new Discord.ButtonBuilder()
        .setCustomId(prevImageButtonID)
        .setLabel("⬅")
        .setStyle(Discord.ButtonStyle.Secondary),
      imgButton: new Discord.ButtonBuilder()
        .setCustomId(imageButtonID)
        .setLabel(`️${1} / ${l.imgURLs.length}`)
        .setStyle(Discord.ButtonStyle.Secondary),
      nextImgButton: new Discord.ButtonBuilder()
        .setCustomId(nextImageButtonID)
        .setLabel(`➡`)
        .setStyle(Discord.ButtonStyle.Secondary),
    };
  }
  if (l.details.longDescription !== undefined) {
    result.descButton = new Discord.ButtonBuilder()
      .setCustomId(descButtonID)
      .setLabel(`📄`)
      .setStyle(Discord.ButtonStyle.Secondary);
  }
  return result;
};

const descriptionFields = (l: Listing) => {
  const desc = l.details.longDescription;
  if (desc === undefined) {
    return undefined;
  }
  const v = discordFormat(desc.replace(/\s+$/, ""), { quote: true });
  const chunks = splitString(v, maxFieldLength - 10);
  return chunks.map((c, i) => {
    let value = "";
    if (!c.match(/^\s*>\s/)) {
      value = "> ";
    }
    if (i > 0) {
      value += "...";
    }
    value += c;
    if (i !== chunks.length - 1) {
      value += "...";
    }
    return { name: " ", value };
  });
};

const collect = ({
  msg,
  listing,
  embed,
  components,
  state,
  imgButton,
  descButton,
}: {
  msg: Message;
  listing: Listing;
  embed: EmbedBuilder;
  components: Discord.ActionRowBuilder<Discord.ButtonBuilder>[];
  imgButton?: ButtonBuilder;
  descButton?: ButtonBuilder;
  state?: {
    imgIndex: number;
    descriptionOpened: boolean;
  };
}) => {
  let descIsToggled = state?.descriptionOpened ?? false;
  let imgIndex = state?.imgIndex ?? 0;
  const navigateImg = (backwards = false) => {
    const len = listing.imgURLs.length;
    imgIndex = (backwards ? imgIndex - 1 + len : imgIndex + 1) % len;
    embed.setImage(listing.imgURLs[imgIndex]);
    imgButton?.setLabel(`${imgIndex + 1} / ${len}`);
    return msg.edit({ embeds: [embed], components });
  };
  return msg
    .createMessageComponentCollector({
      filter: (interaction) => {
        interaction.deferUpdate();
        return isButtonID(interaction.customId);
      },
      time: 24 * 3600000,
    })
    .on("collect", async (interaction) => {
      try {
        switch (interaction.customId) {
          case nextImageButtonID:
            embed.setColor(interactedColor);
            await navigateImg();
            break;
          case prevImageButtonID:
            embed.setColor(interactedColor);
            await navigateImg(true);
            break;
          case descButtonID:
            embed.setColor(interactedColor);
            const desc = listing.details.longDescription;
            if (desc === undefined) {
              break;
            }
            descButton?.setDisabled(true);
            msg.edit({ components });

            const toToggle = discordFormat(desc, { quote: true });
            const og = (embed.data.description ?? "")
              .replace(toToggle, "")
              .replace(/\n+$/, "");
            const withToggled = [og, toToggle].join("\n\n");

            if (withToggled.length <= maxEmbedLength) {
              embed.setDescription(descIsToggled ? og : withToggled);
            } else {
              const descFields = descriptionFields(listing) ?? [];
              const fields = embed.data.fields ?? [];
              if (descIsToggled) {
                embed.spliceFields(
                  Math.max(fields.length - descFields.length, 0),
                  descFields.length
                );
              } else {
                embed.addFields(descFields);
              }
            }

            descIsToggled = !descIsToggled;
            descButton
              ?.setStyle(
                descIsToggled
                  ? Discord.ButtonStyle.Primary
                  : Discord.ButtonStyle.Secondary
              )
              .setDisabled(false);
            await msg.edit({ embeds: [embed], components });
            break;
        }
      } catch (e) {
        log(
          `Error while handling interaction for message ${msg.id} for listing ${listing.url}:`,
          { error: true }
        );
        log(e);
        try {
          descButton?.setDisabled(false);
          await msg.edit({ components });
        } catch (_e) {
          log(
            `Error while trying to reset button state for message ${msg.id} for listing ${listing.url}:`,
            { error: true }
          );
        }
      }
    });
};

export const reinitializeCollector = (
  msg: Discord.Message,
  listing: Listing
) => {
  if (!msg.embeds?.length) {
    log(
      `Trying to set up a collector on a message without an embed: ${msg.id}`
    );
    return;
  }
  if (!msg.components?.length || !msg.components[0]?.components?.length) {
    log(
      `Trying to set up a collector on a message without components: ${msg.id}`
    );
    return;
  }

  let imgButton: ButtonBuilder | undefined,
    descButton: ButtonBuilder | undefined;

  const components = [
    new ActionRowBuilder<any>().addComponents(
      msg.components[0].components.map((c) => {
        switch (c.type) {
          case ComponentType.Button:
            const b = ButtonBuilder.from(c);
            switch (c.customId) {
              case imageButtonID:
                imgButton = b;
                break;
              case descButtonID:
                descButton = b;
                break;
            }
            return b;
          case ComponentType.StringSelect:
            return StringSelectMenuBuilder.from(c);
          case ComponentType.RoleSelect:
            return RoleSelectMenuBuilder.from(c);
          case ComponentType.MentionableSelect:
            return MentionableSelectMenuBuilder.from(c);
          case ComponentType.ChannelSelect:
            return ChannelSelectMenuBuilder.from(c);
          case ComponentType.UserSelect:
            return UserSelectMenuBuilder.from(c);
        }
      })
    ),
  ];

  const imgLabel = imgButton?.data.label;
  let imgIndex = 0;
  if (imgLabel) {
    const match = imgLabel.match(/(\d+) \/ \d+/);
    if (match) {
      imgIndex = parseInt(match[1], 10) - 1;
    }
  }

  return collect({
    msg,
    listing,
    embed: EmbedBuilder.from(msg.embeds[0]),
    components,
    imgButton,
    descButton,
    state: {
      imgIndex: imgIndex,
      descriptionOpened: descButton?.data.style === Discord.ButtonStyle.Primary,
    },
  });
};

export const reinitializeCollectors = async () => {
  const listings = cache.listings.value;
  if (!listings?.length) {
    return;
  }
  const listingsMap = new Map(listings.map((l) => [l.url, l]));
  const appID = await cache.discordAppID.requireValue();
  await getChannel("listings").then((c) =>
    c.messages.fetch().then((messages) =>
      messages.forEach((m) => {
        const url = m.embeds?.[0]?.url;
        if (!url) {
          verboseLog(
            `Not setting up collector for message ${m.id} because it doesn't have an embed with a url.`
          );
          return;
        }
        if (m.author.id !== appID) {
          verboseLog(
            `Not setting up collector for message ${m.id} because it's not from the bot (author: ${m.author.id})`
          );
          return;
        }
        const l = listingsMap.get(url);
        if (!l) {
          debugLog(
            `Not setting up collector for message ${m.id} because the url ${url} doesn't match any cached listings.`
          );
          return;
        }
        debugLog(`Setting up collector for message ${m.id}...`);
        try {
          reinitializeCollector(m, l);
        } catch (e) {
          log(
            `Error while setting up collector for message ${m.id} for listing ${l.url}:`,
            { error: true }
          );
          log(e);
        }
      })
    )
  );
};

export const sendListing = async (listing: Listing, channel?: ChannelKey) => {
  const embed = getListingEmbed(listing);

  const buttons = getButtons(listing);
  const buttonsArr = Object.values(buttons).filter(notUndefined);

  const components = !buttonsArr.length
    ? undefined
    : [
        new Discord.ActionRowBuilder<Discord.ButtonBuilder>({
          components: buttonsArr,
        }),
      ];

  const msg = await discordSend(embed, { components, channel });

  if (!components || !msg) {
    return;
  }

  return collect({
    msg,
    listing: listing,
    embed,
    components,
    imgButton: buttons.imgButton,
    descButton: buttons.descButton,
  });
};
