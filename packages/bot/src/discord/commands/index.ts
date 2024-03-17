import {
  AdvancedConfig,
  defaultAdvancedConfigValues,
  devOptions,
} from "advanced-config.js";
import {
  Collection,
  CommandInteraction,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import getInteractiveEditCommand from "discord/commands/interactive-edit.js";
import testListing from "discord/commands/test-listing.js";
import { discordGuildID } from "discord/constants.js";
import { discordClient } from "discord/index.js";
import { setLocation, setSearchAreas } from "discord/init-routine.js";
import persistent from "persistent.js";
import { SearchParams, defaultUserConfigValues } from "user-config.js";
import { identifyCity } from "util/geo.js";
import { log } from "util/log.js";
import { notUndefined, tryNTimes } from "util/misc.js";
import { discordFormat } from "util/string.js";

interface Command {
  name: string;
  description: string;
  execute: (interaction: CommandInteraction) => any;
}

const setupCommands = async () => {
  const commands = [
    devOptions?.testing
      ? {
          data: new SlashCommandBuilder()
            .setName("test-listing")
            .setDescription("Sends a test listing."),
          execute: testListing,
        }
      : undefined,
    {
      data: new SlashCommandBuilder()
        .setName("edit-search")
        .setDescription("Edit your apartment search parameters interactively."),
      execute: getInteractiveEditCommand({
        getObject: () => persistent.userConfig.requireValue(),
        writeObject: (v) => persistent.userConfig.writeValue(v),
        nestPath: "search.params",
        runtype: SearchParams,
        defaultValues: defaultUserConfigValues,
        strings: {
          editModal: `Edit search parameter`,
          changeNotification: "⚙️ Search parameters updated",
          title: "Your search",
        },
      }),
    },
    },
  ];
  const token = await persistent.botToken.requireValue();
  const appID = await persistent.discordAppID.requireValue();

  const rest = new REST({ timeout: 5000 }).setToken(token);

  const coll = new Collection<string, Command>(
    commands.filter(notUndefined).map((command) => [
      command.data.name,
      {
        ...command,
        name: command.data.name,
        description: command.data.description,
      },
    ])
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
    rest.put(Routes.applicationGuildCommands(appID, discordGuildID), {
      body: coll,
    })
  );
};

export default setupCommands;
