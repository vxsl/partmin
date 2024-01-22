import { WebDriver } from "selenium-webdriver";
import { discordEmbed } from "./notifications/discord/index.js";
import { Item } from "./process.js";
import { waitSeconds } from "./util/misc.js";

export const notify = async (driver: WebDriver, items: Item[]) => {
  for (const item of items) {
    await discordEmbed(driver, item);
    await waitSeconds(0.5);
  }
};
