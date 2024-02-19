import {
  StaticAdvancedConfig,
  advancedConfigPath,
  devOptions,
  validateAdvancedConfig,
} from "advanced-config.js";
import { ChannelIDs } from "discord/index.js";
import { writeFileSync } from "fs";
import { Listing } from "listing.js";
import {
  StaticUserConfig,
  userConfigPath,
  validateUserConfig,
} from "user-config.js";
import { CacheDef, StringCacheDef } from "util/cache.js";
import { dynamicValidateUserConfig } from "util/config.js";
import { CommuteSummary } from "util/geo.js";
import { parseJSON } from "util/io.js";
import { log } from "util/log.js";

const cache = {
  // ---------------------------------------
  // config
  advancedConfig: new CacheDef<StaticAdvancedConfig>({
    label: "advanced config",
    path: advancedConfigPath,
    absolutePath: true,
    readTransform: parseJSON,
    writeTransform: (v) => {
      if (!devOptions.preventConfigOverwrite) {
        log(
          "The advanced config file is being overwritten, since 'preventConfigOverwrite' is not set."
        );
        writeFileSync(
          "../../config/advanced-config.json",
          JSON.stringify(v, null, 2)
        );
      } else {
        log(
          "WARNING: The advanced config file will not be overwritten, since 'preventConfigOverwrite' is set."
        );
      }
      return JSON.stringify(v);
    },
    validate: (c) => {
      validateAdvancedConfig(c);
      return true;
    },
  }),
  cachedAdvancedConfig: new CacheDef<StaticAdvancedConfig>({
    label: "cached advanced config",
    path: `advanced-config-cached.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    validate: (c) => {
      validateAdvancedConfig(c);
      return true;
    },
  }),
  cachedUserConfig: new CacheDef<StaticUserConfig>({
    label: "config",
    path: `user-config-cached.json`,
    validate: async (c) => {
      validateUserConfig(c);
      await dynamicValidateUserConfig(c);
      return true;
    },
    readTransform: parseJSON,
    writeTransform: (v) => {
      if (!devOptions.preventConfigOverwrite) {
        log(
          "The user config file is being overwritten, since 'preventConfigOverwrite' is not set."
        );
        writeFileSync("../../config/config.json", JSON.stringify(v, null, 2));
      } else {
        log(
          "WARNING: The user config file will not be overwritten, since 'preventConfigOverwrite' is set."
        );
      }
      return JSON.stringify(v);
    },
  }),
  userConfig: new CacheDef<StaticUserConfig>({
    absolutePath: true,
    path: userConfigPath,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "user configuration",
    validate: async (c) => {
      validateUserConfig(c);
      await dynamicValidateUserConfig(c);
      return true;
    },
  }),
  // ---------------------------------------
  // geo
  commuteSummaries: new CacheDef<
    Record<string, Record<string, CommuteSummary>>
  >({
    path: `commute-summaries.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "commute summaries",
    common: true,
  }),
  addressValidity: new CacheDef<{ [k: string]: boolean }>({
    path: `address-validity.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "address validity",
    common: true,
  }),
  approximateAddresses: new CacheDef<{ [k: string]: [string, string] }>({
    path: `approximate-addresses.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "address approximations",
    common: true,
  }),
  googleMapsAPIKey: new StringCacheDef({
    path: `google-maps-api-key`,
    label: "Google Maps API key",
    envVar: "GOOGLE_MAPS_API_KEY",
    common: true,
  }),

  // ---------------------------------------
  // process
  listings: new CacheDef<Listing[]>({
    path: `listings.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "all listings",
  }),

  // ---------------------------------------
  // kijiji
  kijijiRSS: new StringCacheDef({
    path: `kijiji-rss-url`,
    label: "Kijiji RSS feed URL",
    common: true,
  }),

  // ---------------------------------------
  // discord
  discordAppID: new StringCacheDef({
    path: `discord-app-id`,
    envVar: "DISCORD_APP_ID",
    label: "Discord app ID",
    common: true,
  }),
  channelIDs: new CacheDef<ChannelIDs>({
    path: `channel-ids.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "channel IDs",
  }),
  botToken: new StringCacheDef({
    path: `bot-token`,
    envVar: "DISCORD_BOT_TOKEN",
    label: "bot token",
    common: true,
  }),
};

export default cache;
