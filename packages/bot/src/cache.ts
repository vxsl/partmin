import { dataDir } from "constants.js";
import { GuildInfo } from "discord/index.js";
import { Listing } from "listing.js";
import { CacheDef, StringCacheDef } from "util/cache.js";
import { parseJSON } from "util/io.js";

const cache = {
  // ---------------------------------------
  // process
  listings: new CacheDef<Listing[]>({
    path: `${dataDir}/listings.json`,
    readTransform: (v) => JSON.parse(v),
    writeTransform: (v) => JSON.stringify(v),
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
