import { getSearchDir } from "constants.js";
import { ChannelKey, searchChannelKey } from "discord/constants.js";
import { readFileSync } from "fs";
import type { Listing } from "listing.js";
import {
  PlatformKey,
  StaticSearch,
  StaticSearchOverride,
  StaticUserConfig,
  primarySearchName,
  rentalCategory,
  userConfigPath,
  validateSearchName,
} from "user-config.js";
import { getUserConfig } from "util/config.js";
import { parseJSON } from "util/io.js";
import { log } from "util/log.js";
import { PersistentDataDef } from "util/persistence.js";

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

const mergeSearch = (
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
  },
  params: {
    price: o.params?.price ?? base.params.price,
    minBedrooms: o.params?.minBedrooms ?? base.params.minBedrooms,
    pets: o.params?.pets ?? base.params.pets,
    exclude: o.params?.exclude ?? base.params.exclude,
    unreliableParams:
      o.params?.unreliableParams ?? base.params.unreliableParams,
  },
});

// Searches are re-resolved on every pass, so an unrunnable platform would
// otherwise be reported over and over.
const reportedUnavailablePlatforms = new Set<string>();

const resolvePlatforms = (name: string, config: StaticSearch) => {
  const requested = config.platforms ?? enabledPlatforms;
  const result = requested.filter((p) => enabledPlatforms.includes(p));
  for (const p of requested) {
    const key = `${name}-${p}`;
    if (!result.includes(p) && !reportedUnavailablePlatforms.has(key)) {
      reportedUnavailablePlatforms.add(key);
      log(
        `Search "${name}" asks for the ${p} platform, which partmin doesn't currently drive. Ignoring it.`
      );
    }
  }
  return result;
};

export const resolveSearches = (
  config: StaticUserConfig
): ResolvedSearch[] => {
  const resolve = (name: string, search: StaticSearch): ResolvedSearch => ({
    name,
    channelKey: searchChannelKey(name),
    config: search,
    platforms: resolvePlatforms(name, search),
  });

  return [
    resolve(primarySearchName, config.search),
    ...Object.entries(config.searches ?? {}).map(([name, override]) => {
      validateSearchName(name);
      return resolve(name, mergeSearch(config.search, override));
    }),
  ];
};

export const getSearches = async () => resolveSearches(await getUserConfig());

/**
 * The configured search names, read straight out of the config file. Channels
 * are named after searches and have to be set up before the config has
 * necessarily been filled in, which rules out the validating accessors.
 */
export const getSearchNamesForChannelSetup = () => {
  let raw: StaticUserConfig | undefined;
  try {
    raw = parseJSON<StaticUserConfig>(
      readFileSync(userConfigPath, { encoding: "utf-8" })
    );
  } catch {
    raw = undefined;
  }
  const extra = Object.keys(raw?.searches ?? {}).filter((name) => {
    try {
      validateSearchName(name);
      return true;
    } catch (e) {
      log(`Ignoring a configured search: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  });
  return [primarySearchName, ...extra];
};

// ------------------------------------------------------------
// per-search state

type SearchPersistent = {
  listings: PersistentDataDef<Listing[]>;
  ignore: PersistentDataDef<string[]>;
};

// One definition per search: each holds its own in-memory copy of the file it
// owns, so handing out a fresh one per call would serve stale reads.
const searchPersistent = new Map<string, SearchPersistent>();

export const getSearchPersistent = (
  search: Pick<ResolvedSearch, "name">
): SearchPersistent => {
  const cached = searchPersistent.get(search.name);
  if (cached) {
    return cached;
  }

  const isPrimary = search.name === primarySearchName;
  // The primary search keeps writing the un-namespaced files it always has, so
  // that upgrading doesn't lose its history and re-announce every listing.
  const dir = isPrimary ? undefined : getSearchDir(search.name);
  const label = (l: string) => (isPrimary ? l : `${l} (${search.name})`);

  const defs: SearchPersistent = {
    listings: new PersistentDataDef<Listing[]>({
      dir,
      path: `listings.json`,
      readTransform: parseJSON,
      writeTransform: JSON.stringify,
      label: label("all listings"),
    }),
    ignore: new PersistentDataDef<string[]>({
      dir,
      path: `ignore.json`,
      readTransform: parseJSON,
      writeTransform: JSON.stringify,
      label: label("ignored listings"),
    }),
  };

  searchPersistent.set(search.name, defs);
  return defs;
};

// ------------------------------------------------------------
// current search

// The retrieval loop works through the searches one at a time, and everything it
// calls into — platform scrapers, filters, embeds — needs that search's
// criteria. Rather than thread it through every one of those signatures, the
// loop announces which search is being run.
let currentSearch: ResolvedSearch | undefined;

export const setCurrentSearch = (s: ResolvedSearch | undefined) => {
  currentSearch = s;
};

export const getCurrentSearch = () => currentSearch;

/** The criteria of the search currently being run. */
export const getSearchConfig = async (): Promise<StaticSearch> =>
  // Outside the retrieval loop — the init routine, slash commands — there's no
  // search in flight, so answer for the primary one.
  currentSearch?.config ?? (await getUserConfig()).search;
