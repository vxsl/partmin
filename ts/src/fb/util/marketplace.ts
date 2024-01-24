import { Item } from "process.js";
import { By, WebDriver, WebElement } from "selenium-webdriver";
import { Config } from "types/config.js";
import { Radius } from "../../util/geo.js";
import {
  debugLog,
  discordLog,
  notUndefined,
  waitSeconds,
} from "../../util/misc.js";
import {
  clearBrowsingData,
  click,
  elementShouldExist,
} from "../../util/selenium.js";
import { MP_ITEM_XPATH } from "./index.js";

export const visitMarketplace = async (
  config: Config,
  driver: WebDriver,
  radius: Radius,
  tries: number = 0
) => {
  await clearBrowsingData(driver);

  const vals = {
    sortBy: "creation_time_descend",
    exact: true,
    // propertyType: config.search.propertyType,
    minPrice: config.search.price.min,
    maxPrice: config.search.price.max,
    // minBedrooms: config.search.bedrooms.min,

    // minAreaSize: config.search.minArea
    //   ? Math.floor(config.search.minArea * 0.09290304 * 100) / 100
    //   : undefined,

    latitude: radius.lat,
    longitude: radius.lon,
    radius:
      radius.diam +
      Math.random() * 0.00000001 +
      Math.random() * 0.0000001 +
      Math.random() * 0.000001 +
      Math.random() * 0.00001,
  };

  const city = config.search.location.city;
  let url = `https://facebook.com/marketplace/${city}/propertyrentals?`;
  for (const [k, v] of Object.entries(vals)) {
    if (v) {
      url += `${k}=${v}&`;
    }
  }
  debugLog(`fb: ${url}`);

  await driver.get(url);

  await driver.wait(async () => {
    const state = (await driver.executeScript(
      "return document.readyState"
    )) as string;
    return state === "complete";
  });

  await driver.sleep(2000);

  // ensure facebook didn't ignore our requested radius:
  // TODO ensure lat and lon as well?
  const urlRadius = await driver
    .getCurrentUrl()
    .then((url) => url.match(/radius=([^&]+)/)?.[1])
    .then((r) => parseFloat(r ?? "0"));
  if (urlRadius === undefined) {
    throw new Error("Could not find radius in url");
  }
  const minRadius = radius.diam * 0.9;
  const maxRadius = radius.diam * 1.1;
  if (urlRadius < minRadius || urlRadius > maxRadius) {
    const maxTries = 3;
    if (++tries < maxTries) {
      visitMarketplace(config, driver, radius, tries);
    } else {
      discordLog(
        `Facebook Marketplace is misbehaving by refusing to correctly load ${url}.`
      );
    }
  }
};

export const scrapeItems = async (
  driver: WebDriver
): Promise<Item[] | undefined> => {
  await elementShouldExist("css", '[aria-label="Search Marketplace"]', driver);

  let els: WebElement[] = [];
  for (let i = 0; i < 10; i++) {
    els = await driver.findElements(By.xpath(MP_ITEM_XPATH));
    if (els.length) break;
    await waitSeconds(1);
  }
  if (!els.length) return undefined;
  return (
    await Promise.all(
      els.map((e) => {
        return e.getAttribute("href").then(async (href) => {
          const id = href.match(/\d+/)?.[0];
          if (!id) {
            debugLog(`No id found for element with href ${href}`);
            return;
          }

          const primaryImg = await e
            .findElement(By.css("img"))
            .then((img) => img.getAttribute("src"));

          const SEP = " - ";
          const text = await e
            .getText()
            .then((t) =>
              t.replace("\n", SEP).replace(/^C\$+/, "").replace("\n", SEP)
            );
          const tokens = text.split(SEP);
          const price =
            tokens[0] !== undefined
              ? parseInt(tokens[0].replace(",", ""))
              : undefined;
          const location = tokens[tokens.length - 1];
          const title = tokens.slice(1, tokens.length - 1).join(SEP);

          const result: Item = {
            platform: "fb",
            id,
            details: {
              title,
              price,
              location,
            },
            url: `https://facebook.com/marketplace/item/${id}`,
            imgURLs: [primaryImg],
          };
          return result;
        });
      })
    )
  ).filter(notUndefined);
};
