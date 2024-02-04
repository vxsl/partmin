import { dataDir } from "constants.js";
import { StringCacheDef } from "util/cache.js";

export const kijijiCache = {
  rss: new StringCacheDef({
    path: `${dataDir}/kijiji-rss-url`,
    label: "Kijiji RSS feed URL",
  }),
};
