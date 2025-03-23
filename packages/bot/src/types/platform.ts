import { PresenceActivityDef } from "discord/presence.js";
import { Listing } from "listing.js";
import fb from "platforms/fb/index.js";
import kijiji from "platforms/kijiji/index.js";

export type PlatformKey = "kijiji" | "fb";
export type Platform = {
  name: string;
  icon: string;
  callbacks: {
    init?: () => Promise<void>;
    main: (
      processListings: (listings: Listing[]) => Promise<void>
    ) => Promise<Listing[] | undefined>;
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
};
