import cache from "cache.js";
import Discord from "discord.js";
import {
  maxEmbedLength,
  maxFieldLength,
  maxMessagesToFetchAtOnce,
} from "discord/constants.js";
import {
  SendEmbedOptions,
  buttonGroup,
  initializeInteractiveMessage,
  sendEmbed,
} from "discord/interactive/index.js";
import listingEmbed, { colors } from "discord/interactive/listing/embed.js";
import { discordFormat, getTextChannel } from "discord/util.js";
import { Listing } from "listing.js";
import { debugLog, log } from "util/log.js";
import { splitString } from "util/misc.js";

const getListingButtonGroups = (l: Listing) => ({
  ...(l.imgURLs.length > 1 && { imageCycle: imageCycle(l) }),
  ...(l.details.longDescription && { descriptionToggle: descriptionToggle(l) }),
});

const ids = {
  img: "img",
  nextImg: "nextImg",
  prevImg: "prevImg",
  desc: "desc",
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

const descriptionToggle = (l: Listing) =>
  buttonGroup<{ toggled: boolean }>({
    initState: ({ getButton }) => ({
      toggled: getButton(ids.desc).data.style === Discord.ButtonStyle.Primary,
    }),
    buttonDefs: [
      {
        data: { customId: ids.desc, label: "📄" },
        mutate: async ({ state, apply, getButton, embeds }) => {
          embeds[0].setColor(colors.interacted);
          const desc = l.details.longDescription;
          if (desc === undefined) {
            return state;
          }
          const button = getButton(ids.desc);
          const embed = embeds[0]; // TODO safe access index

          embed.setColor(colors.interacted);
          button?.setDisabled(true);
          apply();

          const toToggle = discordFormat(desc, { quote: true });
          const og = (embed.data.description ?? "")
            .replace(toToggle, "")
            .replace(/\n+$/, "");
          const withToggled = [og, toToggle].join("\n\n");

          if (withToggled.length <= maxEmbedLength) {
            embed.setDescription(state.toggled ? og : withToggled);
          } else {
            const descFields = descriptionFields(l) ?? [];
            const fields = embed.data.fields ?? [];
            if (state.toggled) {
              embed.spliceFields(
                Math.max(fields.length - descFields.length, 0),
                descFields.length
              );
            } else {
              embed.addFields(descFields);
            }
          }

          button
            ?.setStyle(
              state.toggled
                ? Discord.ButtonStyle.Secondary
                : Discord.ButtonStyle.Primary
            )
            .setDisabled(false);
          await apply();
          return { toggled: !state.toggled };
        },
      },
    ],
  });

const imageCycle = (l: Listing) =>
  buttonGroup<{ index: number }>({
    initState: ({ getButton }) => {
      const imgLabel = getButton("img").data.label;
      let index = 0;
      if (imgLabel) {
        const match = imgLabel.match(/(\d+) \/ \d+/);
        if (match) {
          index = parseInt(match[1], 10) - 1;
        }
      }
      return { index };
    },
    buttonDefs: [
      {
        data: { customId: ids.prevImg, label: "⬅" },
        mutate: ({ state, apply, getButton, embeds }) => {
          embeds[0].setColor(colors.interacted);
          const len = l.imgURLs.length;
          state.index = (state.index - 1 + len) % len;
          embeds[0].setImage(l.imgURLs[state.index]);
          getButton(ids.img).setLabel(`${state.index + 1} / ${len}`);
          apply();
          return state;
        },
      },
      { data: { customId: "img", label: `️1 / ${l.imgURLs.length}` } },
      {
        data: { customId: ids.nextImg, label: "➡" },
        mutate: ({ state, apply, getButton, embeds }) => {
          embeds[0].setColor(colors.interacted);
          const len = l.imgURLs.length;
          state.index = (state.index + 1) % len;
          embeds[0].setImage(l.imgURLs[state.index]);
          getButton(ids.img).setLabel(`${state.index + 1} / ${len}`);
          apply();
          return state;
        },
      },
    ],
  });

export const sendListing = (l: Listing, options?: SendEmbedOptions) =>
  sendEmbed({
    options,
    embeds: [listingEmbed(l).data],
    buttonGroups: getListingButtonGroups(l),
  });

export const reinitializeInteractiveListingMessages = async () => {
  const listings = cache.listings.value;
  if (!listings?.length) {
    return;
  }
  const listingsMap = new Map(listings.map((l) => [l.url, l]));
  const appID = await cache.discordAppID.requireValue();
  const channel = await getTextChannel("listings");

  let successCount = 0;

  const fetchAndProcessMessages = async (beforeId?: string) => {
    const messages = await channel.messages.fetch({
      limit: maxMessagesToFetchAtOnce,
      before: beforeId,
    });
    const firstMessageTime = messages.last()?.createdTimestamp;
    debugLog(
      `Setting up collector for ${messages.size} messages prior to ${
        !firstMessageTime ? "<invalid date>" : new Date(firstMessageTime)
      }`
    );

    messages.forEach((message) => {
      if (message.author.id !== appID) return;

      const url = message.embeds?.[0]?.url;
      if (!url) return;

      const l = listingsMap.get(url);
      if (!l) {
        debugLog(
          `Failed to reinitialize message ${message.id}: no cached listing`
        );
        return;
      }
      try {
        initializeInteractiveMessage({
          message,
          buttonGroups: getListingButtonGroups(l),
        });
        successCount++;
      } catch (e) {
        log(
          `Error while setting up collector for message ${message.id} for listing ${l.url}:`,
          { error: true }
        );
        log(e);
      }
    });

    if (messages.size === maxMessagesToFetchAtOnce) {
      const lastMessageId = messages.lastKey();
      await fetchAndProcessMessages(lastMessageId);
    } else {
      log(`Done reinitializing ${successCount} interactive listing messages`);
    }
  };
  return fetchAndProcessMessages();
};
