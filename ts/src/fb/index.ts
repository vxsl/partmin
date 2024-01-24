import { WebDriver } from "selenium-webdriver";
import { decodeMapDevelopersURL } from "../util/geo.js";
import { debugLog, waitSeconds } from "../util/misc.js";
import { scrapeItems, visitMarketplace } from "./util/marketplace.js";

import { Config } from "types/config.js";
import { Item } from "../process.js";

export const fbMain = async (config: Config, driver: WebDriver) => {
  const items: Item[] = [];
  const radii = decodeMapDevelopersURL(config.search.location.mapDevelopersURL);
  for (const r of radii) {
    debugLog(`visiting fb marketplace for radius ${JSON.stringify(r)}`);
    await visitMarketplace(config, driver, r);
    await scrapeItems(driver).then((arr) => items.push(...(arr ?? [])));
    await waitSeconds(Math.random() * 3 + 1);
  }
  return items;
};
