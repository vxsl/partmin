import { ColorResolvable, EmbedBuilder } from "discord.js";

import { discordFormat } from "discord/util.js";
import { Listing, getCommuteOrigin } from "listing.js";
import { platforms } from "types/platform.js";
import { trimAddress } from "util/data.js";
import {
  Coordinates,
  formatCommuteSummaryMD,
  getGoogleMapsLink,
} from "util/geo.js";
import { notUndefined } from "util/misc.js";

export const colors = {
  uninteracted: "#7289da" as ColorResolvable,
  interacted: "#424549" as ColorResolvable,
};

const listingEmbed = (l: Listing) => {
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
      : undefined,
  ]
    .filter(notUndefined)
    .join("‎   •   ‎");

  const dests = Object.keys(l.computed?.commuteDestinations ?? {});

  return new EmbedBuilder()
    .setColor(colors.uninteracted)
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

export default listingEmbed;
