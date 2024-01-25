import haversine from "haversine";
import config from "config.js";
import { debugLog, verboseLog } from "util/misc.js";
import { tmpDir } from "constants.js";
import { readJSON, writeJSON } from "util/io.js";
import axios from "axios";

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
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query
  )}`;

export const approxLocationLink = async (lat: number, lon: number) => {
  const key = `${lat},${lon}`;
  const cacheFile = `${tmpDir}/approximate-addresses.json`;
  const cache = await readJSON<{ [k: string]: [string, string] }>(cacheFile);
  const cached = cache?.[key];
  if (cached) {
    const display = cached[0];
    const query = encodeURIComponent(cached[1]);
    const link = `https://www.google.com/maps/search/?api=1&query=${query}`;
    return `[*${display} **(approx.)***](${link})`;
  }

  const { data } = await axios.get(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=\
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
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          address
        )}&key=${process.env.GOOGLE_MAPS_API_KEY}`
      );
      result = !!data.results[0].geometry.location;
    } catch {
      debugLog(`Error validating address: ${address}`);
      result = false;
    }
    await writeJSON(cacheFile, { ...cache, [address]: result });
  }
  debugLog(
    result ? `Address is valid: ${address}` : `Address is invalid: ${address}`
  );
  return result;
};
