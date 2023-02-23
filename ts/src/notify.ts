import { pushover } from "./util/pushover.js";
import { Item } from "./process.js";
import { waitSeconds } from "./util/misc.js";

export const notify = async (items: Item[]) =>
  items.forEach(async (item) => {
    const {
      platform,
      id,
      url,
      details: { price, location, title },
    } = item;
    await pushover(
      {
        url,
        title: `${price} - ${location}`,
        message: title ?? url,
      },
      `${platform}-${id}.jpg`
    );
    await waitSeconds(0.5);
  });
