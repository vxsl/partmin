import {
  StaticAdvancedConfig,
  advancedConfigPath,
  validateAdvancedConfig,
} from "advanced-config.js";
import { ChannelIDs } from "discord/index.js";
import { Listing } from "listing.js";
import {
  StaticUserConfig,
  userConfigPath,
  validateUserConfig,
} from "user-config.js";
import { dynamicValidateUserConfig } from "util/config.js";
import { City, CommuteSummary } from "util/geo.js";
import { parseJSON } from "util/io.js";
import { PersistentDataDef, PersistentStringDef } from "util/persistence.js";

const persistent = {
  // ---------------------------------------
  // config
  advancedConfig: new PersistentDataDef<StaticAdvancedConfig>({
    label: "advanced config",
    absolutePath: advancedConfigPath,
    readTransform: parseJSON,
    writeTransform: (v) => JSON.stringify(v, null, 2),
    validate: (c) => {
      validateAdvancedConfig(c);
      return true;
    },
  }),
  cachedUserConfig: new PersistentDataDef<StaticUserConfig>({
    label: "cached user configuration",
    path: `user-config-cached.json`,
    validate: async (c) => {
      validateUserConfig(c);
      await dynamicValidateUserConfig(c);
      return true;
    },
    readTransform: parseJSON,
    writeTransform: (v) => JSON.stringify(v, null, 2),
  }),
  userConfig: new PersistentDataDef<StaticUserConfig>({
    absolutePath: userConfigPath,
    readTransform: parseJSON,
    writeTransform: (v) => JSON.stringify(v, null, 2),
    label: "user configuration",
    validate: async (c) => {
      validateUserConfig(c);
      await dynamicValidateUserConfig(c);
      return true;
    },
  }),
  // ---------------------------------------
  // geo
  commuteSummaries: new PersistentDataDef<
    Record<string, Record<string, CommuteSummary>>
  >({
    path: `commute-summaries.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "commute summaries",
    common: true,
  }),
  addressValidity: new PersistentDataDef<{ [k: string]: boolean }>({
    path: `address-validity.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "address validity",
    common: true,
  }),
  approximateAddresses: new PersistentDataDef<{
    [k: string]: [string, string];
  }>({
    path: `approximate-addresses.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "address approximations",
    common: true,
  }),
  cities: new PersistentDataDef<{
    [k: string]: City;
  }>({
    path: `cities.json`,
    readTransform: parseJSON,
    writeTransform: (v) => {
      const result: Record<string, City> = {};
      for (const [k, c] of Object.entries(v)) {
        result[k.toLowerCase()] = c as City;
      }
      return JSON.stringify(result);
    },
    label: "cities",
    common: true,
  }),
  googleMapsAPIKey: new PersistentStringDef({
    path: `google-maps-api-key`,
    label: "Google Maps API key",
    envVar: "GOOGLE_MAPS_API_KEY",
    common: true,
  }),

  // ---------------------------------------
  // process
  listings: new PersistentDataDef<Listing[]>({
    path: `listings.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "all listings",
  }),

  // ---------------------------------------
  // kijiji
  kijijiRSS: new PersistentStringDef({
    path: `kijiji-rss-url`,
    label: "Kijiji RSS feed URL",
    common: true,
  }),

  // ---------------------------------------
  // discord
  discordAppID: new PersistentStringDef({
    path: `discord-app-id`,
    envVar: "DISCORD_APP_ID",
    label: "Discord app ID",
    common: true,
  }),
  channelIDs: new PersistentDataDef<ChannelIDs>({
    path: `channel-ids.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "channel IDs",
  }),
  botToken: new PersistentStringDef({
    path: `bot-token`,
    envVar: "DISCORD_BOT_TOKEN",
    label: "bot token",
    common: true,
  }),
};

export default persistent;
