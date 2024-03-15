import { greetings } from "discord/chat.js";
import { constructAndSendRichMessage } from "discord/interactive/index.js";
import { discordSend } from "discord/util.js";
import persistent from "persistent.js";

export const setLocation = async () => {
  await constructAndSendRichMessage({
    embeds: [
      {
        title: "Set your location",
        description: "Please enter your location",
        color: "info",
      },
    ],
  });
};

export const discordInitRoutine = async () => {
  const advancedConfig = await persistent.advancedConfig.requireValue();
  if (!advancedConfig.botBehaviour?.suppressGreeting) {
    await discordSend(greetings[Math.floor(Math.random() * greetings.length)]);
  }

  const userConfig = await persistent.userConfig.value();
  console.log("🚀  userConfig:", userConfig);

  const location = userConfig?.search.location;
  console.log("🚀  location:", location);

  if (
    !location ||
    !location?.city ||
    !location?.region ||
    !location?.mapDevelopersURL
  ) {
    await setLocation();
    // await discordSend(
    //   "You have not set your location. Please use `!set-location` to set your location."
    // );
  }

  // if (config?.options?.disableGoogleMapsFeatures) {
  //   log(
  //     "Google Maps features are disabled. You can enable them by removing the 'options.disableGoogleMapsFeatures' config option."
  //   );
  // } else {
  //   await cache.googleMapsAPIKey.requireValue({
  //     message: `A Google Maps API key with permissions for the Geocoding and Distance Matrix APIs is required for some partmin features. ${cache.googleMapsAPIKey.envVarInstruction}\n\nYou may disable these features by setting the 'options.disableGoogleMapsFeatures' config option.`,
  //   });
  // }
};
