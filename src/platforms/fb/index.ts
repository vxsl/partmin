import {
  scrapeItems,
  visitMarketplace,
  visitMarketplaceListing,
} from "platforms/fb/util/marketplace.js";
import { decodeMapDevelopersURL } from "util/geo.js";
import { debugLog, randomWait } from "util/misc.js";
import { Item } from "types/item.js";
import { Platform } from "types/platform.js";
import { withDOMChangesBlocked } from "util/selenium.js";

const fb: Platform = {
  key: "fb",
  main: async (config, driver) => {
    const items: Item[] = [];
    const radii = decodeMapDevelopersURL(
      config.search.location.mapDevelopersURL
    );
    for (const r of radii) {
      debugLog(`visiting fb marketplace for radius ${JSON.stringify(r)}`);
      await visitMarketplace(config, driver, r);
      await withDOMChangesBlocked(driver, async () => {
        await scrapeItems(config, driver).then((arr) =>
          items.push(...(arr ?? []))
        );
      });
      await randomWait({ short: true, suppressLog: true });
    }
    return items;
  },
  perItem: async (_, driver, item) => {
    await visitMarketplaceListing(driver, item);
  },
};

export default fb;
