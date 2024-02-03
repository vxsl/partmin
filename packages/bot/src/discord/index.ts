import config from "config.js";
import { statusPathForAuditor } from "constants.js";
import {
  BitField,
  CategoryChannel,
  Channel,
  ChannelType,
  Guild,
  PermissionsBitField,
  Role,
  TextChannel,
} from "discord.js";
import { discordCache } from "discord/cache.js";
import { greetings } from "discord/chat.js";
import { discordClient } from "discord/client.js";
import {
  CategoryDef,
  CategoryKey,
  ChannelDef,
  ChannelKey,
  channelDefs,
  channelSchema,
  requiredPermissions,
} from "discord/constants.js";
import { discordSend } from "discord/util.js";
import dotenv from "dotenv-mono";
import { writeFileSync } from "fs";
import { stdout as singleLineStdOut } from "single-line-log";
import { debuglog } from "util";
import { debugLog, log } from "util/log.js";
import { waitSeconds } from "util/misc.js";
import { RecursivePartial } from "util/type.js";

dotenv.load();

let initComplete = false;

export const discordIsReady = () => initComplete && discordClient.isReady();

export interface GuildInfo {
  categoryIDs: Record<CategoryKey, string>;
  channelIDs: Record<ChannelKey, string>;
}

const authorize = (
  prompt: string,
  isAuthorized: () => boolean | Promise<boolean>
) =>
  new Promise<void>(async (resolve, reject) => {
    const appID = await discordCache.appID.requireValue();
    const inviteBase = "https://discord.com/api/oauth2/authorize";
    const inviteURL = `${inviteBase}?client_id=${appID}&permissions=${PermissionsBitField.resolve(
      requiredPermissions
    )}&scope=bot`;
    // TODO use URL constructor instead of string concatenation
    console.log(`\n\n${prompt}:\n${inviteURL}\n`);

    const timeoutSecs = 60;
    const pollSecs = 5;

    setTimeout(() => {
      clearInterval(spinnerID);
      console.log("\nTimed out.");
      reject();
    }, timeoutSecs * 1000);

    let i = 0;

    console.log(
      `[Waiting for bot to be authorized using the above link. After authorizing, please allow a potential delay of up to ${pollSecs} seconds.]`
    );
    const spinnerID = setInterval(() => {
      const spinner = ["|", "/", "-", "\\"];
      singleLineStdOut(`${spinner[++i % spinner.length]} `);
    }, 100);

    while (true) {
      try {
        if (await isAuthorized()) {
          clearInterval(spinnerID);
          resolve();
        }
      } catch {}
      await waitSeconds(pollSecs);
    }
  });

const getGuild = (id: string) => discordClient.guilds.fetch(id);
const getRole = (guild: Guild | undefined, appID: string) =>
  guild?.roles?.botRoleFor(appID) ?? undefined;

const createCategory = async ({
  guild,
  key,
  guildInfo,
}: {
  guild: Guild;
  key: CategoryKey;
  guildInfo: RecursivePartial<GuildInfo>;
}): Promise<CategoryChannel> => {
  const name = channelSchema[key].defaultName;
  log(`Creating category "${name}"...`);
  return await guild.channels
    .create({
      name,
      type: ChannelType.GuildCategory,
    })
    .then((cat) => {
      guildInfo.categoryIDs = {
        ...(guildInfo.categoryIDs ?? {}),
        [key]: cat.id,
      };
      return cat;
    });
};

const permsMatch = (role: Role | null, options?: { silent?: boolean }) => {
  const cur = role?.permissions;
  const result = !!cur?.equals(requiredPermissions);
  if (!options?.silent) {
    debugLog(
      `Bot permissions are ${
        result ? "correct" : "incorrect"
      }: ${BitField.resolve(cur)} vs required ${BitField.resolve(
        requiredPermissions
      )}`
    );
  }
  return result;
};

const getChannelsToBeCreated = async ({
  guild,
  guildInfo,
}: {
  guildInfo: RecursivePartial<GuildInfo>;
  guild: Guild;
}) => {
  let _results: Partial<
    Record<ChannelKey | CategoryKey, ChannelDef | CategoryDef>
  > = {};
  const actualChannels = await guild.channels.fetch();

  const categoriesWithMatchingNames = Object.entries(channelSchema).reduce(
    (acc, [key, { defaultName }]) => {
      const match = actualChannels.find(
        (c) =>
          (c instanceof CategoryChannel &&
            c.name === defaultName &&
            c.type === ChannelType.GuildCategory) ||
          c?.id === guildInfo.categoryIDs?.[key]
      );
      if (match) {
        debugLog(
          match.id === guildInfo.categoryIDs?.[key]
            ? `Category "${key}" already exists (ID ${match.id}).`
            : `Assuming that category with name "${match.name}" is category "${key}."`
        );
        acc[key] = match;
        guildInfo.categoryIDs = {
          ...(guildInfo.categoryIDs ?? {}),
          [key]: match.id,
        };
      }
      return acc;
    },
    {} as Partial<Record<CategoryKey, CategoryChannel>>
  );

  _results = Object.fromEntries(
    Object.entries(channelSchema).filter(
      ([key]) => !(key in categoriesWithMatchingNames)
    ) ?? []
  );

  const channelsWithMatchingTopics = actualChannels.reduce((acc, c) => {
    if (c instanceof TextChannel) {
      const match = Object.entries(channelDefs).find(
        ([, { topic }]) => topic === c.topic
      ) as [ChannelKey, ChannelDef] | undefined;
      if (match) {
        const [key] = match;
        debugLog(
          `Assuming that channel ${c.id} is "${key}" because it has the following topic: ${c.topic}`
        );
        acc[key] = c;
        guildInfo.channelIDs = {
          ...(guildInfo.channelIDs ?? {}),
          [key]: c.id,
        };
      }
    }
    return acc;
  }, {});

  _results = {
    ..._results,
    ...Object.fromEntries(
      Object.entries(channelDefs).filter(
        ([key]) => !(key in channelsWithMatchingTopics)
      ) ?? []
    ),
  };

  if (!Object.values(_results).length) {
    return {};
  }

  const results = { ..._results };

  for (const [_key, { defaultName }] of Object.entries(_results)) {
    const key = _key as ChannelKey;
    const cachedID = guildInfo.channelIDs?.[key];
    if (cachedID) {
      try {
        const cached =
          guild.channels.cache.get(cachedID) ?? actualChannels.get(cachedID);
        if (cached && cached.type === ChannelType.GuildText) {
          debugLog(
            `Channel "${key}" with ID ${cachedID} ("${defaultName}") already exists.`
          );
          delete results[key];
          continue;
        }
        log(
          `Channel "${key}" with ID ${cachedID} ("${defaultName}") does not exist.`
        );
      } catch {}
    }
  }
  return results;
};

const createChannels = async ({
  defs,
  guild,
  guildInfo,
}: {
  defs: Partial<Record<ChannelKey | CategoryKey, ChannelDef | CategoryDef>>;
  guildInfo: RecursivePartial<GuildInfo>;
  guild: Guild;
}) => {
  const results: Channel[] = [];
  for (const [_key, d] of Object.entries(defs)) {
    if (!("parent" in d)) {
      const cat = await createCategory({
        guild,
        key: _key as CategoryKey,
        guildInfo,
      });
      results.push(cat);
      continue;
    }
    const key = _key as ChannelKey;
    const { defaultName, topic, parent } = d;
    log(`Creating channel "${defaultName}"...`);

    // TODO don't do this, temporary solution but it's ugly
    const catID = guildInfo.categoryIDs?.[parent];
    const cat = catID ? await guild.channels.fetch(catID) : undefined;

    const chan =
      cat && cat instanceof CategoryChannel
        ? await (cat.children ?? guild.channels).create({
            name: defaultName,
            topic,
          })
        : await guild.channels.create({ name: defaultName, topic });

    guildInfo.channelIDs = {
      ...(guildInfo.channelIDs ?? {}),
      [key]: chan.id,
    };
    results.push(chan);
  }
  return results;
};

const setupGuild = async (
  id: string,
  info: RecursivePartial<GuildInfo>
): Promise<GuildInfo> => {
  let guild: Guild | undefined;
  let role: Role | undefined;

  const appID = await discordCache.appID.requireValue();

  try {
    guild = await getGuild(id);
    role = await getRole(guild, appID);
  } catch {}

  if (guild && role) {
    if (!permsMatch(role)) {
      authorize(
        "Partmin's required permissions have changed. Please reauthorize the bot",
        () => permsMatch(role!, { silent: true })
      );
    }
  } else {
    await authorize(
      "It looks like you haven't added partmin to your server yet. Please invite the bot to your preferred server, and come back when you're done",
      async () => {
        guild = await getGuild(id);
        role = await getRole(guild, appID);
        return !!guild && !!role;
      }
    );
    if (!guild || !role) {
      throw new Error(`Failed to retrieve server information.`);
    }
  }

  const toBeCreated = await getChannelsToBeCreated({ guild, guildInfo: info });
  debugLog("Going to create the following channels:");
  debugLog(
    Object.entries(toBeCreated)
      .map(([k, v]) => `${k} ("${v.defaultName}")`)
      .join(", ")
  );

  await createChannels({
    defs: toBeCreated,
    guildInfo: info,
    guild,
  });

  // TODO use runtypes to throw if info is malformed.
  return info as GuildInfo;
};

export const initDiscord = async () => {
  const guildID = await discordCache.guildID.requireValue({
    message: `Your Discord server is not set up. To configure it, please retrieve your server's ID:\n - open Discord\n - right-click your server in the sidebar\n - Server Settings\n - Widget \n - SERVER ID\n\n${discordCache.guildID.envVarInstruction}\n\nNote that partmin will create channels in this server, so make sure you have the necessary permissions to do so.`,
  });

  return await new Promise(async (resolve, reject) => {
    discordClient.once("ready", async () => {
      if (false && discordCache.guildInfo.value) {
        // TODO use runtypes to throw if guildInfo is malformed.
        // TODO probably don't just do nothing if guildInfo is valid and present.
        // Should check if the channels are still there and if not, recreate them, etc.
        debuglog("Cached guild configuration found.");
      } else {
        await setupGuild(guildID, {}).then((newGuildInfo) => {
          discordCache.guildInfo.writeValue(newGuildInfo);
          log("Server configuration complete");
        });
      }

      if (!config.botBehaviour?.suppressGreeting) {
        discordSend(greetings[Math.floor(Math.random() * greetings.length)]);
      }
      initComplete = true;
      resolve(discordClient);
    });
    discordClient.once("error", reject);

    log("Discord client logging in...");
    const token = await discordCache.botToken.requireValue({
      message: `Partmin requires a Discord bot token to run. ${discordCache.botToken.envVarInstruction}`,
    });
    await discordClient.login(token);
  });
};

type DiscordBotLoggedInStatus = "logged-in" | "logged-out";
export const writeStatusForAuditor = (status: DiscordBotLoggedInStatus) =>
  writeFileSync(statusPathForAuditor, status);
