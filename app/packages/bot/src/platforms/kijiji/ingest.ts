import config from "config.js";
import he from "he";
import { baseURL } from "platforms/kijiji/constants.js";
import { setFilters } from "platforms/kijiji/util.js";
import { kijijiGet } from "platforms/kijiji/util.js";
import Parser from "rss-parser";
import { By, WebDriver, until } from "selenium-webdriver";
import { Item } from "item.js";
import { PlatformKey } from "types/platform.js";
import { trimAddress } from "util/data.js";
import { getGoogleMapsLink } from "util/geo.js";
import { notUndefined, waitSeconds } from "util/misc.js";
import { debugLog, log } from "util/log.js";
import { manualClear, clickByXPath, type } from "util/selenium.js";

const parser = new Parser({
  customFields: {
    item: [
      ["g-core:price", "price"],
      ["geo:lat", "lat"],
      ["geo:long", "lon"],
    ],
  },
});

export const visitKijijiListing = async (driver: WebDriver, item: Item) => {
  await kijijiGet(item.url, driver);
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
      item.imgURLs = imgs;
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
      item.videoURLs = vids;
    }
  } catch {
    // TODO
  }

  try {
    const loc = data.viewItemPage.viewItemData.adLocation.mapAddress;
    if (loc) {
      item.details.shortAddress = trimAddress(loc);
      item.details.longAddress = loc;
      item.computed = {
        ...(item.computed ?? {}),
        locationLinkMD: `[**${item.details.shortAddress}**](${getGoogleMapsLink(
          loc
        )})`,
      };
    }
  } catch {
    // TODO
  }
  item.details.longDescription = await driver
    .findElement(
      By.xpath(`//*[starts-with(@class, 'descriptionContainer')]//div`)
    )
    .getAttribute("innerText");
};

export const getKijijiRSS = async (driver: WebDriver) => {
  await kijijiGet(baseURL, driver);
  await clickByXPath(driver, `//header[1]//*[text() = 'Canada']`);

  await waitSeconds(2); // TODO don't arbitrary wait. Figure out the multiple renders of this element
  const el = await driver.findElement(
    By.xpath(`//div[@aria-modal='true']//input`)
  );
  await manualClear(el);
  await type(
    el,
    `${config.search.location.city}, ${config.search.location.region}`
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

  return await driver
    .findElement(By.xpath(`//div[@data-testid="srp-rss-feed-button"]//a`))
    .then((el) => el.getAttribute("href"));
};

export const scrapeItems = (rssUrl: string): Promise<Item[]> =>
  parser.parseURL(rssUrl).then((output) =>
    output.items.reduce((acc, item) => {
      const url = item.link;
      const id = url?.split("/").pop();
      if (!url || !id) {
        log(`No URL or ID found for item: ${JSON.stringify(item)}`);
        return acc;
      }
      const result: Item = {
        platform: "kijiji" as PlatformKey,
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
    }, [] as Item[])
  );