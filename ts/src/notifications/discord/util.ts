import { notUndefined } from "../../util/misc.js";
import { Item, Platform } from "../../process.js";
import Discord from "discord.js";

const platformIcons: Record<Platform, string> = {
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
