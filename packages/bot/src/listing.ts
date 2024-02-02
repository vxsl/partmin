import config from "config.js";
import { petsBlacklist, searchParamsBlacklist } from "constants.js";
import { PlatformKey } from "types/platform.js";
import { conditionalSpreads } from "util/data.js";
import {
  CommuteSummary,
  Coordinates,
  approxLocationLink,
  getCommuteSummary,
} from "util/geo.js";
import { notUndefined } from "util/misc.js";

type InvalidReason =
  | "blacklisted"
  | "outsideSearch"
  | "paramsMismatch"
  | "unreliableParamsMismatch";

type BulletPoint = string | { key: string; value: string };

export type Listing = {
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
    bulletPoints?: BulletPoint[];
    distanceTo?: Record<string, CommuteSummary>;
  };
  imgURLs: string[];
  videoURLs: string[];
  invalidDueTo?: { [k in InvalidReason]?: string };
};

export const isValid = (l: Listing) =>
  Object.values(l.invalidDueTo ?? {}).filter(notUndefined).length === 0;

export interface SeenListingDict {
  [k: string]: 1 | undefined;
}

export const invalidateListing = (
  l: Listing,
  reason: InvalidReason,
  message: string
) => {
  l.invalidDueTo = {
    ...(l.invalidDueTo ?? {}),
    [reason]: message,
  };
};

export const addBulletPoints = (
  l: Listing,
  _points: BulletPoint | BulletPoint[]
) => {
  const points = Array.isArray(_points) ? _points : [_points];
  l.computed = {
    ...(l.computed ?? {}),
    bulletPoints: [...(l.computed?.bulletPoints ?? []), ...points],
  };
};

export const addLocationLink = async (l: Listing) => {
  if (!l.computed?.locationLinkMD && l.details.coords) {
    l.computed = {
      ...(l.computed ?? {}),
      locationLinkMD: await approxLocationLink(l.details.coords),
    };
  }
};

export const getCommuteOrigin = (l: Listing) =>
  (l.details.coords
    ? Coordinates.toString(l.details.coords, { raw: true })
    : undefined) ??
  (l.details.longAddress || l.details.shortAddress);

export const addCommuteSummary = async (l: Listing) => {
  const origin = getCommuteOrigin(l);
  if (origin && config.options?.computeDistanceTo?.length) {
    for (const dest of config.options?.computeDistanceTo) {
      await getCommuteSummary(origin, dest).then((summ) => {
        if (summ) {
          l.computed = {
            ...(l.computed ?? {}),
            distanceTo: {
              ...(l.computed?.distanceTo ?? {}),
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

export const checkForBlacklist = (l: Listing) => {
  const report = (v: BlacklistEntry, f: string) => `'${v}' in ${f}`;

  const desc = l.details.longDescription?.toLowerCase();
  const title = l.details.title?.toLowerCase();
  const loc = (l.details.longAddress ?? l.details.shortAddress)?.toLowerCase();

  const petsEntries = Object.entries(config.search.params.pets ?? {}).reduce<
    BlacklistEntry[]
  >((bl, [k, v]) => {
    if (!v) return bl;
    return [...bl, ...(petsBlacklist[k] ?? [])];
  }, []);

  const result: string[] = [];
  for (const b of [
    ...petsEntries,
    ...conditionalSpreads([
      [petsEntries.length > 0, petsBlacklist.general],
      [config.search.params.exclude?.swaps, searchParamsBlacklist.swaps],
      [config.search.params.exclude?.sublets, searchParamsBlacklist.sublets],
      [config.search.params.exclude?.shared, searchParamsBlacklist.shared],
    ]),
    ...(config.search.blacklist?.map((b) => b.toLowerCase()) ?? []),
    ...(config.search.blacklistRegex?.map((b) => new RegExp(b, "i")) ?? []),
  ]) {
    if (blacklistMatch(b, desc)) result.push(report(b, "description"));
    if (blacklistMatch(b, title)) result.push(report(b, "title"));
    if (blacklistMatch(b, loc)) result.push(report(b, "location"));
  }

  if (result.length) {
    invalidateListing(l, "blacklisted", result.join(", "));
  }
};
