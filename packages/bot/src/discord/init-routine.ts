import { CommandInteraction } from "discord.js";
import { searchParamsCommandName } from "discord/commands/index.js";
import { setLocation } from "discord/commands/location.js";
import { interactiveEdit } from "discord/commands/util/interactive-edit.js";
import {
  promptForBoolean,
  promptForRequiredNumber,
  promptForString,
  promptForSubmit,
  stringPromptLabels,
} from "discord/commands/util/interactive-simple.js";
import { discordSend } from "discord/util.js";
import persistent from "persistent.js";
import { ValidationError } from "runtypes";
import { SearchParams, defaultUserConfigValues } from "user-config.js";
import { gmapsAPIKeyIsValid } from "util/geo.js";
import { discordFormat } from "util/string.js";

const checkGoogleMapsAPIKey = async () => {
  const gmapsAPIKey = await persistent.googleMapsAPIKey.value();
  if (!gmapsAPIKey || !(await gmapsAPIKeyIsValid(gmapsAPIKey))) {
    while (true) {
      const key = await promptForString({
        hideValue: true,
        name: "Google Maps API key",
        prompt: `${discordFormat(
          (gmapsAPIKey
            ? discordFormat("Invalid Google Maps API key detected.", {
                italic: true,
              }) + "\n\n"
            : "") +
            `A valid Google Maps API key with permissions for the Geocoding and Distance Matrix APIs is required.`,
          { bold: true }
        )}\n\nNote that the free tier of the Google Maps API has usage limits, but if you're using partmin for personal use, you're unlikely to exceed these limits.\n\nPlease obtain your API key from the ${discordFormat(
          "Google Cloud Console",
          { link: "https://console.cloud.google.com/" }
        )}, and enter the value with the ${
          stringPromptLabels.edit
        } button below.`,
      });
      if (typeof key !== "string") {
        await discordSend(`A Google Maps API key is required.`);
        continue;
      }
      const isValid = await gmapsAPIKeyIsValid(key);
      if (isValid) {
        await persistent.googleMapsAPIKey.writeValue(key);
        await discordSend("Google Maps API key set successfully.");
        break;
      }
      await discordSend(
        "The API key you provided doesn't appear to be valid. Please try again."
      );
    }
  }
};

const checkLocation = async () => {
  const isSet = async () => {
    const userConfig = await persistent.userConfig.value();
    const location = userConfig?.search.location;
    return (
      location && location.city && location.region && location.mapDevelopersURL
    );
  };

  if (!(await isSet())) {
    await discordSend(
      "It looks like you haven't set your search location yet."
    );
    while (true) {
      await setLocation();
      if (await isSet()) {
        break;
      }
      await discordSend(
        "partmin can't run without a search location. Please set your search location to continue."
      );
    }
  }
};

const checkPrice = async () => {
  const userConfig = await persistent.userConfig.requireValue();
  const params = userConfig.search?.params ?? {};
  if (params.price?.min === undefined || params.price?.max === undefined) {
    const max = await promptForRequiredNumber({
      name: "Maximum rent price",
      required: true,
      prompt: discordFormat(
        `Please specify the ${discordFormat("maximum", {
          underline: true,
        })} rent price for your search by clicking the ${
          stringPromptLabels.edit
        } button below.`,
        { bold: true }
      ),
    });

    const min =
      (await promptForBoolean({
        prompt:
          discordFormat("Would you like to specify a minimum rent price?", {
            bold: true,
          }) +
          "\n" +
          "Sometimes this can help filter out irrelevant listings.",
      })) === true
        ? await promptForRequiredNumber({
            name: "Minimum rent price",
            required: true,
            prompt: discordFormat(
              `Please specify the ${discordFormat("minimum", {
                underline: true,
              })} rent price for your search by clicking the ${
                stringPromptLabels.edit
              } button below.`,
              { bold: true }
            ),
          })
        : 0;

    await persistent.userConfig.writeValue({
      ...defaultUserConfigValues,
      ...userConfig,
      search: {
        ...userConfig.search,
        params: {
          ...(defaultUserConfigValues.search?.params ?? {}),
          ...params,
          price: {
            min: min.valueOf(),
            max: max.valueOf(),
          },
        },
      },
    });
  }
};

export const editSearchParams = ({
  commandInteraction,
  ...rest
}: {
  commandInteraction?: CommandInteraction;
} & Partial<Parameters<typeof interactiveEdit>[0]> = {}) =>
  interactiveEdit({
    commandInteraction,
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
    ...rest,
  });

const checkSearchParams = async () => {
  await checkPrice();
  // TODO write an interactive routine for the rest of the parameters.

  await editSearchParams({ alwaysShowDefaultValues: true });
  await promptForSubmit({
    prompt:
      `Refine your search parameters with the above tool.` +
      "\n\n" +
      discordFormat(
        `When you're ready to start searching, click the ${stringPromptLabels.true} button below.`,
        {
          bold: true,
        }
      ) +
      "\n" +
      discordFormat(
        `You can edit search parameters at any time by typing ${discordFormat(
          `/${searchParamsCommandName}`,
          { monospace: true }
        )} in the chat.`,
        {
          italic: true,
        }
      ),
  });
};

export const discordInitRoutine = async () => {
  const advancedConfig = await persistent.advancedConfig.requireValue();
  if (!advancedConfig.botBehaviour?.suppressGreeting) {
    await discordSend(`🖐 Hi! I'm online.`);
  }

  await checkGoogleMapsAPIKey();
  await checkLocation().catch((e) => {
    if (!(e instanceof ValidationError)) {
      throw e;
    }
  });
  await checkSearchParams();
};
