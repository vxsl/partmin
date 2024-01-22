import he from "he";
import { Item, Platform } from "process.js";
import Parser from "rss-parser";
import { By, WebDriver, until } from "selenium-webdriver";
import { Config } from "types/config.js";
import { debugLog, notUndefined, waitSeconds } from "../../util/misc.js";
import { clearAlternate, clickByXPath, type } from "../../util/selenium.js";
import { baseURL } from "./constants.js";
import { setKijijiFilters } from "./filter-interactions.js";
import { getGoogleMapsLink, isWithinRadii } from "../../util/geo.js";
import { trimAddress } from "../../util/data.js";

const parser = new Parser({
  customFields: {
    item: [
      ["g-core:price", "price"],
      ["geo:lat", "lat"],
      ["geo:long", "lon"],
    ],
  },
});

export const kijijiGet = async (url: string, driver: WebDriver) => {
  await driver.get(url);
  const xpath = "//button[contains(@class, 'cookieBannerCloseButton')]";
  await driver
    .wait(until.elementLocated(By.xpath(xpath)), 1000)
    .then((el) => el && clickByXPath(driver, xpath))
    .catch((e) => {
      debugLog(e);
    });
};

export const visitKijijiListing = async (
  config: Config,
  driver: WebDriver,
  item: Item
) => {
  await kijijiGet(item.url, driver);
  // Object val = js.executeScript("return returnFoo();");
  const data: any = await driver.executeScript("return window.__data;");
  // console.log(JSON.stringify(obj));
  // process.exit();
  if (!data || typeof data !== "object") {
    // TODO do something else.
    return;
  }
  // viewItemPage.viewItemData.media

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
      item.details.location = trimAddress(config, loc);
      item.computed = {
        ...(item.computed ?? {}),
        locationLinkMD: `[**${item.details.location}**](${getGoogleMapsLink(
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

export const getKijijiRSS = async (config: Config, driver: WebDriver) => {
  await kijijiGet(baseURL, driver);
  await clickByXPath(driver, `//header[1]//*[text() = 'Canada']`);

  await waitSeconds(2); // TODO don't arbitrary wait. Figure out the multiple renders of this element
  const el = await driver.findElement(
    By.xpath(`//div[@aria-modal='true']//input`)
  );
  await clearAlternate(el);
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

  await driver.wait(until.urlMatches(/^(?!.*canada).*$/));

  await setKijijiFilters(driver, config);

  return await driver
    .findElement(By.xpath(`//div[@data-testid="srp-rss-feed-button"]//a`))
    .then((el) => el.getAttribute("href"));
};

export const scrapeItems = (config: Config, rssUrl: string): Promise<Item[]> =>
  parser.parseURL(rssUrl).then((output) =>
    output.items.reduce((acc, item) => {
      const url = item.link;
      const id = url?.split("/").pop();
      if (!url || !id || !isWithinRadii(item.lat, item.lon, config)) {
        return acc;
      }
      const result: Item = {
        platform: "kijiji" as Platform,
        id,
        details: {
          title: item.title ? he.decode(item.title) : id,
          longDescription: item.contentSnippet,
          price: item.price,
          lat: item.lat,
          lon: item.lon,
        },
        url,
        imgURLs: item.enclosure?.url ? [item.enclosure.url] : [],
        videoURLs: [],
      };
      acc.push(result);
      return acc;
    }, [] as Item[])
  );