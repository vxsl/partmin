import dotenv from "dotenv";
import { tmpDir } from "constants.js";
import { approxLocationLink, isWithinRadii } from "util/geo.js";
import { readJSON, writeJSON } from "util/io.js";
import { log, verboseLog } from "util/misc.js";
import config from "config.js";
import { Item, SeenItemDict } from "types/item.js";

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

      const locationMatch = i.details.location?.toLowerCase().includes(b);
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
  // process items:
  const [targets, blacklistLogs] = await unseenItems.reduce<
    Promise<[Item[], string[]]>
  >(async (promises, item) => {
    const [_targets, _blacklistLog] = await promises;

    // 1. check for blacklisted words:
    const logs = findBlacklistedWords(item);
    if (logs) {
      _blacklistLog.push(...logs);
      return [_targets, _blacklistLog];
    }

    // 2. if necessary and possible, compute the location link:
    if (
      !item.computed?.locationLinkMD &&
      item.details.lat &&
      item.details.lon
    ) {
      item.computed = {
        ...(item.computed ?? {}),
        locationLinkMD: await approxLocationLink(
          item.details.lat,
          item.details.lon
        ),
      };
    }

    _targets.push(item);
    return [_targets, _blacklistLog];
  }, Promise.resolve([[], []]));

  // TODO sort based on time?
  // TODO compute duplicates?

  log(
    `${targets.length} new result${targets.length !== 1 ? "s" : ""}${
      config.logging?.verbose ? ":" : "."
    }`
  );
  verboseLog(targets);
  if (blacklistLogs.length) {
    log(`${blacklistLogs.length} blacklisted:`);
    log(blacklistLogs.map((b) => `  - found ${b}`).join("\n"));
  }

  return targets;
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
