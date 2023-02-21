import { By, WebDriver, WebElement } from "selenium-webdriver";
import { MP_ITEM_XPATH } from "./fb.js";
import { downloadImage, getConfigValue, readJSON, writeJSON } from "./io.js";
import { log, notUndefined, waitSeconds } from "./misc.js";
import { pushover } from "./pushover.js";

export type MarketplaceItem = {
  id: string;
  title: string;
  message: string;
};

export const visitFacebook = async (driver: WebDriver) => {
  await driver.get("https://facebook.com");
};

export const visitMarketplace = async (driver: WebDriver) => {
  const vals = {
    sortBy: "creation_time_descend",
    exact: false,

    propertyType: await getConfigValue((c) => c.search.propertyType),
    minPrice: await getConfigValue((c) => c.search.price.min),
    maxPrice: await getConfigValue((c) => c.search.price.max),
    minAreaSize: await getConfigValue((c) => {
      const n = c.search.minArea * 0.09290304;
      if (n) {
        return Math.floor(n * 100) / 100;
      }
    }),
    latitude: await getConfigValue((c) => c.search.location.lat),
    longitude: await getConfigValue((c) => c.search.location.lng),
    radius:
      (await getConfigValue((c) => c.search.location.radius)) +
      Math.random() * 0.00000001 +
      Math.random() * 0.0000001 +
      Math.random() * 0.000001 +
      Math.random() * 0.00001,

    minBedrooms: await getConfigValue((c) => c.search.bedrooms.min),
  };

  let url = `https://facebook.com/marketplace/category/propertyrentals?`;
  for (const [k, v] of Object.entries(vals)) {
    if (v) {
      url += `${k}=${v}&`;
    }
  }

  await driver.get(url);
  return url;
};

export const itemIsBlacklisted = (item: MarketplaceItem) =>
  getConfigValue((c) =>
    c.search.blacklist.map((b: string) => b.toLowerCase())
  ).then((blacklist: string[]) =>
    blacklist.some((b) => JSON.stringify(item).toLowerCase().includes(b))
  );

export const processItems = async (
  items: MarketplaceItem[],
  options: { log?: boolean } = {}
) => {
  const seenItems = (await readJSON<string[]>("tmp/seen.json")) ?? [];
  const newItems = items.reduce<MarketplaceItem[]>((n, item) => {
    if (!seenItems.includes(item.id)) {
      // (itemIsBlacklisted(item) ? b : n).push(item);
      n.push(item);
    }
    return n;
  }, []);

  const blacklistedNewItems = [];
  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    if (await itemIsBlacklisted(item)) {
      blacklistedNewItems.push(item);
      newItems.splice(i, 1);
      i--;
    }
  }

  await writeJSON("tmp/seen.json", [
    ...newItems.map(({ id }) => id),
    ...blacklistedNewItems.map(({ id }) => id),
    ...seenItems,
  ]);

  if (options.log) {
    if (!newItems.length && !blacklistedNewItems.length) {
      log(`No new items. (checked ${items.length})`);
    } else {
      console.log("\n=======================================================");

      if (newItems.length) {
        log(
          `Checked ${items.length} item${
            items.length === 1 ? "" : "s"
          }, found ${newItems.length} new:`,
          newItems
        );
        if (blacklistedNewItems.length) {
          log(
            `Also found ${blacklistedNewItems.length} new blacklisted item${
              blacklistedNewItems.length === 1 ? "" : "s"
            }`
          );
        }
      } else {
        log(
          `Checked ${items.length} item${
            items.length === 1 ? "" : "s"
          }, found ${blacklistedNewItems.length} new blacklisted:`,
          blacklistedNewItems
        );
      }
      console.log("----------------------------------------\n");
    }
  }

  return newItems;
};

export const scrapeItems = async (
  driver: WebDriver
): Promise<MarketplaceItem[] | undefined> => {
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
          await downloadImage(imgSrc, "tmp/images/" + id + ".jpg");

          const SEP = " - ";
          const text = await e
            .getText()
            .then((t) =>
              t.replace("\n", SEP).replace(/^C+/, "").replace("\n", SEP)
            );
          const tokens = text.split(SEP);
          const price = tokens[0] ?? "ERROR_PRICE";
          const loc = tokens[tokens.length - 1] ?? "ERROR_LOC";
          const name =
            tokens.slice(1, tokens.length - 1).join(SEP) ?? "ERROR_NAME";

          return { id, title: `${price} - ${loc}`, message: name };
        });
      })
    )
  ).filter(notUndefined);
};

export const newItemNotify = async (item: MarketplaceItem) => {
  const { id, title, message } = item;
  await pushover(
    { title, message, url: `fb://marketplace_product_details?id=${id}` },
    `${id}.jpg`
  );
};
