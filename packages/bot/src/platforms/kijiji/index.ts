import { kijijiCache } from "platforms/kijiji/cache.js";
import {
  rentalCategory,
  rentalCategoryRSS,
} from "platforms/kijiji/constants.js";
import {
  getKijijiRSS,
  getListings,
  visitKijijiListing,
} from "platforms/kijiji/ingest.js";
import { Platform } from "types/platform.js";
import { log } from "util/log.js";

const kijiji: Platform = {
  name: "Kijiji",
  icon: "https://www.kijiji.ca/favicon.ico",
  onSearchParamsChanged: async (driver) => {
    log("Building new Kijiji RSS feed");
    await getKijijiRSS(driver).then((rss) => {
      log(`Kijiji RSS feed: ${rss}`);
      log(`(search URL: ${rss.replace(rentalCategoryRSS, rentalCategory)})`);
      kijijiCache.rss.writeValue(rss);
    });
  },
  main: getListings,
  perListing: visitKijijiListing,
};

export default kijiji;
