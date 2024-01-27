import haversine from "haversine";
import config from "config.js";
import { debugLog, verboseLog } from "util/log.js";
import { tmpDir } from "constants.js";
import { readJSON, writeJSON } from "util/io.js";
import axios from "axios";
import { abbreviateDuration } from "util/data.js";

const gMaps = "https://www.google.com/maps";
const gMapsAPIs = "https://maps.googleapis.com/maps/api";

// TODO move to types?
// TODO ensure everything is using this instead of { lat, lon, radius }
export type Radius = {
  lat: number;
  lon: number;
  diam: number;
};

export const decodeMapDevelopersURL = (url: string): Radius[] => {
  const circlesParam = url.match(/circles=([^&]*)/)?.[1];
  if (!circlesParam) {
    throw new Error("Error parsing mapDevelopersURL");
  }
  const decodedCirclesParam = decodeURIComponent(circlesParam);
  const circleData = JSON.parse(decodedCirclesParam);
  return circleData.map((circle: string) => {
    const [radius, lat, lon] = circle;
    return {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      diam: parseFloat(radius) / 1000,
    };
  });
};

export const isWithinRadii = (lat: number, lon: number) => {
  const radii = decodeMapDevelopersURL(config.search.location.mapDevelopersURL);
  verboseLog(`checking if ${lat}, ${lon} is within ${radii.length} radii:`);
  verboseLog(radii);
  let success: { lat: number; lon: number } | undefined;
  const result = radii.some((radius) => {
    const result =
      haversine(
        { latitude: radius.lat, longitude: radius.lon },
        { latitude: lat, longitude: lon },
        { unit: "km" }
      ) <= radius.diam;
    if (result) {
      success = radius;
    }
    return result;
  });
  verboseLog(
    success
      ? `(${lat}, ${lon}) is within (${success.lat}, ${success.lon})`
      : `(${lat}, ${lon}) is not within any of the ${radii.length} radii`
  );
  return result;
};

export const getGoogleMapsLink = (query: string) =>
  `${gMaps}/search/?api=1&query=${encodeURIComponent(query)}`;

export const approxLocationLink = async (lat: number, lon: number) => {
  const key = `${lat},${lon}`;
  const cacheFile = `${tmpDir}/approximate-addresses.json`;
  const cache = await readJSON<{ [k: string]: [string, string] }>(cacheFile);
  const cached = cache?.[key];
  if (cached) {
    const display = cached[0];
    const query = encodeURIComponent(cached[1]);
    const link = `${gMaps}/search/?api=1&query=${query}`;
    return `[*${display} **(approx.)***](${link})`;
  }

  const { data } = await axios.get(
    `${gMapsAPIs}/geocode/json?latlng=\
      ${lat},${lon}\
      &key=${process.env.GOOGLE_MAPS_API_KEY}`
  );
  const comps = data.results[0].address_components;
  const displayAddr =
    comps.find((c: any) => c.types.includes("street_number"))?.short_name +
    " " +
    comps.find((c: any) => c.types.includes("route"))?.short_name +
    ", " +
    (comps.find((c: any) => c.types.includes("neighborhood"))?.short_name ??
      comps.find((c: any) => c.types.includes("sublocality"))?.short_name);

  await writeJSON(cacheFile, {
    ...cache,
    [key]: [displayAddr, data.results[0].formatted_address],
  });

  const query = data.results[0].formatted_address;
  return `[*${displayAddr} **(approx.)***](${getGoogleMapsLink(query)})`;
};

export const isValidAddress = async (address: string) => {
  let result;
  const cacheFile = `${tmpDir}/address-validity.json`;
  const cache =
    (await readJSON<{ [k: string]: [string, string] }>(cacheFile)) ?? {};
  if (address in cache) {
    debugLog(`Address found in cache: ${address}`);
    result = cache[address];
  } else {
    try {
      const { data } = await axios.get(
        `${gMapsAPIs}/geocode/json?address=${encodeURIComponent(address)}&key=${
          process.env.GOOGLE_MAPS_API_KEY
        }`
      );
      result = !!data.results[0].geometry.location;
      await writeJSON(cacheFile, { ...cache, [address]: result });
    } catch {
      debugLog(`Error validating address: ${address}`);
      result = false;
    }
  }
  debugLog(
    result ? `Address is valid: ${address}` : `Address is invalid: ${address}`
  );
  return result;
};

const commuteModes = ["transit", "bicycling", "driving", "walking"] as const;
type CommuteMode = (typeof commuteModes)[number];
export type CommuteSummary = Record<CommuteMode, string>;

export const getCommuteSummary = async (origin: string, dest: string) => {
  const cacheFile = `${tmpDir}/commute-summaries.json`;
  let rawData: Partial<Record<CommuteMode, any>> = {};
  const cache =
    (await readJSON<Record<string, Record<string, CommuteSummary>>>(
      cacheFile
    )) ?? {};
  const cached = cache[origin]?.[dest];
  if (cached !== undefined) {
    debugLog(`Commute summary found in cache: ${origin} -> ${dest}`);
    rawData = cached;
  } else {
    try {
      await Promise.all(
        commuteModes.map((mode) =>
          axios
            .get(
              `${gMapsAPIs}/distancematrix/json?units=metric&origins=${origin}&destinations=${dest}&key=${process.env.GOOGLE_MAPS_API_KEY}&mode=${mode}`
            )
            .then(({ data }) => {
              rawData[mode] = data.rows;
            })
        )
      );

      await writeJSON(cacheFile, {
        ...cache,
        [origin]: { ...cache[origin], [dest]: rawData },
      });
    } catch (e) {
      debugLog(`Error computing commute summary: ${origin} -> ${dest}`);
      debugLog(e);
    }
  }

  if (Object.keys(rawData).length === 0) {
    debugLog(`Erroneous commute data (${origin} -> ${dest}):`);
    debugLog(rawData);
    return undefined;
  }

  console.log(JSON.stringify(rawData, null, 2));
  const result = Object.fromEntries(
    commuteModes.map((mode) => {
      console.log(rawData[mode]);
      return [
        mode,
        rawData[mode]?.[0]?.elements?.[0]?.duration?.text ?? "<missing>",
      ];
    })
  ) as CommuteSummary;

  debugLog(`Commute summary computed: ${origin} -> ${dest}`);
  debugLog(result);
  return result;
};

const commuteEmojis: Record<CommuteMode, string> = {
  transit: "🚌",
  walking: "🚶",
  bicycling: "🚴",
  driving: "🚗",
};

export const formatCommuteSummaryMD = (
  summary: CommuteSummary,
  orig: string,
  dest: string
) => {
  const url =
    `${gMaps}/dir/` + `${encodeURIComponent(orig)}/${encodeURIComponent(dest)}`;
  return `[*${commuteModes
    .map((mode) => `${commuteEmojis[mode]}${abbreviateDuration(summary[mode])}`)
    .join("  ")}*](${url})`;
};
