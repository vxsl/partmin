import { devOptions } from "advanced-config.js";
import {
  ActivityType,
  ChannelType,
  MessageCreateOptions,
  MessageFlags,
  PermissionsBitField,
  PresenceData,
} from "discord.js";
import { PresenceActivityDef } from "discord/presence.js";
import { load } from "dotenv-mono";
import { primarySearchName } from "user-config.js";
import { envVarInstruction, readableSeconds } from "util/string.js";

load();

// ------------------------------------------------------------
// misc. constants

const guildIDEnvVar = "DISCORD_SERVER_ID";
export const discordGuildID = process.env[guildIDEnvVar]!;
if (!discordGuildID) {
  console.log(
    `Your Discord server is not set up. To configure it, please retrieve your server's ID:\n - open Discord\n - right-click your server in the sidebar\n - Server Settings\n - Widget \n - SERVER ID\n\n${envVarInstruction(
      guildIDEnvVar
    )}\n\nNote that partmin will create channels in this server, so make sure you have the necessary permissions to do so.`
  );
  process.exit(1);
}

export const requiredPermissions = new PermissionsBitField(
  BigInt(1084815309904)
);
export const maxEmbedLength = 2048;
export const maxFieldLength = 1024;
export const maxMessagesToFetchAtOnce = 100;
export const fatalErrorColor = "#ff0000";
export const warningColor = "#ebb734";
export const errorColor = "#732f2f";
export const successColor = "#4a874a";
export const editColor = "#2f4a73";
export const primaryColor = "#2f73a8";
export const secondaryColor = "#383838";

// ------------------------------------------------------------
// channels

const prodChannelKeys = ["main-category", "listings", "logs"] as const;
const testChannelKeys = prodChannelKeys.map((k) => `test-${k}` as const);
type ProdChannelKey = (typeof prodChannelKeys)[number];
type TestChannelKey = (typeof testChannelKeys)[number];
// Every search past the first contributes a listings channel whose key is only
// known at runtime, so the key type stays open. The literals are kept in the
// union purely so that the fixed channels still autocomplete.
export type ChannelKey = ProdChannelKey | TestChannelKey | (string & {});

type BaseChannelDef<IsCategory extends boolean> = {
  defaultName: string;
} & (IsCategory extends true
  ? {
      type: ChannelType.GuildCategory;
      topic?: undefined;
      parent?: undefined;
      msgFlags?: undefined;
    }
  : {
      type: ChannelType.GuildText;
      topic: string;
      parent?: ChannelKey;
      msgFlags?: MessageCreateOptions["flags"];
    });
export type ChannelDef = BaseChannelDef<true> | BaseChannelDef<false>;
export type CategoryDef = BaseChannelDef<true>;
export type TextChannelDef = BaseChannelDef<false>;

export const prodChannelDefs: Record<ProdChannelKey, ChannelDef> = {
  "main-category": {
    defaultName: "🏘 partmin",
    type: ChannelType.GuildCategory,
  },
  listings: {
    defaultName: "🌇",
    type: ChannelType.GuildText,
    topic: `@partmin created this channel. This is where you'll find listings that match your search criteria.`,
    parent: "main-category",
  },
  logs: {
    defaultName: "logs",
    type: ChannelType.GuildText,
    msgFlags: MessageFlags.SuppressNotifications,
    topic:
      "@partmin created this channel. Here you can take a look at the logs of the bot.",
    parent: "main-category",
  },
};

export const testChannelDefs: Record<TestChannelKey, ChannelDef> = {
  "test-main-category": {
    defaultName: "partmin-test",
    type: ChannelType.GuildCategory,
  },
  "test-listings": {
    defaultName: "🧪┃listings-test",
    type: ChannelType.GuildText,
    msgFlags: MessageFlags.SuppressNotifications,
    topic: `[test] ${prodChannelDefs.listings.topic}`,
    parent: "test-main-category",
  },
  "test-logs": {
    defaultName: "🔬┃logs-test",
    type: ChannelType.GuildText,
    msgFlags: MessageFlags.SuppressNotifications,
    topic: `[test] ${prodChannelDefs.logs.topic}`,
    parent: "test-main-category",
  },
};

// ------------------------------------------------------------
// per-search listings channels

const listingsChannelKey = (name: string, testing: boolean): ChannelKey =>
  `${testing ? "test-" : ""}${
    name === primarySearchName ? "listings" : `listings-${name}`
  }`;

/** The channel a given search's listings are announced in. */
export const searchChannelKey = (name: string) =>
  listingsChannelKey(name, !!devOptions.testing);

const searchChannelDef = (name: string, testing: boolean): ChannelDef => ({
  defaultName: `${testing ? "🧪" : "🌇"}┃${name}`,
  type: ChannelType.GuildText,
  topic: `${
    testing ? "[test] " : ""
  }@partmin created this channel. This is where you'll find listings that match your "${name}" search.`,
  parent: testing ? "test-main-category" : "main-category",
  ...(testing && { msgFlags: MessageFlags.SuppressNotifications }),
});

// Keyed by plain string rather than ChannelKey: the per-search keys aren't known
// until the config has been read, so requiring the fixed ones to be present
// would only get in the way.
export type ChannelDefs = Record<string, ChannelDef>;

const buildChannelDefs = (searchNames: string[]): ChannelDefs => {
  const defs: ChannelDefs = { ...prodChannelDefs };
  const addSearchChannels = (testing: boolean) => {
    for (const name of searchNames) {
      // the primary search's channel is `listings`, already defined above
      if (name === primarySearchName) continue;
      defs[listingsChannelKey(name, testing)] = searchChannelDef(name, testing);
    }
  };
  addSearchChannels(false);
  if (devOptions.testing) {
    Object.assign(defs, testChannelDefs);
    addSearchChannels(true);
  }
  return defs;
};

// The set of channels partmin manages depends on the configured searches, so it
// can only be assembled once the config has been read. Until then, callers
// looking up a fixed channel still get what they expect.
let channelDefs: ChannelDefs = {
  ...prodChannelDefs,
  ...testChannelDefs,
};

export const defineChannelDefs = (searchNames: string[]) => {
  channelDefs = buildChannelDefs(searchNames);
  return channelDefs;
};

export const getChannelDefs = () => channelDefs;

// ------------------------------------------------------------
// presence

const presenceKeys = [
  "launching",
  "online",
  "shuttingDown",
  "offline",
] as const;
type PresenceKey = (typeof presenceKeys)[number];
export const presences: Record<PresenceKey, PresenceData> = {
  launching: {
    status: "online",
    activities: [
      {
        name: "⏳ initializing...",
        type: ActivityType.Custom,
      },
    ],
  },
  online: {
    status: "online",
    activities: [
      {
        name: "👋 online",
        type: ActivityType.Custom,
      },
    ],
  },
  shuttingDown: {
    status: "online",
    activities: [
      {
        name: "⛔ shutting down...",
        type: ActivityType.Custom,
      },
    ],
  },
  offline: {
    status: "invisible",
  },
};

const presenceActivityKeys = ["processing", "notifying", "waiting"] as const;
type PresenceActivityKey = (typeof presenceActivityKeys)[number];
export const presenceActivities: Record<
  PresenceActivityKey,
  PresenceActivityDef
> = {
  processing: {
    emoji: "🔄",
    message: ({ max }) =>
      `processing/filtering ${max} new listing${max === 1 ? "" : "s"}...`,
  },
  notifying: {
    emoji: "💌",
    message: ({ max }) =>
      `sending ${max} new listing${max === 1 ? "" : "s"} your way!`,
  },
  waiting: {
    emoji: `⏳`,
    message: ({ max }) => `pausing for ${readableSeconds(max)}`,
    customProgress: ({ cur, max }) => `<${readableSeconds(max - cur)} left`,
  },
};
