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
import { promptForBoolean } from "discord/commands/interactive-simple.js";
import testListing from "discord/commands/test-listing.js";
import { discordGuildID } from "discord/constants.js";
import { discordClient } from "discord/index.js";
import {
  getCommuteDestinationsSummary,
  getSearchLocationSummary,
  setLocation,
} from "discord/init-routine.js";
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
        .setName("search-parameters")
        .setDescription("📄 View and edit your search parameters."),
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
    {
      data: new SlashCommandBuilder()
        .setName("edit-advanced-config")
        .setDescription(
          "📄 View and edit advanced config. Avoid this unless you know what you're doing."
        ),
      execute: getInteractiveEditCommand({
        getObject: () => persistent.advancedConfig.requireValue(),
        writeObject: (v) => persistent.advancedConfig.writeValue(v),
        runtype: AdvancedConfig,
        defaultValues: defaultAdvancedConfigValues,
        strings: {
          editModal: `Edit advanced config parameter`,
          changeNotification: "⚙️ Advanced config updated",
          title: "Advanced configuration",
          description: discordFormat(
            "⚠️🚨 Do not modify unless you know what you're doing.",
            { bold: true, italic: true }
          ),
        },
      }),
    },
    {
      data: new SlashCommandBuilder()
        .setName("location")
        .setDescription(
          "📌 Set the desired location for your apartment search."
        ),
      execute: (commandInteraction: CommandInteraction) =>
        setLocation({ commandInteraction }),
    },
    {
      data: new SlashCommandBuilder()
        .setName("search-areas")
        .setDescription("📌 Specify search radii."),
      execute: async (commandInteraction: CommandInteraction) => {
        const userConfig = await persistent.userConfig.requireValue();
        const city = await identifyCity(userConfig.search.location?.city).catch(
          (e) => {
            log(`Error identifying city from user config file: ${e}`);
            return undefined;
          }
        );
        if (city) {
          const shouldContinue =
            (await promptForBoolean({
              commandInteraction,
              prompt:
                (await getSearchLocationSummary()) +
                discordFormat("\nWould you like to specify new search radii?", {
                  bold: true,
                }),
            })) === true;
          if (shouldContinue) {
            await setLocation({ commandInteraction, skipCityPrompt: true });
          }
          return;
        }
        await setLocation({ commandInteraction });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName("commute-destinations")
        .setDescription("📌 Define commute destinations."),
      execute: async (commandInteraction: CommandInteraction) => {
        const userConfig = await persistent.userConfig.requireValue();
        const city = await identifyCity(userConfig.search.location?.city).catch(
          (e) => {
            log(`Error identifying city from user config file: ${e}`);
            return undefined;
          }
        );

        if (city && userConfig.search.location.mapDevelopersURL) {
          const shouldContinue =
            (await promptForBoolean({
              commandInteraction,
              prompt:
                (await getCommuteDestinationsSummary()) +
                discordFormat(
                  "\nWould you like to specify new commute destinations?",
                  { bold: true }
                ),
            })) === true;
          if (shouldContinue) {
            await setLocation({
              commandInteraction,
              skipCityPrompt: true,
              skipSearchAreasPrompt: true,
            });
          }
          return;
        }

        await setLocation({ commandInteraction });
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
