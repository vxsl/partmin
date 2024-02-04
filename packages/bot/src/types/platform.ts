import { WebDriver } from "selenium-webdriver";
import { Listing } from "listing.js";
import kijiji from "platforms/kijiji/index.js";
import fb from "platforms/fb/index.js";

export type PlatformKey = "kijiji" | "fb";
export type Platform = {
  main: (d: WebDriver) => Promise<Listing[] | undefined>;
  onSearchParamsChanged?: (d: WebDriver) => Promise<void>;
  perListing?: (d: WebDriver, i: Listing) => Promise<void>;
  icon: string;
  name: string;
};

export const platforms: Record<PlatformKey, Platform> = {
  kijiji,
  fb,
};
