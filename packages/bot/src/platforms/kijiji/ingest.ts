import config from "config.js";
import he from "he";
import { Listing, addBulletPoints, invalidateListing } from "listing.js";
import { baseURL } from "platforms/kijiji/constants.js";
import { kijijiGet, setFilters } from "platforms/kijiji/util.js";
import Parser from "rss-parser";
import { By, WebDriver, until } from "selenium-webdriver";
import { trimAddress } from "util/data.js";
import { getGoogleMapsLink } from "util/geo.js";
import { debugLog, log } from "util/log.js";
import { notUndefined, waitSeconds } from "util/misc.js";
import { clickByXPath, manualClear, type, withElement } from "util/selenium.js";

const parser = new Parser({
  customFields: {
    item: [
      ["g-core:price", "price"],
      ["geo:lat", "lat"],
      ["geo:long", "lon"],
    ],
  },
});

export const visitKijijiListing = async (driver: WebDriver, l: Listing) => {
  await kijijiGet(l.url, driver);
  const data: any = await driver.executeScript("return window.__data;");
  if (!data || typeof data !== "object") {
    // TODO do something else.
    return;
  }

  try {
    const imgs = data.viewItemPage.viewItemData.media
      .map((p: any) => p?.href)
      .filter(notUndefined);
    if (imgs.length) {
      l.imgURLs = imgs;
    }
  } catch {
    // TODO
  }

  try {
    const vids = data.viewItemPage.viewItemData.media
      .filter((p: any) => p?.type === "video")
      .map((p: any) => p?.href)
      .filter(notUndefined);
    if (vids.length) {
      l.videoURLs = vids;
    }
  } catch {
    // TODO
  }

  try {
    const loc = data.viewItemPage.viewItemData.adLocation.mapAddress;
    if (loc) {
      l.details.shortAddress = trimAddress(loc);
      l.details.longAddress = loc;
      l.computed = {
        ...(l.computed ?? {}),
        locationLinkMD: `[**${l.details.shortAddress}**](${getGoogleMapsLink(
          loc
        )})`,
      };
    }
  } catch {
    // TODO
  }

  try {
    const attrs = data.viewItemPage.viewItemData.adAttributes.attributes.filter(
      (a: any) => ["yard", "balcony"].includes(a.machineKey)
    );
    if (!attrs.some((a) => a.machineValue === "1")) {
      invalidateListing(
        l,
        "unreliableParamsMismatch",
        "Doesn't explicity offer a yard or balcony"
      );
    } else {
      addBulletPoints(
        l,
        attrs
          .filter((a) => a.machineValue !== "0")
          .map((a) => ({
            key: a.localeSpecificValues.en.label,
            value: a.localeSpecificValues.en.value,
          }))
      );
    }
  } catch {
    // TODO
  }

  try {
    const attr = data.viewItemPage.viewItemData.adAttributes.attributes.find(
      (a: any) => a.machineKey === "numberparkingspots"
    );
    if (attr.machineValue === "0") {
      invalidateListing(
        l,
        "unreliableParamsMismatch",
        "Doesn't explicity offer parking"
      );
    } else {
      addBulletPoints(l, {
        key: attr.localeSpecificValues.en.label,
        value: attr.localeSpecificValues.en.value,
      });
    }
  } catch {
    // TODO
  }

  try {
    const attr = data.viewItemPage.viewItemData.adAttributes.attributes.find(
      (a: any) => a.machineKey === "areainfeet"
    );
    const n = parseInt(attr.machineValue);
    if (!isNaN(n) && attr.machineValue !== 0) {
      if (n < config.search.params.unreliableParams.minAreaSqFt) {
        invalidateListing(
          l,
          "unreliableParamsMismatch",
          `Area too small (${n} sq ft less than specified value of ${config.search.params.unreliableParams.minAreaSqFt})`
        );
      } else {
        addBulletPoints(l, {
          key: attr.localeSpecificValues.en.label,
          value: attr.localeSpecificValues.en.value,
        });
      }
    }
  } catch {
    // TODO
  }

  try {
    const attr = data.viewItemPage.viewItemData.adAttributes.attributes.find(
      (a: any) => a.machineKey === "petsallowed"
    );
    if (attr.machineValue === "0") {
      invalidateListing(l, "paramsMismatch", "Explicitly disallows pets");
    } else {
      addBulletPoints(l, {
        key: attr.localeSpecificValues.en.label,
        value: attr.localeSpecificValues.en.value,
      });
    }
  } catch {
    // TODO
  }

  l.details.longDescription = await driver
    .findElement(
      By.xpath(`//*[starts-with(@class, 'descriptionContainer')]//div`)
    )
    .getAttribute("innerText");
};

export const getKijijiRSS = async (driver: WebDriver) => {
  await kijijiGet(baseURL, driver);
  await clickByXPath(driver, `//header[1]//*[text() = 'Canada']`);

  await waitSeconds(2); // TODO don't arbitrary wait. Figure out the multiple renders of this element
  await withElement(
    () => driver.findElement(By.xpath(`//div[@aria-modal='true']//input`)),
    async (el) => {
      await manualClear(el);
      await type(
        el,
        `${config.search.location.city}, ${config.search.location.region}`
      );
    }
  );
  await waitSeconds(2); // TODO don't arbitrary wait.
  await clickByXPath(
    driver,
    `//div[@aria-modal='true']//li[not(contains(text(), 'current'))]`
  );
  await clickByXPath(driver, `//label[contains(text(), 'Search all of')]`);
  await waitSeconds(1);
  await clickByXPath(driver, `//button[@data-testid="set-location-button"]`);

  debugLog(`Waiting for URL to change`);
  await driver.wait(until.urlMatches(/^(?!.*canada).*$/));

  await setFilters(driver);

  log(`Kijiji results after applying filters: ${await driver.getCurrentUrl()}`);

  return await driver
    .findElement(By.xpath(`//div[@data-testid="srp-rss-feed-button"]//a`))
    .then((el) => el.getAttribute("href"));
};

export const getListings = (rssUrl: string): Promise<Listing[]> =>
  parser.parseURL(rssUrl).then((output) =>
    output.items.reduce((acc, item) => {
      const url = item.link;
      const id = url?.split("/").pop();
      if (!url || !id) {
        log(`No URL or ID found for item: ${JSON.stringify(item)}`);
        return acc;
      }
      const result: Listing = {
        platform: "kijiji",
        id,
        details: {
          title: item.title ? he.decode(item.title) : id,
          longDescription: item.contentSnippet,
          price: item.price,
          coords: {
            lat: item.lat,
            lon: item.lon,
          },
        },
        url,
        imgURLs: item.enclosure?.url ? [item.enclosure.url] : [],
        videoURLs: [],
      };
      acc.push(result);
      return acc;
    }, [] as Listing[])
  );
