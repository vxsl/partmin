import cache from "cache.js";
import config from "config.js";
import {
  BaseMessageOptions,
  DiscordAPIError,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { discordClient } from "discord/client.js";
import { ChannelKey, channelDefs } from "discord/constants.js";
import { discordIsReady } from "discord/index.js";
import { shuttingDown } from "index.js";
import { debugLog, log, logNoDiscord, verboseLog } from "util/log.js";
import { errToString, splitString } from "util/misc.js";

export const getChannel = async (c: ChannelKey) => {
  const guildInfo = await cache.discordGuildInfo.requireValue();
  const id = guildInfo.channelIDs[c];

  const result = (await (discordClient.channels.cache.get(id) ??
    discordClient.channels.fetch(id))) as TextChannel;
  if (!result) {
    throw new Error(`Channel with ID ${id} not found`);
  }
  return result;
};

const quickEmbed = ({
  title,
  color,
  content,
  monospace,
}: Partial<{
  title: Parameters<EmbedBuilder["setTitle"]>[0];
  color: Parameters<EmbedBuilder["setColor"]>[0];
  content: any;
  monospace?: boolean;
}>) =>
  new EmbedBuilder()
    .setColor(color ?? null)
    .setTitle(title ?? null)
    .setDescription(
      discordFormat(errToString(content), {
        code: monospace || content instanceof Error,
      })
    );

export const discordError = (e: unknown) => {
  logNoDiscord("Sending Discord error embed:");
  logNoDiscord(e);
  if (!discordIsReady()) {
    logNoDiscord("Discord client not ready, skipping error embed.");
    return;
  }
  discordSend(
    quickEmbed({
      color: "#ff0000",
      title: `🚨 Fatal error: partmin has crashed.`,
      content: e,
      monospace: true,
    })
  );
};

export const discordWarning = (
  title: string,
  e: unknown,
  options?: { monospace?: boolean }
) => {
  logNoDiscord("Sending Discord warning embed:");
  log(e);
  discordSend(
    quickEmbed({
      color: "#ebb734",
      title: `⚠️ ${title}`,
      content: e,
      monospace: options?.monospace,
    })
  );
};

interface FormatOptions {
  monospace?: true;
  bold?: true;
  italic?: true;
  code?: boolean;
  quote?: boolean;
}

export const discordFormat = (s: string, options?: FormatOptions) => {
  let v = options?.code
    ? `\`\`\`${s}\`\`\``
    : options?.monospace
    ? `\`${s}\``
    : s;
  if (options?.bold) {
    v = `**${v}**`;
  }
  if (options?.italic) {
    v = `*${v}*`;
  }
  if (options?.quote) {
    v = `> ${v.replace(/\n/g, "\n> ")}`;
  }
  return v;
};

export const discordSend = (...args: Parameters<typeof _discordSend>) => {
  const [msg, options] = args;
  return _discordSend(msg, options).catch(async (e) => {
    if (shuttingDown) {
      return;
    }
    if (
      e instanceof DiscordAPIError &&
      e.code === 50035 &&
      e.message.includes("or fewer")
    ) {
      logNoDiscord(`Message too long, splitting into parts:`, {
        error: true,
      });
      logNoDiscord(`"${msg.slice(0, 50)}..."`, { error: true });
      const parts = splitString(`${msg}`, 1900);
      for (let i = 0; i < parts.length; i++) {
        if (i === parts.length - 1) {
          return _discordSend(parts[i], options);
        }
        await _discordSend(parts[i], options);
      }
    }
    logNoDiscord(`Error while sending message to Discord:`, {
      error: true,
    });
    logNoDiscord(e, { error: true });
  });
};

type DiscordSendOptions = {
  channel?: ChannelKey;
  skipLog?: true;
  silent?: true;
  components?: BaseMessageOptions["components"];
} & FormatOptions;

const _discordSend = async (_msg: any, options?: DiscordSendOptions) => {
  if (!discordIsReady()) {
    return;
  }
  const k: ChannelKey =
    options?.channel ??
    (config.development?.testing ? "test-listings" : "listings");
  const c = await getChannel(k);

  const flags = channelDefs[k].msgFlags;

  if (_msg instanceof EmbedBuilder) {
    return c.send({ embeds: [_msg], components: options?.components });
  }

  const isErr = _msg instanceof Error;
  let msg = errToString(_msg);

  const isLiteral = [
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol",
    "undefined",
  ].includes(typeof msg);
  let v = msg;
  if (isLiteral || isErr) {
    if (`${msg}`.length === 0) {
      debugLog("Refusing to send empty Discord message", { skipDiscord: true });
      return;
    }
    v = discordFormat(msg, options);
  }

  return c.send({ content: v, flags }).then((result) => {
    if (!options?.skipLog) {
      verboseLog(`Sent message to Discord ${c}:`, { skipDiscord: true });
      verboseLog(v, { skipDiscord: true });
    }
    return result;
  });
};

const clearChannel = async (_c: ChannelKey) => {
  const c = await getChannel(_c);
  while (await c.messages.fetch().then((m) => m.size > 0)) {
    await c.messages.fetch().then(c.bulkDelete);
  }
};
