import { dataDir } from "constants.js";
import { GuildInfo } from "discord/index.js";
import { CacheDef, StringCacheDef } from "util/cache.js";
import { parseJSON } from "util/io.js";

export const discordCache = {
  appID: new StringCacheDef({
    path: `${dataDir}/discord-app-id`,
    envVar: "DISCORD_APP_ID",
    label: "Discord app ID",
  }),
  guildID: new StringCacheDef({
    path: `${dataDir}/discord-server-id`,
    envVar: "DISCORD_SERVER_ID",
    label: "Discord guild ID",
  }),
  guildInfo: new CacheDef<GuildInfo>({
    path: `${dataDir}/discord-guild-info.json`,
    readTransform: parseJSON,
    writeTransform: JSON.stringify,
    label: "Discord guild info",
  }),
  botToken: new StringCacheDef({
    path: `${dataDir}/discord-bot-token`,
    envVar: "DISCORD_BOT_TOKEN",
    label: "Discord bot token",
  }),
};
