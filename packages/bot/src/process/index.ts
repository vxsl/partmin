import { logLevels } from "advanced-config.js";
import { presenceActivities } from "discord/constants.js";
import { startActivity } from "discord/presence.js";
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
import { asyncFilter } from "util/misc.js";

dotenv.load();

export const getSeenKey = (platform: string, id: string) => `${platform}-${id}`;
export const getListingKey = (l: Listing) => getSeenKey(l.platform, l.id);

export const processListings = async (unseenListings: Listing[]) => {
  const activity = startActivity(
    presenceActivities.processing,
    unseenListings.length
  );
  const [validResults, invalidResults] = await unseenListings.reduce<
    Promise<[Listing[], Listing[]]>
  >(async (promises, l, i) => {
    activity?.update(i);
    const [valid, invalid] = await promises;
    checkForBlacklist(l);
    if (isValid(l)) {
      valid.push(l);
      await ensureLocationLink(l);
      await addCommuteSummary(l);
    } else {
      invalid.push(l);
    }
    return [valid, invalid];
  }, Promise.resolve([[], []]));

  log(
    `${validResults.length} new valid result${
      validResults.length !== 1 ? "s" : ""
    }${validResults.length && logLevels.verbose ? ":" : "."}`
  );
  if (validResults.length) {
    verboseLog(validResults.map((l) => l.url).join(", "));
  }

  if (invalidResults.length) {
    log(
      `${invalidResults.length} invalid result${
        invalidResults.length !== 1 ? "s" : ""
      }${logLevels.verbose ? ":" : "."}`
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

export const preprocessListings = (listings: Listing[]) =>
  asyncFilter(listings, async (l) => {
    if (!l.details.coords) return true;
    const v = await isWithinRadii(l.details.coords);
    if (!v) {
      log(
        `Listing ${getListingKey(l)} is outside of the search area${
          logLevels.verbose ? "." : ""
        }`
      );
      verboseLog(l);
    }
    return v;
  });
