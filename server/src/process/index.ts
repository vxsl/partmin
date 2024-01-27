import config from "config.js";
import { tmpDir } from "constants.js";
import dotenv from "dotenv";
import { Item, SeenItemDict } from "item.js";
import { isWithinRadii } from "util/geo.js";
import { readJSON, writeJSON } from "util/io.js";
import { log, verboseLog } from "util/log.js";
import { addLocationLink, addCommuteSummary } from "item.js";

dotenv.config();

const blacklist = config.search.blacklist?.map((b) => b.toLowerCase());

const findBlacklistedWords = (i: Item): string[] | null => {
  const result: string[] = [];

  if (
    blacklist?.some((_b) => {
      const b = _b.toLowerCase();

      const descriptionMatch = i.details.longDescription
        ?.toLowerCase()
        .includes(b);
      if (descriptionMatch) {
        result.push(`'${_b}' in item ${i.id}'s description`);
        return true;
      }

      const titleMatch = i.details.title?.toLowerCase().includes(b);
      if (titleMatch) {
        result.push(`'${_b}' in item ${i.id}'s title`);
        return true;
      }

      const locationMatch = i.details.shortAddress?.toLowerCase().includes(b);
      if (locationMatch) {
        result.push(`'${_b}' in item ${i.id}'s location`);
        return true;
      }

      return false;
    })
  ) {
    return result;
  }

  return null;
};

const seenPath = config.development?.testing
  ? `${tmpDir}/test-seen.json`
  : `${tmpDir}/seen.json`;
export const loadSeenItems = async () =>
  await readJSON<SeenItemDict>(seenPath).then((arr) => arr ?? {});
export const saveSeenItems = async (v: SeenItemDict) =>
  await writeJSON(seenPath, v);
export const getSeenKey = (platform: string, id: string) => `${platform}-${id}`;
const getSeenItemKey = (item: Item) => getSeenKey(item.platform, item.id);

export const withUnseenItems = async <T>(
  items: Item[],
  fn: (items: Item[]) => Promise<T>
) => {
  const seenItems = await loadSeenItems();
  const unseenItems: Item[] = [];
  for (const item of items) {
    const k = getSeenItemKey(item);
    if (seenItems[k]) {
      continue;
    }
    seenItems[k] = 1;
    unseenItems.push(item);
  }

  const result = await fn(unseenItems);

  await saveSeenItems(seenItems);
  log(
    `${unseenItems.length} unseen item${
      unseenItems.length !== 1 ? "s" : ""
    } out of ${items.length}${config.logging?.verbose ? ":" : "."}`
  );
  verboseLog(unseenItems);

  return result;
};

export const processItems = async (unseenItems: Item[]) => {
  const [results, blacklistLogs] = await unseenItems.reduce<
    Promise<[Item[], string[]]>
  >(async (promises, item) => {
    const [_results, _blacklistLogs] = await promises;
    const bl = findBlacklistedWords(item);
    if (bl) {
      _blacklistLogs.push(...bl);
    } else {
      await addLocationLink(item);
      await addCommuteSummary(item);
      _results.push(item);
    }
    return [_results, _blacklistLogs];
  }, Promise.resolve([[], []]));

  // TODO sort based on time?
  // TODO compute duplicates?

  log(
    `${results.length} new result${results.length !== 1 ? "s" : ""}${
      config.logging?.verbose ? ":" : "."
    }`
  );
  verboseLog(results);
  if (blacklistLogs.length) {
    log(`${blacklistLogs.length} blacklisted:`);
    log(blacklistLogs.map((b) => `  - found ${b}`).join("\n"));
  }

  return results;
};

export const excludeItemsOutsideSearchArea = (items: Item[]) =>
  items.filter((item) => {
    if (item.details.lat === undefined || item.details.lon === undefined)
      return true;
    const v = isWithinRadii(item.details.lat, item.details.lon);
    if (!v) {
      log(`Item ${getSeenItemKey(item)} is outside of the search area:`);
      log(item);
    }
    return v;
  });
