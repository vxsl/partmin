import {
  ActivityType,
  ChannelType,
  MessageCreateOptions,
  MessageFlags,
  PermissionsBitField,
  PresenceData,
} from "discord.js";
import { PresenceActivityDef } from "discord/presence.js";
import { readableSeconds } from "util/data.js";

// ------------------------------------------------------------
// misc. constants

export const requiredPermissions = new PermissionsBitField(
  BigInt(1084815309904)
);
export const maxEmbedLength = 2048;
export const maxFieldLength = 1024;

// ------------------------------------------------------------
// channels

const prodChannelKeys = ["main-category", "listings", "logs"] as const;
const testChannelKeys = prodChannelKeys.map((k) => `test-${k}` as const);
type ProdChannelKey = (typeof prodChannelKeys)[number];
type TestChannelKey = (typeof testChannelKeys)[number];
export type ChannelKey = ProdChannelKey | TestChannelKey;

type BaseChannelDef<Prod extends boolean, IsCategory extends boolean> = {
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
      parent?: Prod extends true ? ProdChannelKey : TestChannelKey;
      msgFlags?: MessageCreateOptions["flags"];
    });
type ProdChannelDef = BaseChannelDef<true, true | false>;
type TestChannelDef = BaseChannelDef<false, true | false>;
export type ChannelDef = ProdChannelDef | TestChannelDef;
export type CategoryDef = ProdChannelDef & { type: ChannelType.GuildCategory };
export type TextChannelDef = ProdChannelDef & { type: ChannelType.GuildText };

export const prodChannelDefs: Record<ProdChannelKey, ProdChannelDef> = {
  "main-category": {
    defaultName: "🏘 partmin",
    type: ChannelType.GuildCategory,
  },
  listings: {
    defaultName: "🌇┃listings",
    type: ChannelType.GuildText,
    topic: `@partmin created this channel. This is where you'll find listings that match your search criteria.`,
    parent: "main-category",
  },
  logs: {
    defaultName: "📜┃logs",
    type: ChannelType.GuildText,
    msgFlags: MessageFlags.SuppressNotifications,
    topic:
      "@partmin created this channel. Here you can take a look at the logs of the bot.",
    parent: "main-category",
  },
};

export const testChannelDefs: Record<TestChannelKey, TestChannelDef> = {
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

export const channelDefs: Record<ChannelKey, ChannelDef> = {
  ...prodChannelDefs,
  ...testChannelDefs,
};

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
    message: ({ max }) => `processing/filtering ${max} new listings...`,
  },
  notifying: {
    emoji: "💌",
    message: ({ max }) => `sending ${max} new listings your way!`,
  },
  waiting: {
    emoji: `⏳`,
    message: ({ max }) => `pausing for ${readableSeconds(max)}`,
    customProgress: ({ cur, max }) => `<${readableSeconds(max - cur)} left`,
  },
};
