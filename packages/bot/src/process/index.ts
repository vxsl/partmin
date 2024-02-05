import cache from "cache.js";
import config from "config.js";
import dotenv from "dotenv-mono";
import {
  Listing,
  addCommuteSummary,
  checkForBlacklist,
  ensureLocationLink,
  isValid,
} from "listing.js";
import { isWithinRadii } from "util/geo.js";
import { log, verboseLog } from "util/log.js";

dotenv.load();

export const getSeenKey = (platform: string, id: string) => `${platform}-${id}`;
export const getListingKey = (l: Listing) => getSeenKey(l.platform, l.id);

export const withUnseenListings = async <T>(
  newListings: Listing[],
  fn: (listings: Listing[]) => Promise<T>
) => {
  const seen = cache.listings.value ?? [];
  const seenKeys = new Set(seen.map(getListingKey));
  const unseen = newListings.filter((l) => !seenKeys.has(getListingKey(l)));
  const result = await fn(unseen);
  cache.listings.writeValue([...seen, ...unseen]);
  log(
    `${unseen.length} unseen listing${unseen.length !== 1 ? "s" : ""} out of ${
      newListings.length
    }${config.logging?.verbose ? ":" : "."}`
  );
  verboseLog(unseen.map((l) => l.url).join(", "));
  return result;
};

export const processListings = async (unseenListings: Listing[]) => {
  const [validResults, invalidResults] = await unseenListings.reduce<
    Promise<[Listing[], Listing[]]>
  >(async (promises, l) => {
    const [valid, invalid] = await promises;
    checkForBlacklist(l);
    if (isValid(l)) {
      valid.push(l);
      if (!config.options?.disableGoogleMapsFeatures) {
        await ensureLocationLink(l);
        await addCommuteSummary(l);
      }
    } else {
      invalid.push(l);
    }
    return [valid, invalid];
  }, Promise.resolve([[], []]));

  log(
    `${validResults.length} new valid result${
      validResults.length !== 1 ? "s" : ""
    }${validResults.length && config.logging?.verbose ? ":" : "."}`
  );
  if (validResults.length) {
    verboseLog(validResults.map((l) => l.url).join(", "));
  }

  if (invalidResults.length) {
    log(
      `${invalidResults.length} invalid result${
        invalidResults.length !== 1 ? "s" : ""
      }${config.logging?.verbose ? ":" : "."}`
    );
    verboseLog(
      invalidResults
        .map(
          (l) =>
            `  - ${l.url}: ${
              l.invalidDueTo
                ? Object.entries(l.invalidDueTo)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                : "unknown"
            } `
        )
        .join("\n")
    );
  }

  return validResults;
};

export const excludeListingsOutsideSearchArea = (listings: Listing[]) =>
  listings.filter((l) => {
    if (!l.details.coords) return true;
    const v = isWithinRadii(l.details.coords);
    if (!v) {
      log(
        `Listing ${getListingKey(l)} is outside of the search area${
          config.logging?.verbose ? "." : ""
        }`
      );
      verboseLog(l);
    }
    return v;
  });
