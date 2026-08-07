import { getSearchDir } from "constants.js";
import type { Listing } from "listing.js";
import {
  ResolvedSearch,
  readRawSearchNames,
  resolveSearches,
} from "search-resolution.js";
import {
  StaticSearch,
  primarySearchName,
  validateSearchName,
} from "user-config.js";
import { getUserConfig } from "util/config.js";
import { parseJSON } from "util/io.js";
import { log } from "util/log.js";
import { PersistentDataDef } from "util/persistence.js";

export {
  enabledPlatforms,
  isCityWideSearch,
  isRentalSearch,
  maxListingAgeMinutes,
  type ResolvedSearch,
} from "search-resolution.js";

// Searches are re-resolved on every pass, so an unrunnable platform would
// otherwise be reported over and over.
const reportedUnavailablePlatforms = new Set<string>();

export const getSearches = async () =>
  resolveSearches(await getUserConfig(), {
    onUnavailablePlatform: (search, platform) => {
      const key = `${search}-${platform}`;
      if (reportedUnavailablePlatforms.has(key)) return;
      reportedUnavailablePlatforms.add(key);
      log(
        `Search "${search}" asks for the ${platform} platform, which partmin doesn't currently drive. Ignoring it.`
      );
    },
  });

/** The configured search names, for deciding which channels partmin manages. */
export const getSearchNamesForChannelSetup = () => [
  primarySearchName,
  ...readRawSearchNames().filter((name) => {
    try {
      validateSearchName(name);
      return true;
    } catch (e) {
      log(
        `Ignoring a configured search: ${e instanceof Error ? e.message : e}`
      );
      return false;
    }
  }),
];

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
