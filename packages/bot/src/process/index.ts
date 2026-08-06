import { logLevels } from "advanced-config.js";
import { presenceActivities } from "discord/constants.js";
import { startActivity } from "discord/presence.js";
import dotenv from "dotenv-mono";
import {
  Listing,
  addCommuteSummary,
  checkForBlacklist,
  checkWithinSearchArea,
  ensureLocationLink,
  isValid,
} from "listing.js";
import { getSearchConfig } from "search.js";
import { isWithinRadii } from "util/geo.js";
import { log, verboseLog } from "util/log.js";
import { asyncFilter } from "util/misc.js";
import { PersistentDataDef } from "util/persistence.js";

dotenv.load();

export const getSeenKey = (platform: string, id: string) => `${platform}-${id}`;
export const getListingKey = (l: Listing) => getSeenKey(l.platform, l.id);

export const decorateAndFilterListings = async (unseenListings: Listing[]) => {
  const activity = startActivity(
    presenceActivities.processing,
    unseenListings.length
  );
  const [validResults, invalidResults] = await unseenListings.reduce<
    Promise<[Listing[], Listing[]]>
  >(async (promises, l, i) => {
    activity?.update(i);
    const [valid, invalid] = await promises;
    await checkForBlacklist(l);
    await checkWithinSearchArea(l);
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
      }:`
    );
    log(
      invalidResults
        .map(
          (l) =>
            `  - ${l.url}: ${
              l.invalidDueTo
                ? Object.entries(l.invalidDueTo)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                : "unknown"
            }`
        )
        .join("\n")
    );
  }

  return validResults;
};

export const preprocessListings = async (
  listings: Listing[],
  ignoreStore: PersistentDataDef<string[]>
) => {
  // Price is normally enforced by the query handed to the platform, but not
  // every feed honours it — Marketplace's city-wide one ignores it outright. The
  // price is already on the search tile, so this costs nothing, and doing it
  // before the cap below keeps a flood of over-priced listings from crowding out
  // ones that qualify.
  const { min, max } = (await getSearchConfig()).params.price;
  const overPriced: string[] = [];
  const withinPrice = listings.filter((l) => {
    const p = l.details.price;
    // an unparsed price is no evidence either way; leave it to the later stages
    if (p === undefined) {
      return true;
    }
    if ((min !== undefined && p < min) || (max !== undefined && p > max)) {
      overPriced.push(`${getListingKey(l)} (${p})`);
      return false;
    }
    return true;
  });
  if (overPriced.length) {
    log(
      `${overPriced.length} listing${
        overPriced.length !== 1 ? "s" : ""
      } outside the configured price range${logLevels.verbose ? ":" : "."}`
    );
    verboseLog(overPriced.join(", "));
  }

  const withinRadii = await asyncFilter(withinPrice, async (l, i) => {
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

  const res = withinRadii.slice(0, 15);

  let ignore = (await ignoreStore.value()) ?? [];
  await ignoreStore.writeValue([
    ...ignore,
    ...withinRadii.slice(15).map(getListingKey),
  ]);
  ignore = (await ignoreStore.value()) ?? [];
  return res.filter((l) => {
    const doIgnore = ignore.includes(getListingKey(l));
    if (doIgnore) {
      log(
        `Ignoring ${getListingKey(
          l
        )} because it was previously a low-ranked listing`
      );
    }
    return !doIgnore;
  });
};
