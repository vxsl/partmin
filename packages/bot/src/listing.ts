import { petsBlacklist, searchParamsBlacklist } from "constants.js";
import { PlatformKey } from "types/platform.js";
import { getConfig } from "util/config.js";
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
    locationLinkText?: string;
    locationLinkURL?: string;
    locationLinkIsApproximate?: boolean;
    bulletPoints?: BulletPoint[];
    commuteDestinations?: Record<string, CommuteSummary>;
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
  l.computed = {
    ...(l.computed ?? {}),
    bulletPoints: [
      ...(l.computed?.bulletPoints ?? []),
      ...(Array.isArray(_points) ? _points : [_points]).filter((p) => {
        const v =
          typeof p === "string" ? p : p && "value" in p ? p.value : undefined;
        return v !== null && v !== undefined && v !== "";
      }),
    ],
  };
};

export const ensureLocationLink = async (l: Listing) => {
  if (
    !l.computed?.locationLinkText &&
    !l.computed?.locationLinkURL &&
    l.details.coords
  ) {
    const link = await approxLocationLink(l.details.coords);
    l.computed = {
      ...(l.computed ?? {}),
      locationLinkIsApproximate: true,
      locationLinkText: link.text,
      locationLinkURL: link.url,
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
  const config = await getConfig();
  if (origin && config.options?.commuteDestinations?.length) {
    for (const dest of config.options?.commuteDestinations) {
      await getCommuteSummary(origin, dest).then((summ) => {
        if (summ) {
          l.computed = {
            ...(l.computed ?? {}),
            commuteDestinations: {
              ...(l.computed?.commuteDestinations ?? {}),
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

export const checkForBlacklist = async (l: Listing) => {
  const config = await getConfig();
  const report = (v: BlacklistEntry, f: string) => `'${v}' in ${f}`;

  const desc = l.details.longDescription?.toLowerCase();
  const title = l.details.title?.toLowerCase();
  const loc = (l.details.longAddress ?? l.details.shortAddress)?.toLowerCase();

  const petsEntries = Object.entries(config.search.params.pets ?? {}).reduce<
    BlacklistEntry[]
  >((bl, [_k, v]) => {
    const k = _k as keyof typeof petsBlacklist;
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
