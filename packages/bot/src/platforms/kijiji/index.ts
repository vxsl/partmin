import {
  main,
  onSearchParamsChanged,
  perListing,
} from "platforms/kijiji/ingest.js";
import { Platform } from "types/platform.js";

const kijiji: Platform = {
  name: "Kijiji",
  icon: "https://www.kijiji.ca/favicon.ico",
  callbacks: {
    onSearchParamsChanged,
    main,
    perListing,
  },
  presenceActivities: {
    main: {
      emoji: "🗞️",
      message: "swiftly glancing at kijiji RSS feed",
    },
    perListing: {
      emoji: "🧐",
      message: "carefully scrutinizing kijiji listings",
    },
  },
};

export default kijiji;
