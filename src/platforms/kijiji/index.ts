import fs from "fs";
import { tmpDir } from "constants.js";
import { Platform } from "types/platform.js";
import { log } from "util/misc.js";
import {
  getKijijiRSS,
  visitKijijiListing,
  scrapeItems,
} from "platforms/kijiji/util/index.js";

let rssURL: string | undefined;

const kijiji: Platform = {
  key: "kijiji",
  main: async (config, driver) => {
    if (!rssURL) throw new Error("No RSS feed found");
    log(`Kijiji RSS feed URL: ${rssURL}`);
    return await scrapeItems(config, rssURL);
  },
  pre: async (config, driver, configChanged) => {
    try {
      if (!configChanged) {
        rssURL = await fs.promises.readFile(
          `${tmpDir}/kijiji-rss-url`,
          "utf-8"
        );
      }
    } catch {}
    if (!rssURL) {
      log("No cached RSS feed found, fetching new one");
      rssURL = await getKijijiRSS(config, driver);
      log(`New RSS feed URL: ${rssURL}`);
      await fs.promises.writeFile(`${tmpDir}/kijiji-rss-url`, rssURL);
    }
  },
  perItem: async (config, driver, item) => {
    await visitKijijiListing(config, driver, item);
  },
};

export default kijiji;
