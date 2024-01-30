import config from "config.js";
import { petsBlacklist, searchParamsBlacklist } from "constants.js";
import { PlatformKey } from "types/platform.js";
import {
  CommuteSummary,
  Coordinates,
  approxLocationLink,
  getCommuteSummary,
} from "util/geo.js";

export type Item = {
  id: string;
  platform: PlatformKey;
  url: string;
  details: {
    title: string;
    price?: number;
    longDescription?: string;
    shortAddress?: string;
    longAddress?: string;
    coords?: Coordinates;
  };
  computed?: {
    locationLinkMD?: string;
    bulletPoints?: string[];
    distanceTo?: Record<string, CommuteSummary>;
  };
  imgURLs: string[];
  videoURLs: string[];
};

export interface SeenItemDict {
  [k: string]: 1 | undefined;
}

export const addLocationLink = async (item: Item) => {
  if (!item.computed?.locationLinkMD && item.details.coords) {
    item.computed = {
      ...(item.computed ?? {}),
      locationLinkMD: await approxLocationLink(item.details.coords),
    };
  }
};

export const getCommuteOrigin = (item: Item) =>
  (item.details.coords
    ? Coordinates.toString(item.details.coords, { raw: true })
    : undefined) ??
  (item.details.longAddress || item.details.shortAddress);

export const addCommuteSummary = async (item: Item) => {
  const origin = getCommuteOrigin(item);
  if (origin && config.options?.computeDistanceTo?.length) {
    for (const dest of config.options?.computeDistanceTo) {
      await getCommuteSummary(origin, dest).then((summ) => {
        if (summ) {
          item.computed = {
            ...(item.computed ?? {}),
            distanceTo: {
              ...(item.computed?.distanceTo ?? {}),
              [dest]: summ,
            },
          };
        }
      });
    }
  }
};

type BlacklistEntry = string | RegExp;

const blacklistMatch = (v: BlacklistEntry, s: string | undefined) =>
  s === undefined ? false : typeof v === "string" ? s.includes(v) : s.match(v);

export const getBlacklistedString = ({
  id,
  details,
}: Item): string | undefined => {
  const report = (v: BlacklistEntry, f: string) =>
    `'${v}' in item ${id}'s ${f}`;

  const desc = details.longDescription?.toLowerCase();
  const title = details.title?.toLowerCase();
  const loc = (details.longAddress ?? details.shortAddress)?.toLowerCase();

  const check = (els: BlacklistEntry[] | undefined) => {
    for (const b of els ?? []) {
      if (blacklistMatch(b, desc)) return report(b, "description");
      if (blacklistMatch(b, title)) return report(b, "title");
      if (blacklistMatch(b, loc)) return report(b, "location");
    }
  };

  const petsEntries = Object.entries(config.search.params.pets ?? {}).reduce<
    BlacklistEntry[]
  >((bl, [k, v]) => {
    if (!v) return bl;
    return [...bl, ...petsBlacklist[k]];
  }, []);

  return check([
    ...petsEntries,
    ...(petsEntries.length > 0 && petsBlacklist.general),
    ...(config.search.params.excludeSwaps &&
      searchParamsBlacklist.excludeSwaps),
    ...(config.search.params.excludeSublets &&
      searchParamsBlacklist.excludeSublets),
    ...(config.search.params.excludeShared &&
      searchParamsBlacklist.excludeShared),
    ...config.search.blacklist?.map((b) => b.toLowerCase()),
    ...config.search.blacklistRegex.map((b) => new RegExp(b, "i")),
  ]);
};
