import { setLocation } from "discord/commands/location.js";
import {
  promptForString,
  stringPromptLabels,
} from "discord/commands/util/interactive-simple.js";
import { discordSend } from "discord/util.js";
import persistent from "persistent.js";
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
        await discordSend(`A Google Maps API is required.`);
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

export const discordInitRoutine = async () => {
  const advancedConfig = await persistent.advancedConfig.requireValue();
  if (!advancedConfig.botBehaviour?.suppressGreeting) {
    await discordSend(`🖐 Hi! I'm online.`);
  }

  await checkGoogleMapsAPIKey();
  await checkLocation();
};
