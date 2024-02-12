import cache from "cache.js";
import {
  Collection,
  CommandInteraction,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import editConfig from "discord/commands/edit-config.js";
import testListing from "discord/commands/test-listing.js";
import { discordClient } from "discord/index.js";
import { getConfig } from "util/config.js";
import { log } from "util/log.js";
import { notUndefined, tryNTimes } from "util/misc.js";

interface Command {
  name: string;
  description: string;
  execute: (interaction: CommandInteraction) => any;
}

const getCommands = async () => {
  const config = await getConfig();
  return [
    config.development?.testing
      ? {
          data: new SlashCommandBuilder()
            .setName("test-listing")
            .setDescription("Sends a test listing"),
          execute: testListing,
        }
      : undefined,
    {
      data: new SlashCommandBuilder()
        .setName("edit-config")
        .setDescription("TODO RENAME THIS"),
      execute: editConfig,
    },
  ].filter(notUndefined);
};

const setupCommands = async () => {
  const token = await cache.discordBotToken.requireValue();
  const appID = await cache.discordAppID.requireValue();

  const rest = new REST({ timeout: 5000 }).setToken(token);

  const coll = new Collection<string, Command>(
    await getCommands().then((commands) =>
      commands.map((command) => [
        command.data.name,
        {
          ...command,
          name: command.data.name,
          description: command.data.description,
        },
      ])
    )
  );

  discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = coll.get(interaction.commandName);
    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      }
    }
  });

  log("Registering Discord commands");
  await tryNTimes(3, () =>
    rest.put(Routes.applicationCommands(appID), { body: coll })
  );
};

export default setupCommands;
