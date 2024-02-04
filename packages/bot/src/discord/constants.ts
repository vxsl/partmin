import {
  ChannelType,
  MessageCreateOptions,
  MessageFlags,
  PermissionsBitField,
} from "discord.js";

export const requiredPermissions = new PermissionsBitField(
  BigInt(1084815309904)
);

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
