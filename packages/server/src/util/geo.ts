import haversine from "haversine";
import config from "config.js";
import { debugLog, log, verboseLog } from "util/log.js";
import { tmpDir } from "constants.js";
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

  toString(options?: { raw?: boolean }) {
    return options?.raw
      ? `${this.lat},${this.lon}`
      : `(${this.lat}, ${this.lon})`;
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
  toString() {
    return `${this.coords.toString({ raw: true })},${this.diam}`;
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
    `checking if ${coords.lat}, ${coords.lon} is within ${radii.length} radii:`
  );
  verboseLog(radii.map((r) => r.toString()));
  const success = radii.find(
    (radius) =>
      haversine(
        { latitude: radius.lat, longitude: radius.lon },
        { latitude: coords.lat, longitude: coords.lon },
        { unit: "km" }
      ) <= radius.diam
  );
  verboseLog(
    `${coords.toString()} is ${
      success ? `within ${success.toString()}` : "not within any of the radii"
    }`
  );
  return success !== undefined;
};

export const getGoogleMapsLink = (query: string) =>
  `${gMaps}/search/?api=1&query=${encodeURIComponent(query)}`;

export const approxLocationLink = async (coords: Coordinates) => {
  const key = coords.toString({ raw: true });
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
