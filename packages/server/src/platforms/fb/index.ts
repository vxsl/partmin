import {
  scrapeItems,
  visitMarketplace,
  visitMarketplaceListing,
} from "platforms/fb/ingest.js";
import { decodeMapDevelopersURL } from "util/geo.js";
import { randomWait } from "util/misc.js";
import { debugLog } from "util/log.js";
import { Item } from "item.js";
import { Platform } from "types/platform.js";
import { withDOMChangesBlocked } from "util/selenium.js";
import config from "config.js";

const fb: Platform = {
  key: "fb",
  main: async (driver) => {
    const items: Item[] = [];
    const radii = decodeMapDevelopersURL(
      config.search.location.mapDevelopersURL
    );
    for (let i = 0; i < radii.length; i++) {
      const r = radii[i];
      debugLog(`visiting fb marketplace for radius ${i} (${r.toString()})`);
      await visitMarketplace(driver, r);
      await withDOMChangesBlocked(driver, async () => {
        await scrapeItems(driver).then((arr) => items.push(...(arr ?? [])));
      });
      await randomWait({ short: true, suppressLog: true });
    }
    return items;
  },
  perItem: visitMarketplaceListing,
};

export default fb;
