import { Item, Platform } from "process.js";
import { By, WebDriver, WebElement } from "selenium-webdriver";
import { Config } from "types/config.js";
import { downloadImage } from "../../util/io.js";
import { notUndefined, waitSeconds } from "../../util/misc.js";
import { pushover } from "../../util/pushover.js";
import { MP_ITEM_XPATH } from "./index.js";

export const visitMarketplace = async (config: Config, driver: WebDriver) => {
  const vals = {
    sortBy: "creation_time_descend",
    exact: false,
    propertyType: config.search.propertyType,
    minPrice: config.search.price.min,
    maxPrice: config.search.price.max,
    minAreaSize: config.search.minArea
      ? Math.floor(config.search.minArea * 0.09290304 * 100) / 100
      : undefined,
    latitude: config.search.location.lat,
    longitude: config.search.location.lng,
    radius:
      config.search.location.radius +
      Math.random() * 0.00000001 +
      Math.random() * 0.0000001 +
      Math.random() * 0.000001 +
      Math.random() * 0.00001,
    minBedrooms: config.search.bedrooms.min,
  };

  const city = config.search.location.city;
  let url = `https://facebook.com/marketplace/${city}/propertyrentals?`;
  for (const [k, v] of Object.entries(vals)) {
    if (v) {
      url += `${k}=${v}&`;
    }
  }

  await driver.get(url);
  return url;
};

export const scrapeItems = async (
  driver: WebDriver
): Promise<Item[] | undefined> => {
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
            pushover({
              title: "ERROR",
              message: href,
              url: href,
              id: href,
            });
            return;
          }

          const imgSrc = await e
            .findElement(By.css("img"))
            .then((img) => img.getAttribute("src"));
          await downloadImage(imgSrc, "tmp/images/" + "fb-" + id + ".jpg");

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

          return {
            platform: "fb" as Platform, // TODO
            id,
            details: { title, price, location: location },
            url: `fb://marketplace_product_details?id=${id}`,
            clickUrl: `https://facebook.com/marketplace/item/${id}`,
          };
        });
      })
    )
  ).filter(notUndefined);
};
