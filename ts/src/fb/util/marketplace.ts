import { Item } from "process.js";
import { By, WebDriver, WebElement } from "selenium-webdriver";
import { Config } from "types/config.js";
import { Radius, getGoogleMapsLink } from "../../util/geo.js";
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
  withElement,
} from "../../util/selenium.js";
import { MP_ITEM_XPATH } from "./index.js";
import { findNestedProperty } from "../../util/data.js";

export const visitMarketplaceListing = async (
  driver: WebDriver,
  item: Item
) => {
  await clearBrowsingData(driver);

  let url = `https://facebook.com/marketplace/item/${item.id}`;
  debugLog(`fb: ${url}`);

  await driver.get(url);

  const infoStringified = await driver
    .findElements(
      By.xpath(`//script[contains(text(), "marketplace_product_details_page")]`)
    )
    .then((els) => els[0])
    .then((el) => el.getAttribute("innerHTML"));

  const productDetails = findNestedProperty(
    infoStringified,
    "marketplace_product_details_page"
  );

  if (!productDetails) {
    // TODO do something else.

    // // if there's a <span> with text "See more", click it:
    // await driver
    //   .findElements(By.xpath(`//span[(text()="See more")]`))
    //   .then(async (els) => {
    //     if (els.length) {
    //       await click(els[0]);
    //     }
    //   });
    return;
  }

  try {
    const desc = productDetails.target.redacted_description.text;
    if (desc) {
      item.details.longDescription = desc;
    }
  } catch {
    // TODO
  }

  try {
    const loc = productDetails.target.home_address.street;
    if (loc) {
      item.details.location = loc;
      const full =
        productDetails.target.pdp_display_sections
          .find((s: any) => s.section_type === "UNIT_SUBTITLE")
          .then((s: any) =>
            s.pdp_fields.find((f: any) => f.icon_name === "pin")
          )?.display_label ?? "";
      item.computed = {
        ...(item.computed ?? {}),
        locationLinkMD: `[**${loc}**](${getGoogleMapsLink(
          full.length > loc.length ? full : loc
        )})`,
      };
    }
  } catch {
    // TODO
  }

  try {
    const lat = productDetails.target.location.latitude;
    const lon = productDetails.target.location.longitude;
    if (lat && lon) {
      item.details.lat = lat;
      item.details.lon = lon;
    }
  } catch {
    // TODO
  }

  try {
    const imgs = productDetails.target.listing_photos
      .map((p: any) => p?.image?.uri ?? undefined)
      .filter(notUndefined);
    if (imgs.length) {
      item.imgURLs = imgs;
    }
  } catch {
    // TODO
  }

  try {
    const points: string[] = productDetails.target.pdp_display_sections
      .find((s: any) => s.section_type === "UNIT_SUBTITLE")
      ?.pdp_fields.filter((f: any) => f.icon_name !== "pin")
      .map(({ display_label }: { display_label: string }) =>
        display_label.includes("Available ")
          ? display_label.match(/Available (.+)/)?.[0] ?? display_label
          : display_label.includes("Listed")
          ? undefined
          : display_label
      )
      .filter(notUndefined);
    item.computed = {
      ...(item.computed ?? {}),
      bulletPoints: points,
    };
  } catch {
    // TODO
  }
};

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

          const primaryImg = await withElement(
            () => driver.findElement(By.css("img")),
            (e) => e.getAttribute("src")
          );

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
          const title = tokens.slice(1, tokens.length - 1).join(SEP);

          const result: Item = {
            platform: "fb",
            id,
            details: {
              title,
              price,
            },
            url: `https://facebook.com/marketplace/item/${id}`,
            imgURLs: [primaryImg].filter(notUndefined),
          };
          return result;
        });
      })
    )
  ).filter(notUndefined);
};
