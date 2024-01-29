import config from "config.js";
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
