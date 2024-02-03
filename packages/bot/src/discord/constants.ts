import {
  MessageCreateOptions,
  MessageFlags,
  PermissionsBitField,
} from "discord.js";

export const requiredPermissions = new PermissionsBitField(
  BigInt(1084815309904)
);

const categoryKeys = ["prod", "test"] as const;
const channelKeys = ["main", "logs", "test-main", "test-logs"] as const;
export type CategoryKey = (typeof categoryKeys)[number];
export type ChannelKey = (typeof channelKeys)[number];
export type ChannelDef = {
  defaultName: string;
  msgFlags?: MessageCreateOptions["flags"];
  topic: string;
  parent: CategoryKey; // TODO revert this, temporary solution but it's ugly
};
export type CategoryDef = {
  defaultName: string;
  channels: Partial<Record<ChannelKey, ChannelDef>>;
};

const mainTopic = `@partmin created this channel. This is where you'll find listings that match your search criteria.`;
const logsTopic =
  "@partmin created this channel. Real-time updates and insights straight from the bot's stdout.";

export const channelSchema: Record<CategoryKey, CategoryDef> = {
  prod: {
    defaultName: "🏘 partmin",
    channels: {
      main: {
        defaultName: "🌇┃listings",
        topic: mainTopic,
        parent: "prod",
      },
      logs: {
        defaultName: "📜┃logs",
        msgFlags: MessageFlags.SuppressNotifications,
        topic: logsTopic,
        parent: "prod",
      },
    },
  },
  test: {
    defaultName: "partmin-test",
    channels: {
      "test-main": {
        defaultName: "🧪┃listings-test",
        msgFlags: MessageFlags.SuppressNotifications,
        topic: `[test] ${mainTopic}`,
        parent: "test",
      },
      "test-logs": {
        defaultName: "🔬┃logs-test",
        msgFlags: MessageFlags.SuppressNotifications,
        topic: `[test] ${logsTopic}`,
        parent: "test",
      },
    },
  },
};

export const channelDefs = Object.values(channelSchema).reduce<
  Record<ChannelKey, ChannelDef>
>(
  (acc, cat) => ({ ...acc, ...cat.channels }),
  {} as Record<ChannelKey, ChannelDef>
);

// ============================================================
// This is a temporary measure to ensure the type-safety of the
// channelSchema at runtime, since I can't yet figure out how to
// do it statically:
//
// TODO remove this
channelKeys.forEach((k) => {
  if (!channelDefs[k]) {
    console.error(new Error().stack);
    console.error(`channelSchema is incomplete: missing "${k}"`);
    process.exit(1);
  }
});
// ------------------------------------------------------------
