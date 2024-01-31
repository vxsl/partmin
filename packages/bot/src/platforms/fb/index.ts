import {
  getListings,
  visitMarketplace,
  visitMarketplaceListing,
} from "platforms/fb/ingest.js";
import { decodeMapDevelopersURL } from "util/geo.js";
import { notUndefined, randomWait } from "util/misc.js";
import { debugLog } from "util/log.js";
import { Listing } from "listing.js";
import { Platform } from "types/platform.js";
import { withDOMChangesBlocked } from "util/selenium.js";
import config from "config.js";

const fb: Platform = {
  name: "Facebook Marketplace",
  icon: "https://www.facebook.com/favicon.ico",
  main: async (driver) => {
    const listings: Listing[] = [];
    const radii = decodeMapDevelopersURL(
      config.search.location.mapDevelopersURL
    );
    let listingCount = 0;
    for (let i = 0; i < radii.length; i++) {
      const r = radii[i];
      debugLog(`visiting fb marketplace for radius ${i} (${r.toString()})`);
      await visitMarketplace(driver, r);
      await withDOMChangesBlocked(driver, async () => {
        await getListings(driver).then((arr) =>
          listings.push(...(arr?.filter(notUndefined) ?? []))
        );
      });
      debugLog(
        `found ${
          listings.length - listingCount
        } listings in radius ${i} (${r.toString()})`
      );
      listingCount = listings.length;
      await randomWait({ short: true, suppressProgressLog: true });
    }
    return listings;
  },
  perListing: visitMarketplaceListing,
};

export default fb;
