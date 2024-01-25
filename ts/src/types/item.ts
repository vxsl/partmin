import { PlatformKey } from "types/platform.js";

export type Item = {
  id: string;
  platform: PlatformKey;
  url: string;
  details: {
    title: string;
    price?: number;
    longDescription?: string;
    location?: string;
    lat?: number;
    lon?: number;
  };
  computed?: {
    locationLinkMD?: string;
    bulletPoints?: string[];
  };
  imgURLs: string[];
  videoURLs: string[];
};

export interface SeenItemDict {
  [k: string]: 1 | undefined;
}
