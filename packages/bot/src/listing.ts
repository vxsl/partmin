import { petsBlacklist, searchParamsBlacklist } from "constants.js";
import { getSearchConfig, isRentalSearch } from "search.js";
import { PlatformKey } from "types/platform.js";
import {
  CommuteSummary,
  Coordinates,
  approxLocationLink,
  getCommuteSummary,
  isWithinRadii,
} from "util/geo.js";
import { debugLog } from "util/log.js";
import { conditionalSpreads, notUndefined } from "util/misc.js";

type InvalidReason =
  | "stale"
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
    date?: number;
    dateFallbackStr?: string;
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
  debugLog(`Invalidating listing ${l.id} due to ${reason}: ${message}`);
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
  const config = await getSearchConfig();
  if (origin && config.location?.commuteDestinations?.length) {
    for (const dest of config.location?.commuteDestinations) {
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

/**
 * Drops listings outside the configured search circles.
 *
 * Platforms only learn a listing's coordinates when the per-listing callback
 * visits its page, which happens after preprocessing — so preprocessing's radius
 * filter never sees them, and until this ran the only thing keeping listings
 * local was the radius handed to the platform's own search. That's no help for
 * Marketplace's city-wide feed, which ignores it.
 */
export const checkWithinSearchArea = async (l: Listing) => {
  if (!l.details.coords) {
    return;
  }
  if (await isWithinRadii(l.details.coords)) {
    return;
  }
  invalidateListing(
    l,
    "outsideSearch",
    `${
      l.details.shortAddress ?? Coordinates.toString(l.details.coords)
    } is outside the configured search area`
  );
};

type BlacklistEntry = string | RegExp;

const blacklistMatch = (v: BlacklistEntry, s: string | undefined) =>
  s === undefined ? false : typeof v === "string" ? s.includes(v) : s.match(v);

export const checkForBlacklist = async (l: Listing) => {
  const config = await getSearchConfig();
  const report = (v: BlacklistEntry, f: string) => `'${v}' in ${f}`;

  const desc = l.details.longDescription?.toLowerCase();
  const title = l.details.title?.toLowerCase();
  const loc = (l.details.longAddress ?? l.details.shortAddress)?.toLowerCase();

  // Pets, swaps, sublets and shared units are all properties of a place to
  // live. Applied to a search over, say, bicycles they'd only throw away
  // perfectly good listings for mentioning a dog.
  const isRental = isRentalSearch(config);

  const petsEntries = (
    isRental ? Object.entries(config.params.pets ?? {}) : []
  ).reduce<BlacklistEntry[]>((bl, [_k, v]) => {
    const k = _k as keyof typeof petsBlacklist;
    if (!v) return bl;
    return [...bl, ...(petsBlacklist[k] ?? [])];
  }, []);

  const result: string[] = [];
  for (const b of [
    ...petsEntries,
    ...conditionalSpreads([
      [petsEntries.length > 0, petsBlacklist.general],
      [isRental && config.params.exclude?.swaps, searchParamsBlacklist.swaps],
      [
        isRental && config.params.exclude?.sublets,
        searchParamsBlacklist.sublets,
      ],
      [isRental && config.params.exclude?.shared, searchParamsBlacklist.shared],
    ]),
    ...(config.blacklist?.map((b) => b.toLowerCase()) ?? []),
    ...(config.blacklistRegex?.map((b) => new RegExp(b, "i")) ?? []),
  ]) {
    if (blacklistMatch(b, desc)) result.push(report(b, "description"));
    if (blacklistMatch(b, title)) result.push(report(b, "title"));
    if (blacklistMatch(b, loc)) result.push(report(b, "location"));
  }

  if (result.length) {
    invalidateListing(l, "blacklisted", result.join(", "));
  }
};
