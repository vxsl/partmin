import Discord from "discord.js";
import {
  maxEmbedLength,
  maxFieldLength,
  maxMessagesToFetchAtOnce,
} from "discord/constants.js";
import {
  RichSendOptions,
  componentGroup,
  constructAndSendRichMessage,
  startInteractive,
} from "discord/interactive/index.js";
import listingEmbed, { colors } from "discord/interactive/listing/embed.js";
import { getTextChannel } from "discord/util.js";
import { Listing } from "listing.js";
import persistent from "persistent.js";
import { ResolvedSearch, getSearchPersistent, getSearches } from "search.js";
import { debugLog, log, verboseLog } from "util/log.js";
import { discordFormat, splitString } from "util/string.js";

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
  componentGroup<{ toggled: boolean }>({
    initState: ({ getButton }) => ({
      toggled: getButton(ids.desc).data.style === Discord.ButtonStyle.Primary,
    }),
    buttons: {
      [ids.desc]: {
        label: "📄",
        mutate: async ({
          state,
          componentOrder,
          apply,
          getButton,
          getEmbed,
        }) => {
          const desc = l.details.longDescription;
          if (desc === undefined) {
            return { state, componentOrder };
          }
          const button = getButton(ids.desc);
          const embed = getEmbed(0);
          if (!embed) {
            log("No embed found for descriptionToggle", { error: true });
            return { state, componentOrder };
          }

          embed.setColor(colors.interacted);
          button?.setDisabled(true);
          await apply();

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
          return {
            state: { ...state, toggled: !state.toggled },
            componentOrder,
          };
        },
      },
    },
  });

const imageCycle = (l: Listing) =>
  componentGroup<{ index: number }>({
    initState: ({ getButton }) => {
      const imgLabel = getButton(ids.img).data.label;
      let index = 0;
      if (imgLabel) {
        const match = imgLabel.match(/(\d+) \/ \d+/);
        if (match?.[1]) {
          index = parseInt(match[1], 10) - 1;
        }
      }
      return { index };
    },
    buttons: {
      [ids.prevImg]: {
        label: "⬅",
        mutate: ({ state, getButton, getEmbed, componentOrder }) => {
          const embed = getEmbed(0);
          embed.setColor(colors.interacted);
          const len = l.imgURLs.length;
          state.index = (state.index - 1 + len) % len;
          const url = l.imgURLs[state.index];
          if (url) {
            embed.setImage(url);
          }
          getButton(ids.img).setLabel(`${state.index + 1} / ${len}`);
          return { state, componentOrder };
        },
      },
      [ids.img]: { label: `️1 / ${l.imgURLs.length}` },
      [ids.nextImg]: {
        label: "➡",
        mutate: ({ state, getButton, getEmbed, componentOrder }) => {
          const embed = getEmbed(0);
          embed.setColor(colors.interacted);
          const len = l.imgURLs.length;
          state.index = (state.index + 1) % len;
          const url = l.imgURLs[state.index];
          if (url) {
            embed.setImage(url);
          }
          getButton(ids.img).setLabel(`${state.index + 1} / ${len}`);
          return { state, componentOrder };
        },
      },
    },
  });

// Returns undefined rather than an empty object when there's nothing to
// interact with: a single image has nothing to cycle through and no description
// has nothing to toggle. An empty set of groups would still ask Discord for an
// action row, and Discord rejects rows containing no components.
const getListingButtons = (l: Listing) => {
  const defs = {
    ...(l.imgURLs.length > 1 && { imageCycle: imageCycle(l) }),
    ...(l.details.longDescription && {
      descriptionToggle: descriptionToggle(l),
    }),
  };
  return Object.keys(defs).length ? defs : undefined;
};

export const sendListing = async (
  l: Listing,
  options?: Pick<RichSendOptions, "channel" | "customSendFn">
) =>
  constructAndSendRichMessage({
    ...options,
    initComponentOrder: [[ids.prevImg, ids.img, ids.nextImg, ids.desc]],
    embeds: [(await listingEmbed(l)).data],
    componentGroupDefs: getListingButtons(l),
  });

const reinitializeSearchListingMessages = async (search: ResolvedSearch) => {
  const listings = await getSearchPersistent(search).listings.value();
  if (!listings?.length) {
    return;
  }
  const listingsMap = new Map(listings.map((l) => [l.url, l]));
  const appID = await persistent.discordAppID.requireValue();
  const channel = await getTextChannel(search.channelKey);

  let successCount = 0;

  const fetchAndProcessMessages = async (beforeId?: string) => {
    const messages = await channel.messages.fetch({
      limit: maxMessagesToFetchAtOnce,
      before: beforeId,
    });
    const firstMessageTime = messages.last()?.createdTimestamp;
    debugLog(
      `Checking ${messages.size} messages prior to ${
        !firstMessageTime ? "<invalid date>" : new Date(firstMessageTime)
      } for interactive listings to reinitialize...`
    );

    messages.forEach((message) => {
      if (message.author.id !== appID) return;

      const url = message.embeds?.[0]?.url;
      if (!url) return;

      const l = listingsMap.get(url);
      if (!l) {
        verboseLog(
          `Failed to reinitialize message ${message.id}: no cached listing`
        );
        return;
      }
      const componentGroupDefs = getListingButtons(l);
      if (!componentGroupDefs) {
        // nothing interactive was ever attached to this listing
        return;
      }
      try {
        startInteractive({
          message,
          componentGroupDefs,
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
      log(
        successCount
          ? `Reinitialized ${successCount} interactive listing messages in ${channel.name}`
          : `No interactive listing messages to reinitialize in ${channel.name}`
      );
    }
  };
  return fetchAndProcessMessages();
};

export const reinitializeInteractiveListingMessages = async () => {
  for (const search of await getSearches()) {
    await reinitializeSearchListingMessages(search);
  }
};
