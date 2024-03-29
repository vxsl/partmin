import { devOptions } from "advanced-config.js";
import {
  BitField,
  CategoryChannel,
  Channel,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Guild,
  GuildChannel,
  PermissionsBitField,
  Role,
  TextChannel,
} from "discord.js";
import setupCommands from "discord/commands/index.js";
import {
  ChannelDef,
  ChannelKey,
  channelDefs,
  discordGuildID,
  prodChannelDefs,
  requiredPermissions,
} from "discord/constants.js";
import { setPresence } from "discord/presence.js";
import { writeStatusForAuditor } from "discord/util.js";
import dotenv from "dotenv-mono";
import persistent from "persistent.js";
import { stdout as singleLineStdOut } from "single-line-log";
import { debugLog, log, logNoDiscord } from "util/log.js";
import { waitSeconds } from "util/misc.js";
import { RecursivePartial } from "util/type.js";

dotenv.load();

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

let initComplete = false;

export const discordIsReady = (
  client: Client = discordClient
): client is Client<true> => initComplete && client.isReady();
export const getDiscordClient = (options?: {
  fatal?: boolean;
  errorMessage?: string;
}) => {
  if (!discordIsReady(discordClient)) {
    const m = options?.errorMessage || "Discord client not ready";
    if (options?.fatal) {
      throw new Error(m);
    }
    log(m);
    return;
  }
  return discordClient;
};

export interface ChannelIDs {
  channelIDs: Record<ChannelKey, string>;
}

const authorize = (
  prompt: string,
  isAuthorized: () => boolean | Promise<boolean>
) =>
  new Promise<void>(async (resolve, reject) => {
    const appID = await persistent.discordAppID.requireValue();
    const inviteBase = "https://discord.com/api/oauth2/authorize";
    const inviteURL = `${inviteBase}?client_id=${appID}&permissions=${PermissionsBitField.resolve(
      requiredPermissions
    )}&scope=bot`;
    console.log(`\n\n${prompt}:\n${inviteURL}\n`);

    const timeoutSecs = 60;
    const pollSecs = 5;

    let i = 0;
    const spinnerID = setInterval(() => {
      const spinner = ["|", "/", "-", "\\"];
      singleLineStdOut(`${spinner[++i % spinner.length]} `);
    }, 100);
    setTimeout(() => {
      clearInterval(spinnerID);
      if (!isAuthorized()) {
        console.log("\nTimed out.");
        reject();
      }
    }, timeoutSecs * 1000);

    console.log(
      `[Waiting for bot to be authorized using the above link. After authorizing, please allow a potential delay of up to ${pollSecs} seconds.]`
    );

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
  guildInfo: RecursivePartial<ChannelIDs>;
  guild: Guild;
}) => {
  const actualChannels = await guild.channels
    .fetch()
    .then((coll) =>
      [...coll.values()].filter(
        (c): c is CategoryChannel | TextChannel =>
          c instanceof CategoryChannel || c instanceof TextChannel
      )
    );
  const recordID = (key: string, id: string) => {
    guildInfo.channelIDs = {
      [key]: id,
      ...guildInfo.channelIDs,
    };
  };
  const alreadyExist: Partial<Record<ChannelKey, GuildChannel>> = {};
  const toCreate: Partial<Record<ChannelKey, ChannelDef>> = {};
  for (const [_key, def] of Object.entries(
    devOptions.testing ? channelDefs : prodChannelDefs
  )) {
    const key = _key as ChannelKey;
    for (const c of actualChannels) {
      if (c.type !== def.type) continue;
      const isCategory = c.type === ChannelType.GuildCategory;
      const entity =
        def.type === ChannelType.GuildCategory ? "category" : "text channel";
      if (c.id === guildInfo.channelIDs?.[key]) {
        debugLog(`${entity} "${key}" already exists (ID ${c.id}).`);
        alreadyExist[key] = c;
        recordID(key, c.id);
        break;
      } else if (
        (isCategory && c.name === def.defaultName) ||
        (!isCategory &&
          ((def.topic && c.topic === def.topic) || c.name === def.defaultName))
      ) {
        debugLog(
          `Assuming that the ${entity} found on this server with name "${c.name}" is partmin's "${key}" ${entity}.`
        );
        if (def.topic && c.name !== def.defaultName) {
          log(`(the topic is equal: "${def.topic}")`);
        }
        alreadyExist[key] = c;
        recordID(key, c.id);
        break;
      }
    }
    if (!alreadyExist[key]) {
      toCreate[key] = def;
    }
  }
  return { toCreate, alreadyExist };
};

const createChannels = async ({
  toCreate,
  alreadyExist,
  guild,
  guildInfo,
}: {
  toCreate: Partial<Record<ChannelKey, ChannelDef>>;
  alreadyExist: Partial<Record<ChannelKey, GuildChannel>>;
  guildInfo: RecursivePartial<ChannelIDs>;
  guild: Guild;
}) => {
  const results: Channel[] = [];

  const recordID = (key: string, id: string) => {
    guildInfo.channelIDs = {
      ...guildInfo.channelIDs,
      [key]: id,
    };
  };

  for (const [_key, def] of Object.entries(toCreate).filter(
    ([, { type }]) => type === ChannelType.GuildCategory
  )) {
    const key = _key as ChannelKey;
    log(`Creating category "${def.defaultName}"...`);
    await guild.channels
      .create({ name: def.defaultName, type: def.type })
      .then((cat) => {
        alreadyExist[key] = cat;
        results.push(cat);
        recordID(key, cat.id);
      });
  }

  for (const [key, def] of Object.entries(toCreate).filter(
    ([, { type }]) => type !== ChannelType.GuildCategory
  )) {
    log(`Creating channel "${def.defaultName}"...`);

    const parentKey = def.parent;

    if (!parentKey) {
      await guild.channels
        .create({
          name: def.defaultName,
          type: def.type,
          topic: def.topic,
        })
        .then((c) => {
          results.push(c);
          recordID(key, c.id);
        });
      continue;
    }

    let parent = alreadyExist[parentKey];
    if (!parent) {
      const cachedID = guildInfo.channelIDs?.[parentKey];
      if (cachedID) {
        const fetched = (await guild.channels.fetch(cachedID)) ?? undefined;
        if (fetched && !(fetched instanceof CategoryChannel)) {
          log(
            `Cached parent channel "${parentKey}" (ID ${cachedID}) is not a category.`
          );
        }
        parent = fetched as CategoryChannel | undefined;
      }
      if (!parent) {
        throw new Error(
          `Parent channel "${parentKey}" not found even though it should have been created in the previous step. Something went wrong.`
        );
      }
    }
    if (!(parent instanceof CategoryChannel)) {
      throw new Error(
        `Parent channel "${parentKey}" is not a category. Something went wrong.`
      );
    }
    await parent.children
      .create({
        name: def.defaultName,
        type: def.type,
        topic: def.topic,
      })
      .then((c) => {
        results.push(c);
        recordID(key, c.id);
      });
  }

  return results;
};

const setupGuild = async (guildInfo: RecursivePartial<ChannelIDs>) => {
  let guild: Guild | undefined;
  let role: Role | undefined;

  const appID = await persistent.discordAppID.requireValue();

  try {
    guild = await getGuild(discordGuildID);
    role = await getRole(guild, appID);
  } catch {}

  if (guild && role) {
    if (!permsMatch(role)) {
      await authorize(
        "partmin's required permissions have changed. Please reauthorize the bot",
        () => permsMatch(role!, { silent: true })
      );
    }
  } else {
    await authorize(
      "It looks like you haven't added partmin to your server yet. Please invite the bot to your preferred server, and come back when you're done",
      async () => {
        guild = await getGuild(discordGuildID);
        role = await getRole(guild, appID);
        return !!guild && !!role;
      }
    );
    if (!guild || !role) {
      throw new Error(`Failed to retrieve server information.`);
    }
  }

  const { toCreate, alreadyExist } = await getChannelsToBeCreated({
    guild,
    guildInfo,
  });
  if (Object.keys(toCreate).length) {
    debugLog(
      `Going to create the following channels:\n${Object.entries(toCreate)
        .map(([key, def]) => ` - ${key} ("${def?.defaultName}")`)
        .join(", ")}`
    );
  }

  await createChannels({
    toCreate,
    alreadyExist,
    guildInfo,
    guild,
  });

  return guildInfo as ChannelIDs; // TODO use runtypes to throw if info is malformed.
};

export const initDiscord = async () => {
  await persistent.discordAppID.requireValue({
    message: `partmin requires a Discord app ID to run. To get this, go to the Discord Developer Portal, create a new application, and retrieve the application ID from the "General Information" section.\n\n${persistent.discordAppID.envVarInstruction}`,
  });

  return await new Promise(async (resolve, reject) => {
    discordClient.once(Events.ClientReady, async () => {
      writeStatusForAuditor("logged-in");
      const guildInfo = await persistent.channelIDs.value();
      if (guildInfo) {
        debugLog("Cached server information found.");
        // TODO use runtypes to throw (or warn?) if guildInfo is malformed.
      }
      await setupGuild(guildInfo ?? {}).then((newGuildInfo) =>
        persistent.channelIDs.writeValue(newGuildInfo)
      );
      await setupCommands();
      log("Server configuration complete");
      initComplete = true;

      resolve(discordClient);
    });
    discordClient.once("error", reject);

    log("Discord client logging in...");
    const token = await persistent.botToken.requireValue({
      message: `partmin requires a Discord bot token to run. You can generate a new token by navigating to the "Bot" section of your application in the Discord Developer Portal and selecting "Reset Token".\n\n
       ${persistent.botToken.envVarInstruction}`,
    });
    await discordClient.login(token);
  });
};

export const shutdownDiscord = () => {
  return setPresence("offline", { skipDiscordLog: true }).then(async () => {
    logNoDiscord("Destroying discord client");
    await discordClient?.destroy();
    writeStatusForAuditor("logged-out");
  });
};
