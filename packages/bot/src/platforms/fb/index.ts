import {
  getListings,
  visitMarketplace,
  visitMarketplaceListing,
} from "platforms/fb/ingest.js";
import { decodeMapDevelopersURL } from "util/geo.js";
import { notUndefined, randomWait } from "util/misc.js";
import { debugLog, verboseLog } from "util/log.js";
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
      const rLabel = `radius ${i + 1}/${radii.length}`;
      debugLog(
        `visiting fb marketplace [${rLabel}]: ${r.toString({
          truncate: true,
        })}`
      );
      await visitMarketplace(driver, r);
      await withDOMChangesBlocked(driver, async () => {
        await getListings(driver).then((arr) => {
          verboseLog(
            `found the following listings in ${rLabel}: ${arr
              ?.map((l) => l.id)
              .join(", ")}`
          );
          listings.push(...(arr?.filter(notUndefined) ?? []));
        });
      });
      debugLog(
        `found ${
          listings.length - listingCount
        } listings in ${rLabel} (${r.toString({ truncate: true })})`
      );
      listingCount = listings.length;
      await randomWait({ short: true, suppressProgressLog: true });
    }
    return listings;
  },
  perListing: visitMarketplaceListing,
};

export default fb;
