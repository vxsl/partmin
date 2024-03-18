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
import {
  getCommuteDestinationsSummary,
  getSearchLocationSummary,
  setLocation,
} from "discord/commands/location.js";
import testListing from "discord/commands/test-listing.js";
import { interactiveEdit } from "discord/commands/util/interactive-edit.js";
import { promptForBoolean } from "discord/commands/util/interactive-simple.js";
import { discordGuildID } from "discord/constants.js";
import { discordClient } from "discord/index.js";
import { editSearchParams } from "discord/init-routine.js";
import persistent from "persistent.js";
import { identifyCity } from "util/geo.js";
import { log } from "util/log.js";
import { notUndefined, tryNTimes } from "util/misc.js";
import { discordFormat } from "util/string.js";

interface Command {
  name: string;
  description: string;
  execute: (interaction: CommandInteraction) => any;
}

export const searchParamsCommandName = "search-parameters";

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
        .setName(searchParamsCommandName)
        .setDescription("📄 View and edit your search parameters."),
      execute: (commandInteraction: CommandInteraction) =>
        editSearchParams({ commandInteraction }),
    },
    {
      data: new SlashCommandBuilder()
        .setName("advanced-config")
        .setDescription(
          "📄 View and edit advanced config. Avoid this unless you know what you're doing."
        ),
      execute: (commandInteraction: CommandInteraction) =>
        interactiveEdit({
          commandInteraction,
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
        .setDescription("📌 What city do you want to live in?"),
      execute: (commandInteraction: CommandInteraction) =>
        setLocation({ commandInteraction }),
    },
    {
      data: new SlashCommandBuilder()
        .setName("search-areas")
        .setDescription("📌 Specify granular search radii within your city."),
      execute: async (commandInteraction: CommandInteraction) => {
        const userConfig = await persistent.userConfig.requireValue();
        const city = await identifyCity(userConfig.search.location?.city).catch(
          (e) => {
            log(`Error identifying city from user config file: ${e}`);
            return undefined;
          }
        );
        if (
          (await promptForBoolean({
            commandInteraction,
            prompt:
              (await getSearchLocationSummary()) +
              discordFormat("\nWould you like to specify new search radii?", {
                bold: true,
              }),
          })) !== true
        ) {
          return;
        }
        await setLocation({
          commandInteraction,
          ...(city && { skipCityPrompt: true }),
        });
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

        if (
          (await promptForBoolean({
            commandInteraction,
            prompt:
              (await getCommuteDestinationsSummary()) +
              "\n" +
              discordFormat(
                "Would you like to specify new commute destinations?",
                { bold: true }
              ),
          })) !== true
        ) {
          return;
        }

        await setLocation({
          commandInteraction,
          ...(city &&
            userConfig.search.location.mapDevelopersURL && {
              skipCityPrompt: true,
              skipSearchAreasPrompt: true,
            }),
        });
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
