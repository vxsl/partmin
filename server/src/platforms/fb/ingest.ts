import { Item } from "item.js";
import { PlatformKey } from "types/platform.js";
import { By, WebDriver, WebElement } from "selenium-webdriver";
import config from "config.js";
import { findNestedProperty } from "util/data.js";
import { Radius, getGoogleMapsLink } from "util/geo.js";
import { notUndefined } from "util/misc.js";
import { debugLog, discordLog, log } from "util/log.js";
import {
  clearBrowsingData,
  elementShouldExist,
  withElement,
  withElementsByXpath,
} from "util/selenium.js";
import { fbItemXpath } from "platforms/fb/constants.js";

const platform: PlatformKey = "fb";

export const visitMarketplaceListing = async (
  driver: WebDriver,
  item: Item
) => {
  await clearBrowsingData(driver);

  let url = `https://facebook.com/marketplace/item/${item.id}`;
  debugLog(url);

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
    discordLog(
      `Warning: couldn't find marketplace_product_details_page for ${url}.`
    );
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
  } catch (e) {
    log(e);
    // TODO
  }

  try {
    const loc = productDetails.target.home_address.street;
    if (loc) {
      item.details.shortAddress = loc;
      const full =
        productDetails.target.pdp_display_sections
          .find((s: any) => s.section_type === "UNIT_SUBTITLE")
          .pdp_fields.find((f: any) => f.icon_name === "pin")?.display_label ??
        "";
      item.computed = {
        ...(item.computed ?? {}),
        locationLinkMD: `[**${loc}**](${getGoogleMapsLink(
          full.length > loc.length ? full : loc
        )})`,
      };
    }
  } catch (e) {
    log(e);
    // TODO
  }

  try {
    const lat = productDetails.target.location.latitude;
    const lon = productDetails.target.location.longitude;
    if (lat && lon) {
      item.details.lat = lat;
      item.details.lon = lon;
    }
  } catch (e) {
    log(e);
    // TODO
  }

  try {
    const imgs = productDetails.target.listing_photos
      .map((p: any) => p?.image?.uri)
      .filter(notUndefined);
    if (imgs.length) {
      item.imgURLs = imgs;
    }
  } catch (e) {
    log(e);
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
  } catch (e) {
    log(e);
    // TODO
  }
};

export const visitMarketplace = async (
  driver: WebDriver,
  radius: Radius,
  tries: number = 0
) => {
  await clearBrowsingData(driver);

  const vals = {
    sortBy: "creation_time_descend",
    exact: true,
    // propertyType: config.search.propertyType,
    ...(config.search.params.roommateNotAccepted && {
      propertyType: ["house", "townhouse", "apartment-condo"].join(","),
    }),
    minPrice: config.search.params.price.min,
    maxPrice: config.search.params.price.max,
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
    if (v !== undefined && v !== null) {
      url += `${k}=${v}&`;
    }
  }
  debugLog(url);

  await driver.get(url);

  await driver.wait(async () => {
    const state = (await driver.executeScript(
      "return document.readyState"
    )) as string;
    return state === "complete";
  });

  await elementShouldExist("xpath", fbItemXpath, driver);

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
      visitMarketplace(driver, radius, tries);
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
  return await withElementsByXpath(
    driver,
    fbItemXpath,
    async (e: WebElement): Promise<Item | undefined> => {
      const href = await e.getAttribute("href");
      const id = href.match(/\d+/)?.[0];

      if (!id) {
        log(`Unable to parse item ID from ${href}`);
        return undefined;
      }

      const thumb = await withElement(
        () => e.findElement(By.css("img")),
        (img) => img.getAttribute("src")
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

      // sometimes facebook will show a private room for rent
      // even when the search parameters exclude "room only":
      if (
        config.search.params.roommateNotAccepted &&
        ["Private room for rent", "Chambre privée à louer"].includes(title)
      ) {
        log(`Skipping room-only listing: ${title} (${id})`);
        return undefined;
      }

      return {
        platform,
        id,
        details: {
          title,
          price,
        },
        url: `https://facebook.com/marketplace/item/${id}`,
        imgURLs: [thumb].filter(notUndefined),
        videoURLs: [],
      };
    }
  );
};
