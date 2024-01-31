import { tmpDir } from "constants.js";
import fs from "fs";
import {
  getKijijiRSS,
  getListings,
  visitKijijiListing,
} from "platforms/kijiji/ingest.js";
import { Platform } from "types/platform.js";
import { log } from "util/log.js";

let rss: string | undefined;
const cache = `${tmpDir}/kijiji-rss-url`;

const kijiji: Platform = {
  name: "Kijiji",
  icon: "https://www.kijiji.ca/favicon.ico",
  prepare: async (driver, configChanged) => {
    let cached;
    if (fs.existsSync(cache)) {
      cached = fs.readFileSync(cache, "utf-8");
    }
    if (!configChanged && cached) {
      log("Using cached Kijiji RSS feed");
      rss = cached;
      return;
    }

    log("Building new Kijiji RSS feed");
    rss = await getKijijiRSS(driver);
    log(`New RSS feed: ${rss}`);
    await fs.promises.writeFile(cache, rss);
  },
  main: async () => {
    if (!rss) throw new Error("No RSS feed found");
    log(`Kijiji RSS feed URL: ${rss}`);
    return await getListings(rss);
  },
  perListing: visitKijijiListing,
};

export default kijiji;
