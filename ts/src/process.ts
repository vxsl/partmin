import dotenv from "dotenv";
import { Config } from "types/config.js";
import { tmpDir } from "./constants.js";
import { VERBOSE } from "./index.js";
import { generateLocationLink } from "./util/geo.js";
import { readJSON, writeJSON } from "./util/io.js";
import { log, verboseLog } from "./util/misc.js";

dotenv.config();

export type Platform = "kijiji" | "fb";

export type Item = {
  id: string;
  platform: Platform;
  url: string;
  details: {
    title: string;
    price?: number;
    description?: string;
  } & (
    | {
        location: string;
        lat?: number;
        lon?: number;
      }
    | {
        location?: string;
        lat: number;
        lon: number;
      }
  );
  imgURLs: string[];
};

let blacklist: string[] | undefined;

export const itemIsBlacklisted = (item: Item) =>
  blacklist?.some((b) => JSON.stringify(item).toLowerCase().includes(b));

interface SeenItemDict {
  [k: string]: 1 | undefined;
}

export const loadSeenItems = async () => {
  return await readJSON<SeenItemDict>(`${tmpDir}/seen.json`).then(
    (arr) => arr ?? {}
  );
};

export const saveSeenItems = async (v: SeenItemDict) => {
  await writeJSON(`${tmpDir}/seen.json`, v);
};

export const withUnseenItems = async <T>(
  items: Item[],
  fn: (items: Item[]) => Promise<T>
) => {
  const seenItems = await loadSeenItems();
  const unseenItems: Item[] = [];
  for (const item of items) {
    const k = `${item.platform}-${item.id}`;
    if (seenItems[k]) {
      continue;
    }
    seenItems[k] = 1;
    unseenItems.push(item);
  }

  await saveSeenItems(seenItems);

  log(
    `Checked ${items.length} item${items.length === 1 ? "" : "s"}, found ${
      unseenItems.length
    } new${VERBOSE ? ":" : "."}`
  );

  return await fn(unseenItems);
};

export const processItems = async (config: Config, items: Item[]) => {
  if (!blacklist) {
    blacklist = config.search.blacklist.map((b) => b.toLowerCase());
  }

  await withUnseenItems(items, async (unseenItems) => {
    const { targets, blacklisted } = await unseenItems.reduce<
      Promise<{
        targets: Item[];
        blacklisted: Item[];
      }>
    >(
      async (filteredPromises, item) => {
        const result = await filteredPromises;
        const isBlacklisted = await itemIsBlacklisted(item);
        if (isBlacklisted) {
          result.blacklisted.push(item);
        } else {
          result.targets.push(item);
        }
        return result;
      },
      Promise.resolve({
        targets: [],
        blacklisted: [],
      })
    );

    const platform = items[0].platform;

    for (const item of targets) {
      if (item.details.location || !item.details.lat || !item.details.lon)
        continue;
      item.details.location = await generateLocationLink(
        item.details.lat,
        item.details.lon
      );
    }

    log("\n=======================================================");
    log(`${platform}: ${targets.length} new results${VERBOSE ? ":" : "."}`);
    verboseLog(targets);
    if (blacklisted.length) {
      log(
        `${platform}: ${blacklisted.length} new but blacklisted${
          VERBOSE ? ":" : "."
        }`
      );
    }
    // TODO compute duplicates
    log("----------------------------------------\n");

    process.exit();

    return targets;
  });
};
