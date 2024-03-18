import { CommandInteraction } from "discord.js";
import {
  InteractiveMessageCancel,
  InteractiveMessageDone,
  interactiveMessageCancel,
  interactiveMessageDone,
  promptForBoolean,
  promptForString,
  stringPromptLabels,
} from "discord/commands/interactive-simple.js";
import { discordSend } from "discord/util.js";
import persistent from "persistent.js";
import {
  Circle,
  City,
  constructMapDevelopersURL,
  decodeMapDevelopersURL,
  getGoogleMapsLink,
  gmapsAPIKeyIsValid,
  identifyAddress,
  identifyCity,
} from "util/geo.js";
import { log } from "util/log.js";
import { discordFormat } from "util/string.js";

const getCity = async ({
  commandInteraction,
  skipPrompt,
}: {
  commandInteraction?: CommandInteraction;
  skipPrompt?: boolean;
}) => {
  if (skipPrompt) {
    const userConfig = await persistent.userConfig.requireValue();
    const cached = await identifyCity(`${userConfig.search.location.city}`, {
      cacheOnly: true,
    }).catch(() => undefined);
    if (cached) {
      return cached;
    }
  }

  while (true) {
    const cityInput = await promptForString({
      commandInteraction,
      name: "City",
    });
    if (
      cityInput === interactiveMessageCancel ||
      cityInput === interactiveMessageDone
    ) {
      return interactiveMessageCancel;
    }

    try {
      const city = await identifyCity(cityInput);

      if (
        !(await promptForBoolean({
          commandInteraction,
          prompt: discordFormat(
            `Is ${discordFormat(`${city.city}, ${city.region}`, {
              link: city.link,
              avoidLinkPreviews: true,
            })} correct?`,
            { bold: true }
          ),
        }))
      ) {
        continue;
      }

      if (city.country !== "Canada") {
        await discordSend(
          "Sorry, only Canadian cities are supported at this time."
        );
        continue;
      }

      return city;
    } catch (e) {
      log(`Error setting location: ${e}`);
      discordSend(
        `"${cityInput}" doesn't appear to be a valid city. Please try again.`
      );
      continue;
    }
  }
};

const getCommuteDestinations = async ({
  commandInteraction,
}: {
  commandInteraction?: CommandInteraction;
}) => {
  let results: string[] = [];

  while (true) {
    const s = await promptForString({
      commandInteraction,
      doneButton: true,
      name: "Commute destination",
      prompt: discordFormat(
        `Please specify a commute destination by clicking the ${stringPromptLabels.edit} button below.`,
        { bold: true }
      ),
    });

    if (s === interactiveMessageCancel) {
      return interactiveMessageCancel;
    }
    if (s === interactiveMessageDone) {
      return results;
    }

    const v = await identifyAddress(s);

    if (v === undefined) {
      await discordSend(
        "The commute destination you provided doesn't appear to be valid. Please try again."
      );
      continue;
    }

    if (
      !(await promptForBoolean({
        commandInteraction,
        prompt: discordFormat(
          `Is ${discordFormat(`${v}`, {
            link: getGoogleMapsLink(v),
            avoidLinkPreviews: true,
          })} correct?`,
          { bold: true }
        ),
      }))
    ) {
      continue;
    }

    results.push(v);
  }
};

const getSearchAreas = async ({
  city,
  commandInteraction,
  skipPrompt,
}: {
  city: City;
  commandInteraction?: CommandInteraction;
  skipPrompt?: boolean;
}) => {
  if (skipPrompt) {
    const userConfig = await persistent.userConfig.requireValue();
    return {
      circles: decodeMapDevelopersURL(
        userConfig.search.location.mapDevelopersURL
      ),
      mapDevelopersURL: userConfig.search.location.mapDevelopersURL,
    };
  }
  let mapDevelopersURL:
    | string
    | InteractiveMessageCancel
    | InteractiveMessageDone
    | undefined;
  let results: Circle[] = [];

  while (true) {
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
          `When you're done, copy the resulting URL, click the ${stringPromptLabels.edit} button below, and paste it.`
        ),
    });

    if (
      mapDevelopersURL === interactiveMessageCancel ||
      mapDevelopersURL === interactiveMessageDone
    ) {
      return interactiveMessageCancel;
    }

    try {
      results = decodeMapDevelopersURL(mapDevelopersURL ?? "");
    } catch (e) {
      log(`Error decoding map developers URL: ${e}`);
      await discordSend(
        "The URL you provided doesn't appear to be valid. Please try again."
      );
      continue;
    }

    if (results.length) {
      return {
        mapDevelopersURL,
        circles: results,
      };
    }

    await discordSend("You didn't specify any search areas. Please try again.");
  }
};

export const getSearchLocationSummary = async () => {
  const userConfig = await persistent.userConfig.requireValue();
  const circles = decodeMapDevelopersURL(
    userConfig.search.location.mapDevelopersURL
  );
  const loc = userConfig.search.location;
  const city = await identifyCity(loc.city);

  return `The search area is currently set to ${discordFormat(
    `${circles.length} ${circles.length === 1 ? "radius" : "radii"}`,
    { link: loc.mapDevelopersURL }
  )} in ${discordFormat(`${city.city}, ${city.regionShort}`, {
    link: city.link,
  })}.`;
};

export const getCommuteDestinationsSummary = async () => {
  const userConfig = await persistent.userConfig.requireValue();
  const dests = userConfig.search.location?.commuteDestinations ?? [];

  if (!dests.length) {
    return discordFormat(
      "No commute destinations set. A commute summary will not be generated for new listings.",
      { italic: true }
    );
  }

  return discordFormat(
    `${dests.length} commute destination${
      dests.length === 1 ? " has" : "s have"
    } been configured:\n${dests
      .map((d) => `- ${discordFormat(d, { link: getGoogleMapsLink(d) })}`)
      .join("\n")}`
  );
};

export const setLocation = async ({
  commandInteraction,
  skipCityPrompt,
  skipSearchAreasPrompt,
}: {
  commandInteraction?: CommandInteraction;
  skipCityPrompt?: boolean;
  skipSearchAreasPrompt?: boolean;
} = {}) => {
  while (true) {
    const city = await getCity({
      commandInteraction,
      skipPrompt: skipCityPrompt,
    });
    if (city === interactiveMessageCancel) {
      break;
    }

    const searchAreas = await getSearchAreas({
      city,
      commandInteraction,
      skipPrompt: skipSearchAreasPrompt,
    });
    if (searchAreas === interactiveMessageCancel) {
      break;
    }

    const commuteDestinations = (await promptForBoolean({
      commandInteraction,
      prompt:
        discordFormat("Would you like to provide any commute destinations?", {
          bold: true,
        }) +
        "\n" +
        "A commute summary will be generated for each new listing. These destinations can be set/modified later.",
    }))
      ? await getCommuteDestinations({
          commandInteraction,
        })
      : [];
    if (commuteDestinations === interactiveMessageCancel) {
      break;
    }

    const { mapDevelopersURL } = searchAreas;

    let userConfig = await persistent.userConfig.requireValue();
    await persistent.userConfig.writeValue({
      ...userConfig,
      search: {
        ...userConfig.search,
        location: {
          city: city.city.toLowerCase(),
          region: city.regionShort,
          mapDevelopersURL,
          commuteDestinations,
        },
      },
    });
    userConfig = await persistent.userConfig.requireValue();

    break;
  }
  return null;
};

export const discordInitRoutine = async () => {
  const advancedConfig = await persistent.advancedConfig.requireValue();
  if (!advancedConfig.botBehaviour?.suppressGreeting) {
    await discordSend(`🖐 Hi! I'm online.`);
  }

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

  const locationIsSet = async () => {
    const userConfig = await persistent.userConfig.value();
    const location = userConfig?.search.location;
    return (
      location && location.city && location.region && location.mapDevelopersURL
    );
  };

  if (!(await locationIsSet())) {
    await discordSend(
      "It looks like you haven't set your search location yet."
    );
    while (true) {
      await setLocation();
      if (await locationIsSet()) {
        break;
      }
      await discordSend(
        "partmin can't run without a search location. Please set your search location to continue."
      );
    }
  }
};
