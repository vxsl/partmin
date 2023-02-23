import { getConfigValue, readJSON, writeJSON } from "./util/io.js";
import { log } from "./util/misc.js";

export type Platform = "kijiji" | "fb";

export type Item = {
  id: string;
  platform: Platform;
  url: string;
  details: Partial<{
    title: string;
    price: number;
    description: string;
    location: string;
  }>;
};

type ItemDict = { [k in Platform]: string };

export const itemIsBlacklisted = (item: Item) =>
  getConfigValue((c) =>
    c.search.blacklist.map((b: string) => b.toLowerCase())
  ).then((blacklist: string[]) =>
    blacklist.some((b) => JSON.stringify(item).toLowerCase().includes(b))
  );

export const processItems = async (
  items: Item[],
  options: { log?: boolean } = {}
) => {
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

  const kind = items[0].platform;

  await writeJSON("tmp/seen.json", {
    ...seenItems,
    [kind]: [
      ...new Set([
        ...newItems.map(({ id }) => id),
        ...blacklistedNewItems.map(({ id }) => id),
        ...(seenItems?.[kind] ?? []),
      ]),
    ],
  });

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
