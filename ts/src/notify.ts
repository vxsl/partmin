import { pushover } from "./util/pushover.js";
import { Item, Platform } from "./process.js";
import { waitSeconds } from "./util/misc.js";
import {
  sendEmbedToChannel,
  sendMessageToChannel,
} from "./notifications/discord/index.js";

const platformIcons: Record<Platform, string> = {
  kijiji: "https://www.kijiji.ca/favicon.ico",
  fb: "https://www.facebook.com/favicon.ico",
};

export const notify = async (items: Item[]) => {
  for (const item of items) {
    // items.forEach(async (item) => {
    const {
      platform,
      id,
      url,
      details: { price, location, title },
      imgUrl,
    } = item;
    // await pushover(
    //   {
    //     url,
    //     title: `$${price} - ${location}`,
    //     message: title ?? url,
    //   },
    //   `${platform}-${id}.jpg`
    // );
    // await sendMessageToChannel(`$${price} - ${location}`, );
    // await sendMessageToChannel({
    //   // content: `$${price} - ${location}`,
    //   content: title,
    //   files: imagePaths,
    // });

    await sendEmbedToChannel(
      {
        title,
        description: `**${price ? `$${price}` : ""}\n${location}**`,
        url,
        author: { name: platform, icon_url: platformIcons[platform] },
        ...(imgUrl && { image: { url: imgUrl } }),
        timestamp: new Date().toISOString(),
      },
      {
        url,
        ...(imgUrl && {
          image: {
            url: "https://media.kijiji.ca/api/v1/ca-prod-fsbo-ads/images/dc/dca571ab-c032-4a9e-a8c2-361e46aa531b?rule=kijijica-640-webp",
          },
        }),
      }
    );

    process.exit(0);

    await waitSeconds(0.5);
    // });
  }
};
