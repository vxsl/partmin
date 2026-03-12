import { main, perListing } from "platforms/craigslist/ingest.js";
import { Platform } from "types/platform.js";

const craigslist: Platform = {
  name: "Craigslist",
  icon: "https://www.craigslist.org/favicon.ico",
  callbacks: {
    main,
    perListing,
  },
  presenceActivities: {
    main: {
      emoji: "🗞️",
      message: "scanning craigslist RSS feed",
    },
    perListing: {
      emoji: "🧐",
      message: "carefully scrutinizing craigslist listings",
    },
  },
};

export default craigslist;
