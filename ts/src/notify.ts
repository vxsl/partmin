import { pushover } from "./util/pushover.js";
import { Item, Platform } from "./process.js";
import { waitSeconds } from "./util/misc.js";
import { WebDriver } from "selenium-webdriver";
import {
  sendEmbedToChannel,
  sendMessageToChannel,
} from "./notifications/discord/index.js";

export const notify = async (driver: WebDriver, items: Item[]) => {
  for (const item of items) {
    const {
      platform,
      id,
      url,
      details: { price, location, title },
      imgURL: imgUrl,
    } = item;

    await sendEmbedToChannel(driver, item);

    await waitSeconds(0.5);
  }
};
