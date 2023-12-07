import { Config } from "types/config.js";
import { readJSON, writeJSON } from "./util/io.js";
import { log } from "./util/misc.js";

export type Platform = "kijiji" | "fb";

export type Item = {
  id: string;
  platform: Platform;
  url: string;
  clickUrl?: string;
  details: Partial<{
    title: string;
    price: number;
    description: string;
    location: string;
  }>;
};

type ItemDict = { [k in Platform]: string };

let blacklist: string[] | undefined;

export const itemIsBlacklisted = (item: Item) =>
  blacklist?.some((b) => JSON.stringify(item).toLowerCase().includes(b));

export const processItems = async (
  config: Config,
  items: Item[],
  options: { log?: boolean } = {}
) => {
  if (!blacklist) {
    blacklist = config.search.blacklist.map((b) => b.toLowerCase());
  }
  const seenItems = await readJSON<ItemDict>("tmp/seen.json");

  const newItems = items.reduce<Item[]>((n, item) => {
    !(seenItems?.[item.platform] ?? ([] as string[])).includes(item.id) &&
      n.push(item);
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

  const platform = items[0].platform;

  await writeJSON("tmp/seen.json", {
    ...seenItems,
    [platform]: [
      ...new Set([
        ...newItems.map(({ id }) => id),
        ...blacklistedNewItems.map(({ id }) => id),
        ...(seenItems?.[platform] ?? []),
      ]),
    ],
  });

  if (options.log) {
    if (!newItems.length && !blacklistedNewItems.length) {
      log(`No new items on ${platform}. (checked ${items.length})`);
    } else {
      console.log("\n=======================================================");

      if (newItems.length) {
        log(
          `Checked ${items.length} item${
            items.length === 1 ? "" : "s"
          } on ${platform}, found ${newItems.length} new:`,
          newItems
        );
        if (blacklistedNewItems.length) {
          log(
            `Also found ${blacklistedNewItems.length} new blacklisted item${
              blacklistedNewItems.length === 1 ? "" : "s"
            } on ${platform}`
          );
        }
      } else {
        log(
          `Checked ${items.length} item${
            items.length === 1 ? "" : "s"
          } on ${platform}, found ${
            blacklistedNewItems.length
          } new blacklisted:`,
          blacklistedNewItems.map(
            ({ details: { title, price }, clickUrl }) => ({
              title,
              price,
              clickUrl,
            })
          )
        );
      }
      console.log("----------------------------------------\n");
    }
  }

  return newItems;
};
