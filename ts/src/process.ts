import axios from "axios";
import dotenv from "dotenv";
import { Config } from "types/config.js";
import { tmpDir } from "./constants.js";
import { VERBOSE } from "./index.js";
import { generateLocationLink, isWithinRadii } from "./util/geo.js";
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
  imgURL?: string;
};

let blacklist: string[] | undefined;

export const itemIsBlacklisted = (item: Item) =>
  blacklist?.some((b) => JSON.stringify(item).toLowerCase().includes(b));

export const processItems = async (config: Config, items: Item[]) => {
  if (!blacklist) {
    blacklist = config.search.blacklist.map((b) => b.toLowerCase());
  }
  const seenItems = await readJSON<{ [k: string]: 1 | undefined }>(
    `${tmpDir}/seen.json`
  ).then((arr) => arr ?? {});

  const { newItemIDs, validNewItems, blacklistedNewItems } = await items.reduce<
    Promise<{
      newItemIDs: string[];
      validNewItems: Item[];
      blacklistedNewItems: Item[];
    }>
  >(
    async (filteredPromises, item) => {
      const result = await filteredPromises;
      const isBlacklisted = await itemIsBlacklisted(item);
      const k = `${item.platform}-${item.id}`;
      if (seenItems[k]) {
        return result;
      }
      seenItems[k] = 1;
      result.newItemIDs.push(item.id);
      if (isBlacklisted) {
        result.blacklistedNewItems.push(item);
      } else {
        result.validNewItems.push(item);
      }
      return result;
    },
    Promise.resolve({
      newItemIDs: [],
      validNewItems: [],
      blacklistedNewItems: [],
    })
  );

  const platform = items[0].platform;

  await writeJSON(`${tmpDir}/seen.json`, seenItems);

  if (!newItemIDs.length) {
    log(`No new items on ${platform}. (checked ${items.length})`);
    return [];
  }

  for (const item of validNewItems) {
    if (item.details.location || !item.details.lat || !item.details.lon)
      continue;
    item.details.location = await generateLocationLink(
      item.details.lat,
      item.details.lon
    );
  }

  log("\n=======================================================");
  log(
    `Checked ${items.length} item${
      items.length === 1 ? "" : "s"
    } on ${platform}, found ${newItemIDs.length} new${VERBOSE ? ":" : "."}`
  );
  log(
    // TODO think of a better word than 'valid'
    `${validNewItems.length} ${validNewItems.length > 1 ? "are" : "is"} valid${
      VERBOSE ? ":" : "."
    }`
  );
  verboseLog(validNewItems);
  if (blacklistedNewItems.length) {
    log(
      `${blacklistedNewItems.length} ${
        blacklistedNewItems.length === 1 ? "was" : "were"
      } blacklisted.`
    );
  }
  // TODO compute duplicates
  log("----------------------------------------\n");

  return validNewItems;
};
