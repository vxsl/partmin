import { StaticConfig } from "config.js";
import { dataDir } from "constants.js";
import { GuildInfo } from "discord/index.js";
import { Listing } from "listing.js";
import { CacheDef, StringCacheDef } from "util/cache.js";
import { CommuteSummary } from "util/geo.js";
import { parseJSON } from "util/io.js";

const cache = {
  // ---------------------------------------
  // config
  config: new CacheDef<StaticConfig>({
    path: `${dataDir}/config-cached.json`,
    readTransform: (c) => {
      const parsed = parseJSON<StaticConfig>(c);
      // prevalidateConfig(parsed);
      // validateConfig(parsed);
      return parsed;
    },
    writeTransform: (c) => {
      // prevalidateConfig(c);
      // validateConfig(c);
      return JSON.stringify(c);
    },
    label: "config",
  }),
  // ---------------------------------------
  // geo
  commuteSummaries: new CacheDef<
    Record<string, Record<string, CommuteSummary>>
  >({
    path: `${dataDir}/commute-summaries.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "commute summaries",
  }),
  addressValidity: new CacheDef<{ [k: string]: boolean }>({
    path: `${dataDir}/address-validity.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "address validity",
  }),
  approximateAddresses: new CacheDef<{ [k: string]: [string, string] }>({
    path: `${dataDir}/approximate-addresses.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "address approximations",
  }),
  googleMapsAPIKey: new StringCacheDef({
    path: `${dataDir}/google-maps-api-key`,
    label: "Google Maps API key",
    envVar: "GOOGLE_MAPS_API_KEY",
  }),

  // ---------------------------------------
  // process
  listings: new CacheDef<Listing[]>({
    path: `${dataDir}/listings.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "all listings",
  }),

  // ---------------------------------------
  // kijiji
  kijijiRSS: new StringCacheDef({
    path: `${dataDir}/kijiji-rss-url`,
    label: "Kijiji RSS feed URL",
  }),

  // ---------------------------------------
  // discord
  discordAppID: new StringCacheDef({
    path: `${dataDir}/discord-app-id`,
    envVar: "DISCORD_APP_ID",
    label: "Discord app ID",
  }),
  discordGuildID: new StringCacheDef({
    path: `${dataDir}/discord-server-id`,
    envVar: "DISCORD_SERVER_ID",
    label: "Discord guild ID",
  }),
  discordGuildInfo: new CacheDef<GuildInfo>({
    path: `${dataDir}/discord-guild-info.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "Discord guild info",
  }),
  discordBotToken: new StringCacheDef({
    path: `${dataDir}/discord-bot-token`,
    envVar: "DISCORD_BOT_TOKEN",
    label: "Discord bot token",
  }),
};

export default cache;
