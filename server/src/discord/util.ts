import Discord, { DiscordAPIError } from "discord.js";
import { discordChannelIDs, discordClient } from "discord/index.js";
import { debugLog, log, verboseLog } from "util/log.js";

export type ChannelKey = "main" | "logs";

export const getChannel = async (c: ChannelKey) => {
  const id = discordChannelIDs[c];
  const result = (await (discordClient.channels.cache.get(id) ??
    discordClient.channels.fetch(id))) as Discord.TextChannel;
  if (!result) {
    throw new Error(`Channel with ID ${id} not found`);
  }
  return result;
};

export const discordImportantError = (header: string, err: unknown) => {
  discordSend(header, { bold: true });
  discordSend(err, { monospace: true });
};

interface FormatOptions {
  monospace?: true;
  bold?: true;
  italic?: true;
}

const discordFormat = (s: string, options?: FormatOptions) => {
  let v = options?.monospace ? `\`${s}\`` : s;
  if (options?.bold) {
    v = `**${v}**`;
  }
  if (options?.italic) {
    v = `*${v}*`;
  }
  return v;
};

export const discordSend = (
  msg: any,
  options?: {
    channel?: ChannelKey;
    skipLog?: true;
  } & FormatOptions
) => {
  return _discordSend(msg, options).catch(async (e) => {
    if (
      e instanceof DiscordAPIError &&
      e.code === 50035 &&
      e.message.includes("or fewer")
    ) {
      log(`Message too long, splitting into parts`, { error: true });
      const parts = `${msg}`.match(/.{1,1900}/g) ?? [];
      for (let i = 0; i < parts.length; i++) {
        if (i === parts.length - 1) {
          return _discordSend(parts[i], options);
        }
        await _discordSend(parts[i], options);
      }
    }
    if (!options?.skipLog) {
      log(`Error while sending message to Discord:`, { error: true });
      log(e, { error: true });
    }
  });
};

const _discordSend = async (
  msg: any,
  options?: {
    channel?: ChannelKey;
    skipLog?: true;
  } & FormatOptions
) => {
  const channel = options?.channel ?? "main";
  const c = await getChannel(channel);

  const stringLike = [
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol",
    "undefined",
  ].includes(typeof msg);
  let v = msg;
  if (stringLike) {
    if (`${msg}`.length === 0) {
      debugLog("Refusing to send empty Discord message");
      return;
    }
    v = discordFormat(msg, options);
  }

  if (!c.client.isReady()) {
    throw new Error(
      `Client \"${channel}\" (ID ${discordChannelIDs[channel]}) not ready`
    );
  }
  if (!c) {
    throw new Error(
      `Channel \"${channel}\" (ID ${discordChannelIDs[channel]}) not found`
    );
  }
  return c.send(v).then((result) => {
    if (!options?.skipLog) {
      verboseLog(`Sent message to Discord ${c}:`);
      verboseLog(v);
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
