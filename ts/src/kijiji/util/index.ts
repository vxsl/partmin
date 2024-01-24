import he from "he";
import { Item, Platform } from "process.js";
import Parser from "rss-parser";
import { By, WebDriver, until } from "selenium-webdriver";
import { Config } from "types/config.js";
import { debugLog, notUndefined, waitSeconds } from "../../util/misc.js";
import { clearAlternate, clickByXPath, type } from "../../util/selenium.js";
import { baseURL } from "./constants.js";
import { setKijijiFilters } from "./filter-interactions.js";

const parser = new Parser({
  customFields: {
    item: [
      // ["g-core:location", "location"],
      ["g-core:price", "price"],
      ["geo:lat", "lat"],
      ["geo:long", "lon"],
    ],
  },
});

export const kijijiVisit = async (url: string, driver: WebDriver) => {
  await driver.get(url);
  const xpath = "//button[contains(@class, 'cookieBannerCloseButton')]";
  await driver
    .wait(until.elementLocated(By.xpath(xpath)), 1000)
    .then((el) => el && clickByXPath(driver, xpath))
    .catch((e) => {
      debugLog(e);
    });
};

export const getKijijiRSS = async (config: Config, driver: WebDriver) => {
  await kijijiVisit(baseURL, driver);
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

export const scrapeItems = (rssUrl: string): Promise<Item[]> =>
  parser.parseURL(rssUrl).then((output) =>
    output.items
      .map((item) => {
        // item.pub;
        console.log("🚀  item:", item);
        const url = item.link;
        const id = url?.split("/").pop();
        if (!url || !id) return undefined;

        const result: Item = {
          platform: "kijiji" as Platform,
          id,
          details: {
            title: item.title ? he.decode(item.title) : id,
            description: item.contentSnippet,
            price: item.price,
            // location: item["g-core:location"],
            // location: `(${item["geo:lat"]}, ${item["geo:long"]})`,
            location: `(${item.lat}, ${item.lon})`,
          },
          clickUrl: url,
          url,
          imgUrl: item.enclosure?.url,
        };
        return result;
      })
      .filter(notUndefined)
  );
