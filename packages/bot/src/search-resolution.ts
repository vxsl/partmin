import { ChannelKey, searchChannelKey } from "discord/constants.js";
import { readFileSync } from "fs";
import {
  PlatformKey,
  StaticSearch,
  StaticSearchOverride,
  StaticUserConfig,
  cityWideCategory,
  primarySearchName,
  rentalCategory,
  userConfigPath,
} from "user-config.js";

// Deliberately free of the bot's logging and persistence, both of which reach
// back into the retrieval loop: turning a config into a list of searches is pure
// enough to exercise on its own.

/**
 * One search partmin runs: a fully resolved set of search criteria, the Discord
 * channel its listings go to, and the platforms it covers. `search` in the
 * user's config is one of these; each entry of `searches` is another.
 */
export type ResolvedSearch = {
  name: string;
  channelKey: ChannelKey;
  config: StaticSearch;
  platforms: PlatformKey[];
};

/**
 * The platforms partmin currently drives. A search may narrow this list, but
 * naming anything outside it won't bring it back.
 */
export const enabledPlatforms: PlatformKey[] = ["fb", "craigslist"];

/**
 * Whether a search is looking for somewhere to live. Rental-specific filters and
 * listing fields are meaningless for, say, a search over bicycles, so they're
 * skipped when this is false.
 */
export const isRentalSearch = (config: StaticSearch) =>
  (config.category ?? rentalCategory) === rentalCategory;

/**
 * Whether a search covers every category by way of Marketplace's city-wide feed.
 * That feed ignores the price and radius it's handed, so partmin has to apply
 * both itself — and the radius it reports back (~65 km) would otherwise look
 * like Marketplace refusing to honour the configured one.
 */
export const isCityWideSearch = (config: StaticSearch) =>
  config.category === cityWideCategory;

/** Default freshness window for the city-wide feed, in hours. */
const cityWideMaxListingAgeHours = 24;

/**
 * How old a listing may be and still be worth sending.
 *
 * A category page is sorted newest-first, so a tight window is right: anything
 * older has been offered before. The city-wide feed is ranked instead, and
 * happily resurfaces week-old listings, so the same window would reject all of
 * it — but no window at all lets those week-old listings through, which is no
 * better. A day is the compromise, and `params.maxListingAgeHours` overrides it.
 */
export const maxListingAgeMinutes = (
  config: StaticSearch,
  options: { defaultMinutes: number }
) => {
  const configured = config.params.maxListingAgeHours;
  if (configured !== undefined) {
    return configured * 60;
  }
  return isCityWideSearch(config)
    ? cityWideMaxListingAgeHours * 60
    : options.defaultMinutes;
};

/**
 * Lays an entry of `searches` over the `search` block. Every field the override
 * sets replaces the corresponding one outright — nested objects aren't merged
 * key-by-key, so `params.pets` either comes wholly from the override or wholly
 * from `search`.
 */
export const mergeSearch = (
  base: StaticSearch,
  o: StaticSearchOverride
): StaticSearch => ({
  category: o.category ?? base.category,
  platforms: o.platforms ?? base.platforms,
  blacklist: o.blacklist ?? base.blacklist,
  blacklistRegex: o.blacklistRegex ?? base.blacklistRegex,
  location: {
    city: o.location?.city ?? base.location.city,
    region: o.location?.region ?? base.location.region,
    mapDevelopersURL:
      o.location?.mapDevelopersURL ?? base.location.mapDevelopersURL,
    commuteDestinations:
      o.location?.commuteDestinations ?? base.location.commuteDestinations,
    radiusKm: o.location?.radiusKm ?? base.location.radiusKm,
    center: o.location?.center ?? base.location.center,
  },
  params: {
    price: o.params?.price ?? base.params.price,
    minBedrooms: o.params?.minBedrooms ?? base.params.minBedrooms,
    maxListingAgeHours:
      o.params?.maxListingAgeHours ?? base.params.maxListingAgeHours,
    pets: o.params?.pets ?? base.params.pets,
    exclude: o.params?.exclude ?? base.params.exclude,
    unreliableParams:
      o.params?.unreliableParams ?? base.params.unreliableParams,
  },
});

export const resolveSearches = (
  config: StaticUserConfig,
  options?: {
    onUnavailablePlatform?: (search: string, platform: PlatformKey) => void;
  }
): ResolvedSearch[] => {
  const resolve = (name: string, search: StaticSearch): ResolvedSearch => {
    const requested = search.platforms ?? enabledPlatforms;
    const platforms = requested.filter((p) => enabledPlatforms.includes(p));
    for (const p of requested) {
      if (!platforms.includes(p)) {
        options?.onUnavailablePlatform?.(name, p);
      }
    }
    return {
      name,
      channelKey: searchChannelKey(name),
      config: search,
      platforms,
    };
  };

  return [
    resolve(primarySearchName, config.search),
    ...Object.entries(config.searches ?? {}).map(([name, override]) =>
      resolve(name, mergeSearch(config.search, override))
    ),
  ];
};

/**
 * The names under `searches`, straight out of the config file and unvalidated.
 * Channels are named after searches and have to be set up before the config has
 * necessarily been filled in, which rules out the validating accessors.
 */
export const readRawSearchNames = (): string[] => {
  try {
    const raw = JSON.parse(
      readFileSync(userConfigPath, { encoding: "utf-8" })
    ) as StaticUserConfig;
    const searches = raw?.searches;
    return searches && typeof searches === "object"
      ? Object.keys(searches)
      : [];
  } catch {
    return [];
  }
};
