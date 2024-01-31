import { WebDriver } from "selenium-webdriver";
import { Listing } from "listing.js";

export type PlatformKey = "kijiji" | "fb";
export type Platform = {
  key: PlatformKey;
  main: (d: WebDriver) => Promise<Listing[] | undefined>;
  prepare?: (d: WebDriver, configChanged?: boolean) => Promise<void>;
  perListing?: (d: WebDriver, i: Listing) => Promise<void>;
};
