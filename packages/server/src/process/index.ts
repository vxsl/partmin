import config from "config.js";
import { tmpDir } from "constants.js";
import dotenv from "dotenv-mono";
import { Item, SeenItemDict } from "item.js";
import { isWithinRadii } from "util/geo.js";
import { readJSON, writeJSON } from "util/io.js";
import { log, verboseLog } from "util/log.js";
import { addLocationLink, addCommuteSummary } from "item.js";

dotenv.load();

const findBlacklistedWords = ({ id, details }: Item): string | undefined => {
  const report = (v: string | RegExp, f: string) =>
    `'${v}' in item ${id}'s ${f}`;

  const desc = details.longDescription?.toLowerCase();
  const title = details.title?.toLowerCase();
  const loc = (details.longAddress ?? details.shortAddress)?.toLowerCase();

  for (const b of config.search.blacklist?.map((b) => b.toLowerCase()) ?? []) {
    if (desc?.includes(b)) return report(b, "description");
    if (title?.includes(b)) return report(b, "title");
    if (loc?.includes(b)) return report(b, "location");
  }

  for (const _r of config.search.blacklistRegex ?? []) {
    const r = new RegExp(_r, "i");
    if (desc?.match(r)) return report(r, "description");
    if (title?.match(r)) return report(r, "title");
    if (loc?.match(r)) return report(r, "location");
  }
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
      _blacklistLogs.push(bl);
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
    if (!item.details.coords) return true;
    const v = isWithinRadii(item.details.coords);
    if (!v) {
      log(`Item ${getSeenItemKey(item)} is outside of the search area:`);
      log(item);
    }
    return v;
  });
