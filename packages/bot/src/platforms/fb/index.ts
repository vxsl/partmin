import { init, main, perListing } from "platforms/fb/ingest.js";
import { Platform } from "types/platform.js";
import { preprocessListings } from "../../process/index";

const fb: Platform = {
  name: "Facebook Marketplace",
  icon: "https://www.facebook.com/favicon.ico",
  callbacks: {
    init,
    main,
    perListing,
  },
  presenceActivities: {
    main: {
      emoji: "📰",
      message: "browsing facebook marketplace",
    },
    perListing: {
      emoji: "🧐",
      message: "carefully scrutinizing marketplace listings",
    },
  },
};

export default fb;
