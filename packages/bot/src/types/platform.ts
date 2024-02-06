import { PresenceActivityDef } from "discord/presence.js";
import { Listing } from "listing.js";
import fb from "platforms/fb/index.js";
import kijiji from "platforms/kijiji/index.js";
import { WebDriver } from "selenium-webdriver";

export type PlatformKey = "kijiji" | "fb";
export type Platform = {
  name: string;
  icon: string;
  callbacks: {
    main: (d: WebDriver) => Promise<Listing[] | undefined>;
    onSearchParamsChanged?: (d: WebDriver) => Promise<void>;
    perListing?: (d: WebDriver, i: Listing) => Promise<void>;
  };
  presenceActivities?: Partial<{
    [k: string]: PresenceActivityDef;
  }>;
};
export const platforms: Record<PlatformKey, Platform> = {
  kijiji,
  fb,
};
