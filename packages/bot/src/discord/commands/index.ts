import cache from "cache.js";
import config from "config.js";
import {
  Collection,
  CommandInteraction,
  Events,
  REST,
  Routes,
} from "discord.js";
import testListing from "discord/commands/test-listing.js";
import { discordClient } from "discord/index.js";
import { log } from "util/log.js";
import { notUndefined } from "util/misc.js";

interface Command {
  name: string;
  description: string;
  execute: (interaction: CommandInteraction) => any;
}

const commands = [config.development?.testing ? testListing : undefined].filter(
  notUndefined
);
const coll = new Collection<string, Command>(
  commands.map((command) => [
    command.data.name,
    {
      ...command,
      name: command.data.name,
      description: command.data.description,
    },
  ])
);

const setupCommands = async () => {
  const token = await cache.discordBotToken.requireValue();
  const appID = await cache.discordAppID.requireValue();
  const guildID = await cache.discordGuildID.requireValue();

  const rest = new REST().setToken(token);

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
  await rest.put(Routes.applicationGuildCommands(appID, guildID), {
    body: coll,
  });
};

export default setupCommands;
