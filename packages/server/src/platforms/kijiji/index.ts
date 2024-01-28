import fs from "fs";
import { tmpDir } from "constants.js";
import { Platform } from "types/platform.js";
import { log } from "util/log.js";
import {
  getKijijiRSS,
  visitKijijiListing,
  scrapeItems,
} from "platforms/kijiji/ingest.js";

let rssURL: string | undefined;

const kijiji: Platform = {
  key: "kijiji",
  pre: async (driver, configChanged) => {
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
      rssURL = await getKijijiRSS(driver);
      log(`New RSS feed URL: ${rssURL}`);
      await fs.promises.writeFile(`${tmpDir}/kijiji-rss-url`, rssURL);
    }
  },
  main: async () => {
    if (!rssURL) throw new Error("No RSS feed found");
    log(`Kijiji RSS feed URL: ${rssURL}`);
    return await scrapeItems(rssURL);
  },
  perItem: visitKijijiListing,
};

export default kijiji;
