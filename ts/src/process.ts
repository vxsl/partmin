import dotenv from "dotenv";
import { Config } from "types/config.js";
import { tmpDir } from "./constants.js";
import { approxLocationLink } from "./util/geo.js";
import { readJSON, writeJSON } from "./util/io.js";
import { log, verboseLog } from "./util/misc.js";
import config from "../../config.json" assert { type: "json" };

dotenv.config();

export type Platform = "kijiji" | "fb";
export type Item = {
  id: string;
  platform: Platform;
  url: string;
  details: {
    title: string;
    price?: number;
    longDescription?: string;
    location?: string;
    lat?: number;
    lon?: number;
  };
  computed?: {
    locationLinkMD?: string;
    bulletPoints?: string[];
  };
  imgURLs: string[];
  videoURLs: string[];
};

interface SeenItemDict {
  [k: string]: 1 | undefined;
}

let blacklist: string[] | undefined;

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

const seenPath = config.testing
  ? `${tmpDir}/test-seen.json`
  : `${tmpDir}/seen.json`;
export const loadSeenItems = async () =>
  await readJSON<SeenItemDict>(seenPath).then((arr) => arr ?? {});
export const saveSeenItems = async (v: SeenItemDict) =>
  await writeJSON(seenPath, v);

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

  const result = await fn(unseenItems);

  await saveSeenItems(seenItems);
  log(
    `${unseenItems.length} unseen item${
      unseenItems.length !== 1 ? "s" : ""
    } out of ${items.length}${config.verbose ? ":" : "."}`
  );
  verboseLog(unseenItems);

  return result;
};

export const processItems = async (config: Config, unseenItems: Item[]) => {
  // TODO sort based on time?
  if (!blacklist) {
    blacklist = config.search.blacklist?.map((b) => b.toLowerCase());
  }
  const blacklistLog: string[] = [];
  const { targets, blacklisted } = await unseenItems.reduce<
    Promise<{
      targets: Item[];
      blacklisted: Item[];
    }>
  >(
    async (filteredPromises, item) => {
      const result = await filteredPromises;

      const blacklistOccurrences = findBlacklistedWords(item);
      if (blacklistOccurrences) {
        blacklistLog.push(...blacklistOccurrences);
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

  for (const item of targets) {
    if (
      item.computed?.locationLinkMD ||
      !item.details.lat ||
      !item.details.lon
    ) {
      continue;
    }
    item.computed = {
      ...(item.computed ?? {}),
      locationLinkMD: await approxLocationLink(
        item.details.lat,
        item.details.lon
      ),
    };
  }

  log(
    `${targets.length} new result${targets.length !== 1 ? "s" : ""}${
      config.verbose ? ":" : "."
    }`
  );
  verboseLog(targets);
  if (blacklisted.length) {
    log(`${blacklisted.length} blacklisted:`);
    log(blacklistLog.map((b) => `  - found ${b}`).join("\n"));
  }
  // TODO compute duplicates

  return targets;
};
