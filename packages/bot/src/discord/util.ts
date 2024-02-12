import cache from "cache.js";
import { configDevelopment } from "config.js";
import { statusPathForAuditor } from "constants.js";
import { ChannelType, DiscordAPIError, MessageCreateOptions } from "discord.js";
import {
  ChannelKey,
  channelDefs,
  errorColor,
  fatalErrorColor,
  warningColor,
} from "discord/constants.js";
import { discordClient, discordIsReady } from "discord/index.js";
import {
  SendEmbedOptions,
  constructAndSendRichMessage,
} from "discord/interactive/index.js";
import { writeFileSync } from "fs";
import { shuttingDown } from "index.js";
import { debugLog, log, logNoDiscord, verboseLog } from "util/log.js";
import { errToString, splitString } from "util/misc.js";

type DiscordBotLoggedInStatus = "logged-in" | "logged-out";
export const writeStatusForAuditor = (status: DiscordBotLoggedInStatus) =>
  writeFileSync(statusPathForAuditor, status);

interface FormatOptions {
  monospace?: true;
  bold?: true;
  italic?: true;
  code?: boolean | string;
  quote?: boolean;
  link?: string;
  underline?: boolean;
}
export const discordFormat = (s: string, options?: FormatOptions) => {
  let v =
    options?.code === true
      ? `\`\`\`${s}\`\`\``
      : options?.code
      ? `\`\`\`${options.code}\n${s}\`\`\``
      : options?.monospace
      ? `\`${s}\``
      : s;
  if (options?.bold) {
    v = `**${v}**`;
  }
  if (options?.italic) {
    v = `*${v}*`;
  }
  if (options?.underline) {
    v = `__${v}__`;
  }
  if (options?.quote) {
    v = `> ${v.replace(/\n/g, "\n> ")}`;
  }
  if (options?.link) {
    v = `[${v}](${options.link})`;
  }
  return v;
};

export const getTextChannel = async (c: ChannelKey) => {
  const guildInfo = await cache.discordGuildInfo.requireValue();
  const id = guildInfo.channelIDs[c];
  const result = await (discordClient.channels.cache.get(id) ??
    discordClient.channels.fetch(id));
  if (result?.type !== ChannelType.GuildText) {
    throw new Error(
      `Channel with ID ${id} is not a text channel, but a ${result?.type}`
    );
  }
  if (!result) {
    throw new Error(`Channel with ID ${id} not found`);
  }
  return result;
};

export const discordError = (e: unknown) => {
  logNoDiscord("Sending Discord error embed:");
  logNoDiscord(e);
  if (!discordIsReady()) {
    logNoDiscord("Discord client not ready, skipping error embed.");
    return;
  }
  return constructAndSendRichMessage({
    embeds: [
      {
        color: fatalErrorColor,
        title: `🚨 Fatal error: partmin has crashed.`,
        description: discordFormat(errToString(e), { code: true }),
      },
    ],
  });
};

export const discordWarning = (
  title: string,
  e: unknown,
  {
    monospace,
    error,
    ...options
  }: { monospace?: boolean; error?: boolean } & Omit<
    SendEmbedOptions,
    "embeds"
  > = {}
) => {
  logNoDiscord(`Sending Discord ${error ? "error" : "warning"} embed:`);
  log(e);
  return constructAndSendRichMessage({
    ...options,
    embeds: [
      {
        ...(error
          ? { color: errorColor, title: `❌ ${title}` }
          : { color: warningColor, title: `⚠️ ${title}` }),
        description: discordFormat(errToString(e), {
          code: monospace || e instanceof Error,
        }),
      },
    ],
  });
};

export type DiscordSendOptions = {
  channel?: ChannelKey;
  skipLog?: true;
  silent?: true;
  createOptions?: MessageCreateOptions;
} & FormatOptions;

const _discordSend = async (_msg: any, options?: DiscordSendOptions) => {
  if (!discordIsReady()) {
    verboseLog(
      `Discord client not ready, skipping message send: "${_msg.slice(
        0,
        50
      )}..."`,
      { skipDiscord: true }
    );
    return;
  }
  const k: ChannelKey =
    options?.channel ??
    (configDevelopment.testing ? "test-listings" : "listings");
  const c = await getTextChannel(k);

  const flags = channelDefs[k].msgFlags;

  if (options?.createOptions) {
    return c.send(options.createOptions);
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

export const manualDiscordSend = (
  createOptions: MessageCreateOptions,
  options?: DiscordSendOptions
) => discordSend(undefined, { ...options, createOptions });

export const clearChannel = async (_c: ChannelKey) => {
  const c = await getTextChannel(_c);
  let msgs = await c.messages.fetch();
  while (msgs.size > 0) {
    await c.bulkDelete(msgs);
    msgs = await c.messages.fetch();
  }
};
