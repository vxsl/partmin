import { dataDir } from "constants.js";
import { Listing } from "listing.js";
import { CacheDef } from "util/cache.js";

export const processCache = {
  listings: new CacheDef<Listing[]>({
    path: `${dataDir}/listings.json`,
    readTransform: (v) => JSON.parse(v),
    writeTransform: (v) => JSON.stringify(v),
    label: "all listings",
  }),
};
