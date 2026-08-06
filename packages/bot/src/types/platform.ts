import { PresenceActivityDef } from "discord/presence.js";
import { Listing } from "listing.js";
import craigslist from "platforms/craigslist/index.js";
import fb from "platforms/fb/index.js";
import kijiji from "platforms/kijiji/index.js";
import type { PlatformKey } from "user-config.js";

// Declared alongside the config runtype that validates it, so that a search can
// name a platform without this module having to be imported to check it.
export type { PlatformKey };
export type Platform = {
  name: string;
  icon: string;
  callbacks: {
    init?: () => Promise<void>;
    main: (
      processListings: (listings: Listing[]) => Promise<void>
    ) => Promise<void>;
    onSearchParamsChanged?: () => Promise<void>;
    perListing?: (i: Listing) => Promise<void>;
  };
  presenceActivities?: Partial<{
    [k: string]: PresenceActivityDef;
  }>;
};
export const platforms: Record<PlatformKey, Platform> = {
  kijiji,
  fb,
  craigslist,
};
