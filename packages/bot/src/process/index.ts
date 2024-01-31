import config from "config.js";
import { tmpDir } from "constants.js";
import dotenv from "dotenv-mono";
import {
  Listing,
  SeenListingDict,
  addCommuteSummary,
  addLocationLink,
  getBlacklistedString,
} from "listing.js";
import { isWithinRadii } from "util/geo.js";
import { readJSON, writeJSON } from "util/io.js";
import { log, verboseLog } from "util/log.js";

dotenv.load();

const seenPath = config.development?.testing
  ? `${tmpDir}/test-seen.json`
  : `${tmpDir}/seen.json`;
export const loadSeenListings = async () =>
  await readJSON<SeenListingDict>(seenPath).then((arr) => arr ?? {});
export const saveSeenListings = async (v: SeenListingDict) =>
  await writeJSON(seenPath, v);
export const getSeenKey = (platform: string, id: string) => `${platform}-${id}`;
const getSeenListingKey = (l: Listing) => getSeenKey(l.platform, l.id);

export const withUnseenListings = async <T>(
  listings: Listing[],
  fn: (listings: Listing[]) => Promise<T>
) => {
  const seenListings = await loadSeenListings();
  const unseenListings: Listing[] = [];
  for (const l of listings) {
    const k = getSeenListingKey(l);
    if (seenListings[k]) {
      continue;
    }
    seenListings[k] = 1;
    unseenListings.push(l);
  }

  const result = await fn(unseenListings);

  await saveSeenListings(seenListings);
  log(
    `${unseenListings.length} unseen listing${
      unseenListings.length !== 1 ? "s" : ""
    } out of ${listings.length}${config.logging?.verbose ? ":" : "."}`
  );
  verboseLog({ unseenListings });

  return result;
};

export const processListings = async (unseenListings: Listing[]) => {
  const [results, blacklistLogs] = await unseenListings.reduce<
    Promise<[Listing[], string[]]>
  >(async (promises, l) => {
    const [_results, _blacklistLogs] = await promises;
    const bl = getBlacklistedString(l);
    if (bl) {
      _blacklistLogs.push(bl);
    } else {
      await addLocationLink(l);
      await addCommuteSummary(l);
      _results.push(l);
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
  verboseLog({ results });
  if (blacklistLogs.length) {
    log(`${blacklistLogs.length} blacklisted:`);
    log(blacklistLogs.map((b) => `  - found ${b}`).join("\n"));
  }

  return results;
};

export const excludeListingsOutsideSearchArea = (listings: Listing[]) =>
  listings.filter((l) => {
    if (!l.details.coords) return true;
    const v = isWithinRadii(l.details.coords);
    if (!v) {
      log(`Listing ${getSeenListingKey(l)} is outside of the search area:`);
      log(l);
    }
    return v;
  });
