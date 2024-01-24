import fs from "fs";
import { WebDriver } from "selenium-webdriver";
import { Config } from "types/config.js";
import { tmpDir } from "../constants.js";
import { getKijijiRSS, scrapeItems } from "./util/index.js";

let rssURL: string | undefined;

export const kijijiPre = async (config: Config, driver: WebDriver) => {
  try {
    rssURL = await fs.promises.readFile(`${tmpDir}/kijiji-rss-url`, "utf-8");
  } catch {}
  if (!rssURL) {
    rssURL = await getKijijiRSS(config, driver);
    await fs.promises.writeFile(`${tmpDir}/kijiji-rss-url`, rssURL);
  }
};

export const kijijiMain = async (config: Config, driver: WebDriver) => {
  if (!rssURL) throw new Error("No RSS feed found");
  return await scrapeItems(config, rssURL);
};
