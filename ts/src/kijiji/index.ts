import { WebDriver } from "selenium-webdriver";
import { Config } from "types/config.js";
import { getKijijiRSS, scrapeItems } from "./util/index.js";

let rssURL: string | undefined;

export const kijijiPre = async (config: Config, driver: WebDriver) => {
  rssURL = await getKijijiRSS(config, driver);
};

export const kijijiMain = async (config: Config, driver: WebDriver) => {
  if (!rssURL) throw new Error("No RSS feed found");
  return await scrapeItems(rssURL);
};
