import { WebDriver } from "selenium-webdriver";
import { log, waitSeconds } from "../util/misc.js";
import { scrapeItems, visitMarketplace } from "./util/marketplace.js";

import { elementShouldExist, saveCookies } from "../util/selenium.js";
import { Config } from "types/config.js";

export const fbMain = async (config: Config, driver: WebDriver) => {
  const url = await visitMarketplace(config, driver);
  log(url);
  saveCookies(driver, ["c_user", "xs"]);
  await elementShouldExist("css", '[aria-label="Search Marketplace"]', driver);
  await waitSeconds(Math.random() * 1 + 1);
  return await scrapeItems(driver);
};
