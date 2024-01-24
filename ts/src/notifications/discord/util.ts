import { Item, Platform } from "../../process.js";
import Discord from "discord.js";

const platformIcons: Record<Platform, string> = {
  kijiji: "https://www.kijiji.ca/favicon.ico",
  fb: "https://www.facebook.com/favicon.ico",
};

export const convertItemToDiscordEmbed = (item: Item) =>
  new Discord.EmbedBuilder()
    .setTitle(item.details.title ?? null)
    .setDescription(
      `- ${item.details.price ? `$${item.details.price}` : ""}\n- ${
        item.details.location
      }`
    )
    .setURL(item.url)
    .setImage(item.imgUrl ?? null)
    .setFooter({
      text: item.platform,
      iconURL: platformIcons[item.platform],
    })
    .setTimestamp(new Date());

export const attachVideosToEmbed = (
  embed: Discord.EmbedBuilder,
  imgUrls: string[]
) => {
  const videos = imgUrls
    .filter((src) => src.startsWith("http://img.youtube"))
    .map((thumb) => {
      const match = thumb.match(/(?:\/vi\/|v=)([^&\/\?]+)/)?.[1];
      return match ? `https://youtu.be/${match}` : "[error]";
    });
  if (videos.length) {
    embed.addFields(
      videos.length > 1
        ? {
            name: `🎥 Video${videos.length > 1 ? "s" : ""}`,
            value: videos.join("\n"),
          }
        : {
            name: `🎥 Video: ${videos[0]}`,
            value: " ",
          }
    );
  }
};

export const buildPrevImgButton = () =>
  new Discord.ButtonBuilder()
    .setCustomId("prevImg")
    .setLabel("⬅")
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(true);
export const buildNextImgButton = () =>
  new Discord.ButtonBuilder()
    .setCustomId("nextImg")
    .setLabel(`➡`)
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(true);
