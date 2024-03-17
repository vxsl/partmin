import { CommandInteraction } from "discord.js";
import {
  promptForBoolean,
  promptForString,
} from "discord/commands/interactive-simple.js";
import { successColor } from "discord/constants.js";
import { constructAndSendRichMessage } from "discord/interactive/index.js";
import { discordSend } from "discord/util.js";
import persistent from "persistent.js";
import {
  City,
  Circle,
  constructMapDevelopersURL,
  decodeMapDevelopersURL,
  identifyCity,
} from "util/geo.js";
import { log } from "util/log.js";
import { discordFormat } from "util/string.js";

export const setSearchAreas = async ({
  city,
  commandInteraction,
}: {
  city: City;
  commandInteraction?: CommandInteraction;
}) => {
  let mapDevelopersURL: string | undefined;
  let radii: Circle[] = [];

  while (!radii.length || mapDevelopersURL === undefined) {
    mapDevelopersURL = await promptForString({
      commandInteraction,
      name: "Search areas",
      prompt:
        discordFormat(
          "Please specify the neighborhood(s) you're interested in by drawing circles on the map.",
          {
            bold: true,
            link: constructMapDevelopersURL({ lat: city.lat, lon: city.lon }),
          }
        ) +
        "\n" +
        discordFormat("You can draw as many circles as you like!", {
          bold: true,
        }) +
        "\n" +
        discordFormat(
          "When you're done, copy the resulting URL, click the button below, and paste it"
        ),
    });

    try {
      radii = decodeMapDevelopersURL(mapDevelopersURL ?? "");
    } catch (e) {
      log(`Error decoding map developers URL: ${e}`);
      await discordSend(
        "The URL you provided doesn't appear to be valid. Please try again."
      );
      continue;
    }

    if (!radii.length) {
      await discordSend(
        "You didn't specify any search areas. Please try again."
      );
    }
  }

  const userConfig = await persistent.userConfig.requireValue();

  await persistent.userConfig.writeValue({
    ...userConfig,
    search: {
      ...userConfig.search,
      location: {
        city: city.city.toLowerCase(),
        region: city.regionShort,
        mapDevelopersURL,
      },
    },
  });

  await constructAndSendRichMessage({
    embeds: [
      {
        title: "🗺️  Search location set!",
        description: discordFormat(
          `You specified ${discordFormat(
            `${radii.length} ${radii.length === 1 ? "radius" : "radii"}`,
            { link: mapDevelopersURL }
          )} in ${discordFormat(`${city.city}, ${city.regionShort}`, {
            link: city.link,
          })}.`,
          { bold: true }
        ),
        color: successColor,
      },
    ],
  });
};

export const setLocation = async ({
  commandInteraction,
}: {
  commandInteraction?: CommandInteraction;
} = {}) => {
  while (true) {
    const cityInput = await promptForString({
      commandInteraction,
      name: "City",
    });

    try {
      const city = await identifyCity(cityInput);

      const bool = await promptForBoolean({
        commandInteraction,
        prompt: `Is ${discordFormat(`${city.city}, ${city.region}`, {
          link: city.link,
          avoidLinkPreviews: true,
        })} correct?`,
      });
      if (bool) {
        if (city.country !== "Canada") {
          await discordSend(
            "Sorry, only Canadian cities are supported at this time."
          );
          continue;
        }

        await setSearchAreas({ city, commandInteraction });
        break;
      }
    } catch (e) {
      log(`Error setting location: ${e}`);
      discordSend(
        `"${cityInput}" doesn't appear to be a valid city. Please try again.`
      );
      continue;
    }
  }
  return null;
};

export const discordInitRoutine = async () => {
  const advancedConfig = await persistent.advancedConfig.requireValue();
  if (!advancedConfig.botBehaviour?.suppressGreeting) {
    await discordSend(`🖐 Hi! I'm online.`);
  }

  const userConfig = await persistent.userConfig.value();
  const location = userConfig?.search.location;

  if (
    !location ||
    !location?.city ||
    !location?.region ||
    !location?.mapDevelopersURL
  ) {
    await discordSend(
      "It looks like you haven't set your search location yet."
    );
    await setLocation();
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
