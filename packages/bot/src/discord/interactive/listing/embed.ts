import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { ColorResolvable, EmbedBuilder } from "discord.js";

import { Listing, ensureLocationLink, getCommuteOrigin } from "listing.js";
import { platforms } from "types/platform.js";
import { getUserConfig } from "util/config.js";
import {
  Coordinates,
  formatCommuteSummaryMD,
  getGoogleMapsLink,
  trimAddress,
} from "util/geo.js";
import { notUndefined } from "util/misc.js";
import { discordFormat } from "util/string.js";

export const colors = {
  uninteracted: "#7289da" as ColorResolvable,
  interacted: "#424549" as ColorResolvable,
};

dayjs.extend(relativeTime);

const listingEmbed = async (l: Listing) => {
  await ensureLocationLink(l);
  const location =
    l.computed?.locationLinkText && l.computed?.locationLinkURL
      ? discordFormat(
          `${l.computed.locationLinkText}${
            l.computed?.locationLinkIsApproximate
              ? discordFormat(" (approx.)", { bold: true })
              : ""
          }`,
          { link: l.computed.locationLinkURL }
        )
      : l.details.shortAddress
      ? discordFormat(l.details.shortAddress, {
          link: getGoogleMapsLink(l.details.shortAddress),
        })
      : l.details.coords
      ? discordFormat(Coordinates.toString(l.details.coords), {
          link: getGoogleMapsLink(Coordinates.toString(l.details.coords)),
        })
      : undefined;

  const config = await getUserConfig();

  const commuteOrigin = getCommuteOrigin(l);
  const commutes = await Promise.all(
    (config.search.location?.commuteDestinations ?? []).map(async (d) => {
      const summ = l.computed?.commuteDestinations?.[d];
      if (!summ || !commuteOrigin) {
        return "";
      }
      return [formatCommuteSummaryMD(summ, commuteOrigin, d)]
        .filter(notUndefined)
        .join("\n");
    })
  ).then((arr) => arr.join("\n\n") ?? "");

  let descriptionHeader = [
    discordFormat(
      `${
        l.details.price === undefined
          ? undefined
          : l.details.price
          ? `💸 $${parseFloat(`${l.details.price}`).toFixed(2)}`
          : `Free`
      }`,
      { bold: true }
    ),
    `${dayjs.unix(l.details.date).fromNow()}`,
  ]
    .filter(notUndefined)
    .join(" - ");

  let locationSummary = [commutes, location ? `📍${location}` : undefined]
    .filter(notUndefined)
    .join("‎    ‎");

  return new EmbedBuilder()
    .setColor(colors.uninteracted)
    .setTitle(l.details.title ?? null)
    .setDescription(
      [
        descriptionHeader,
        locationSummary,
        l.computed?.bulletPoints
          ?.map((p) => {
            const prefix = `- `;
            let result = "";
            if (typeof p === "string") {
              result = p;
            } else {
              const v = `${p.value}`.toLowerCase();
              result = `${
                v === "yes"
                  ? `✅ ${p.key}`
                  : v === "no"
                  ? `❌ ${p.key}`
                  : `${p.key}: ${p.value}`
              }`;
            }
            return `${prefix}${discordFormat(result, { italic: true })}`;
          })
          .join("\n") ?? "",
      ]
        .filter(Boolean)
        .join("\n")
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

export default listingEmbed;
