import haversine from "haversine";
import config from "config.js";
import { debugLog, log, verboseLog } from "util/log.js";
import { dataDir } from "constants.js";
import { readJSON, writeJSON } from "util/io.js";
import axios from "axios";
import { abbreviateDuration } from "util/data.js";
import { notUndefined } from "util/misc.js";

const gMaps = "https://www.google.com/maps";
const gMapsAPIs = "https://maps.googleapis.com/maps/api";

export class Coordinates {
  lat: number;
  lon: number;

  constructor(lat: number, lon: number) {
    this.lat = lat;
    this.lon = lon;
  }

  static build(
    lat: number | undefined,
    lon: number | undefined
  ): Coordinates | undefined {
    if (lat !== undefined && lon !== undefined) {
      return new Coordinates(lat, lon);
    }
  }

  static toString(
    c: Coordinates,
    options?: { raw?: boolean; truncate?: boolean }
  ) {
    const lat = options?.truncate ? c.lat.toFixed(3) : c.lat;
    const lon = options?.truncate ? c.lon.toFixed(3) : c.lon;
    return options?.raw ? `${lat},${lon}` : `(${lat}, ${lon})`;
  }
}
export class Radius {
  coords: Coordinates;
  diam: number;

  constructor(lat: number, lon: number, diam: number) {
    this.coords = new Coordinates(lat, lon);
    this.diam = diam;
  }

  static build({
    lat,
    lon,
    diam,
  }: {
    lat: number | undefined;
    lon: number | undefined;
    diam: number | undefined;
  }): Radius | undefined {
    if (lat !== undefined && lon !== undefined && diam !== undefined) {
      return new Radius(lat, lon, diam);
    }
    log(
      `Error building radius: ${Object.entries({ lat, lon, diam })
        .filter(([, v]) => v === undefined)
        .map(([k]) => k)
        .join(", ")} undefined`
    );
  }

  get lat() {
    return this.coords.lat;
  }
  get lon() {
    return this.coords.lon;
  }
  toString(options?: { truncate?: boolean }) {
    return `${Coordinates.toString(this.coords, {
      raw: true,
      truncate: options?.truncate,
    })},${options?.truncate ? this.diam.toFixed(3) : this.diam}`;
  }
}

export const decodeMapDevelopersURL = (url: string): Radius[] => {
  const circlesParam = url.match(/circles=([^&]*)/)?.[1];
  if (!circlesParam) {
    throw new Error("Error parsing mapDevelopersURL");
  }
  const decodedCirclesParam = decodeURIComponent(circlesParam);
  const circleData: string[] = JSON.parse(decodedCirclesParam);
  return circleData
    .map((circle) => {
      const [radius, lat, lon] = circle;
      return Radius.build({
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        diam: parseFloat(radius) / 1000,
      });
    })
    .filter(notUndefined);
};

export const isWithinRadii = (coords: Coordinates) => {
  const radii = decodeMapDevelopersURL(config.search.location.mapDevelopersURL);
  verboseLog(
    `checking if ${Coordinates.toString(coords)} is within ${
      radii.length > 1
        ? `any of ${radii.length} radii`
        : "the configured radius"
    }:`
  );
  verboseLog(radii.map((r) => r.toString()).join("\n"));
  const success = radii.find(
    (radius) =>
      haversine(
        { latitude: radius.lat, longitude: radius.lon },
        { latitude: coords.lat, longitude: coords.lon },
        { unit: "km" }
      ) <= radius.diam
  );
  verboseLog(
    `${Coordinates.toString(coords)} is ${
      success
        ? `within ${success.toString()}`
        : `not within ${
            radii.length > 1
              ? `any of the ${radii.length} radii`
              : "the configured radius"
          }`
    }`
  );
  return success !== undefined;
};

export const getGoogleMapsLink = (query: string) =>
  `${gMaps}/search/?api=1&query=${encodeURIComponent(query)}`;

export const approxLocationLink = async (coords: Coordinates) => {
  const key = Coordinates.toString(coords, { raw: true });
  const cacheFile = `${dataDir}/approximate-addresses.json`;
  const cache = await readJSON<{ [k: string]: [string, string] }>(cacheFile);
  const cached = cache?.[key];
  if (cached) {
    const text = cached[0];
    const query = encodeURIComponent(cached[1]);
    const url = `${gMaps}/search/?api=1&query=${query}`;
    return { text, url };
  }

  const { data } = await axios.get(
    `${gMapsAPIs}/geocode/json?latlng=\
      ${coords.lat},${coords.lon}\
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
  return { text: displayAddr, url: getGoogleMapsLink(query) };
};

export const isValidAddress = async (address: string) => {
  let result;
  const cacheFile = `${dataDir}/address-validity.json`;
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
    } catch (e) {
      debugLog(`Error validating address: ${address}`);
      debugLog(e);
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
  const cacheFile = `${dataDir}/commute-summaries.json`;
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

  const result = Object.fromEntries(
    commuteModes.map((mode) => {
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
