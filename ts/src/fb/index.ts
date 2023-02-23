import { WebDriver } from "selenium-webdriver";
import { log, waitSeconds } from "../util/misc.js";
import { isOnHomepage, login, visitFacebook } from "./util/index.js";
import { scrapeItems, visitMarketplace } from "./util/marketplace.js";

import { elementShouldExist, saveCookies } from "../util/selenium.js";

export const fbPre = async (driver: WebDriver) => {
  await visitFacebook(driver);
  if ((await isOnHomepage(driver)) === false) {
    await login(driver);
  }
};

export const fbMain = async (driver: WebDriver) => {
  const url = await visitMarketplace(driver);
  log(url);
  saveCookies(driver, ["c_user", "xs"]);
  await elementShouldExist("css", '[aria-label="Search Marketplace"]', driver);
  await waitSeconds(Math.random() * 1 + 1);
  return await scrapeItems(driver);
};
