import { By, WebDriver } from "selenium-webdriver";
import { MP_ITEM_XPATH } from "./fb.js";
import { downloadImage, getConfigValue, readJSON, writeJSON } from "./io.js";
import { notUndefined } from "./misc.js";
import { pushover } from "./pushover.js";

const BLACKLIST: string[] = await getConfigValue((c) =>
  c.search.blacklist.map((b: string) => b.toLowerCase())
);

export type MarketplaceItem = {
  id: string;
  title: string;
  message: string;
};

export const isBlacklisted = (item: MarketplaceItem) =>
  BLACKLIST.some((b) => JSON.stringify(item).toLowerCase().includes(b));

export const processItems = async (
  items: MarketplaceItem[],
  options: { log?: boolean } = {}
) => {
  const seenItems = await readJSON("tmp/seen.json");
  const [newItems, blacklistedNewItems] = items.reduce<
    [n: MarketplaceItem[], b: MarketplaceItem[]]
  >(
    ([n, b], item) => {
      if (!seenItems.includes(item.id)) {
        (isBlacklisted(item) ? b : n).push(item);
      }
      return [n, b];
    },
    [[], []]
  );

  writeJSON("tmp/seen.json", [
    ...newItems.map(({ id }) => id),
    ...blacklistedNewItems.map(({ id }) => id),
    ...seenItems,
  ]);

  if (options.log) {
    if (!newItems.length && !blacklistedNewItems.length) {
      console.log(`No new items. (checked ${items.length})`);
    } else {
      console.log("\n========================================");

      if (newItems.length) {
        console.log(
          `Checked ${items.length} items, found ${newItems.length} new:, `,
          newItems
        );
        if (blacklistedNewItems.length) {
          console.log(
            `Also found ${blacklistedNewItems.length} new blacklisted items:, `,
            blacklistedNewItems
          );
        }
      } else {
        console.log(
          `Checked ${items.length} items, found ${blacklistedNewItems.length} new blacklisted: `,
          { blacklisted: blacklistedNewItems }
        );
      }
    }
  }

  return newItems;
};

export const scrapeItems = async (
  driver: WebDriver
): Promise<MarketplaceItem[]> =>
  (
    await Promise.all(
      (
        await driver.findElements(By.xpath(MP_ITEM_XPATH))
      ).map((e) => {
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
