import axios from "axios";
import haversine from "haversine";
import persistent from "persistent.js";
import { getUserConfig } from "util/config.js";
import { debugLog, log, verboseLog } from "util/log.js";
import { notUndefined } from "util/misc.js";
import { abbreviateDuration, sanitizeString } from "util/string.js";

const gMaps = "https://www.google.com/maps";
const gMapsAPIs = "https://maps.googleapis.com/maps/api";

const gMapsAPIKey = async () =>
  `key=${await persistent.googleMapsAPIKey.requireValue()}`;

export type City = {
  city: string;
  region: string;
  regionShort: string;
  country: string;
  lat: number;
  lon: number;
  link: string;
};

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
export class Circle {
  coords: Coordinates;
  radius: number;

  constructor(lat: number, lon: number, radius: number) {
    this.coords = new Coordinates(lat, lon);
    this.radius = radius;
  }

  static build({
    lat,
    lon,
    radius,
  }: {
    lat: number | undefined;
    lon: number | undefined;
    radius: number | undefined;
  }): Circle | undefined {
    if (lat !== undefined && lon !== undefined && radius !== undefined) {
      return new Circle(lat, lon, radius);
    }
    log(
      `Error building radius: ${Object.entries({ lat, lon, radius })
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
  static toString(r: Circle, options?: { truncate?: boolean }) {
    return `${Coordinates.toString(r.coords, {
      raw: true,
      truncate: options?.truncate,
    })},${options?.truncate ? r.radius.toFixed(3) : r.radius}`;
  }
}

export const decodeMapDevelopersURL = (url: string): Circle[] => {
  const circlesParam = url.match(/circles=([^&]*)/)?.[1];
  if (!circlesParam) {
    throw new Error("Error parsing mapDevelopersURL");
  }
  const decodedCirclesParam = decodeURIComponent(circlesParam);
  const circleData: string[] = JSON.parse(decodedCirclesParam);
  return circleData
    .map((circle) => {
      const [radius, lat, lon] = circle;
      if (radius === undefined || lat === undefined || lon === undefined) {
        throw new Error(`Error parsing circle data: ${circle}`);
      }
      return Circle.build({
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        radius: parseFloat(radius) / 1000,
      });
    })
    .filter(notUndefined);
};

export const constructMapDevelopersURL = (coords: Coordinates) => {
  return `https://www.mapdevelopers.com/draw-circle-tool.php?circles=${encodeURIComponent(
    `[[1000,${coords.lat},${coords.lon},"#AAAAAA","#000000",0.4]]`
  )}`;
};

export const isWithinRadii = async (coords: Coordinates) => {
  const config = await getUserConfig();
  const radii = decodeMapDevelopersURL(config.search.location.mapDevelopersURL);
  verboseLog(
    `checking if ${Coordinates.toString(coords)} is within ${
      radii.length > 1
        ? `any of ${radii.length} radii`
        : "the configured radius"
    }:`
  );
  verboseLog(radii.map((r) => Circle.toString(r)).join("\n"));
  const success = radii.find(
    (radius) =>
      haversine(
        { latitude: radius.lat, longitude: radius.lon },
        { latitude: coords.lat, longitude: coords.lon },
        { unit: "km" }
      ) <= radius.radius
  );
  verboseLog(
    `${Coordinates.toString(coords)} is ${
      success
        ? `within ${Circle.toString(success)}`
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
  const addresses = (await persistent.approximateAddresses.value()) ?? {};
  const cacheKey = Coordinates.toString(coords, { raw: true });
  const cached = addresses?.[cacheKey];
  if (cached) {
    const text = cached[0];
    const query = encodeURIComponent(cached[1]);
    const url = `${gMaps}/search/?api=1&query=${query}`;
    return { text, url };
  }

  const { data } = await axios.get(
    `${gMapsAPIs}/geocode/json?latlng=${coords.lat},${
      coords.lon
    }&${await gMapsAPIKey()}`
  );
  const comps = data.results[0].address_components;
  const displayAddr =
    comps.find((c: any) => c.types.includes("street_number"))?.short_name +
    " " +
    comps.find((c: any) => c.types.includes("route"))?.short_name +
    ", " +
    (comps.find((c: any) => c.types.includes("neighborhood"))?.short_name ??
      comps.find((c: any) => c.types.includes("sublocality"))?.short_name);

  await persistent.approximateAddresses.writeValue({
    ...addresses,
    [cacheKey]: [displayAddr, data.results[0].formatted_address],
  });

  const query = data.results[0].formatted_address;
  return { text: displayAddr, url: getGoogleMapsLink(query) };
};

export const identifyAddress = async (address: string) => {
  const { data } = await axios.get(
    `${gMapsAPIs}/geocode/json?address=${encodeURIComponent(
      address
    )}&${await gMapsAPIKey()}`
  );
  if (data.status !== "OK") {
    return undefined;
  }
  const result = data.results?.[0]?.formatted_address;
  if (typeof result !== "string") {
    return undefined;
  }
  return result;
};

export const isValidAddress = async (address: string) => {
  let result;
  const validities = (await persistent.addressValidity.value()) ?? {};
  if (address in validities) {
    debugLog(`Address found in cache: ${address}`);
    result = validities[address];
  } else {
    try {
      const { data } = await axios.get(
        `${gMapsAPIs}/geocode/json?address=${encodeURIComponent(
          address
        )}&${await gMapsAPIKey()}`
      );
      result = !!data.results[0]?.geometry?.location;
      await persistent.addressValidity.writeValue({
        ...validities,
        [address]: result,
      });
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
  const summaries = (await persistent.commuteSummaries.value()) ?? {};
  const cached = summaries[origin]?.[dest];
  let rawData: Partial<Record<CommuteMode, any>> = {};
  if (cached !== undefined) {
    debugLog(`Commute summary found in cache: ${origin} -> ${dest}`);
    return cached;
  } else {
    try {
      await Promise.all(
        commuteModes.map(async (mode) =>
          axios
            .get(
              `${gMapsAPIs}/distancematrix/json?units=metric&origins=${origin}&destinations=${dest}&${await gMapsAPIKey()}&mode=${mode}`
            )
            .then(({ data }) => {
              rawData[mode] = data.rows;
            })
        )
      );
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
  await persistent.commuteSummaries.writeValue({
    ...summaries,
    [origin]: { ...summaries[origin], [dest]: result },
  });

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

export const trimAddress = async (address: string): Promise<string> => {
  const config = await getUserConfig();
  const city = sanitizeString(config.search.location.city);
  const region = sanitizeString(config.search.location.region);
  const cityIndex = sanitizeString(address).lastIndexOf(city);
  const regionIndex = sanitizeString(address).lastIndexOf(region);
  if (cityIndex === 0 || regionIndex <= cityIndex) {
    return address;
  }
  const result = address.substring(0, cityIndex).trim();
  if (result[result.length - 1] === ",") {
    return result.substring(0, result.length - 1);
  }
  return result;
};

const sqFtToSqMetersRatio = 0.092903;
export const sqftToSqMeters = (s2: number) => s2 * sqFtToSqMetersRatio;
export const sqMetersToSqft = (m2: number) => m2 / sqFtToSqMetersRatio;
export const acresToSqft = (a: number) => a * 43560;

export const identifyCity = async (
  city: string,
  options?: { cacheOnly?: boolean }
) => {
  const cities = (await persistent.cities.value()) ?? {};
  const cached = cities?.[city];
  if (cached) {
    return cached;
  }
  if (options?.cacheOnly) {
    throw new Error(`City not found in cache: ${city}`);
  }

  const { data } = await axios.get(
    `${gMapsAPIs}/geocode/json?address=${city}&${await gMapsAPIKey()}&components=country:CA|types:locality`
  );

  const result = data?.results[0]?.address_components;
  const cityComponent = result?.find((c: any) =>
    c?.types?.includes("locality")
  );
  const regionComponent = result?.find((c: any) =>
    c?.types?.includes("administrative_area_level_1")
  );
  const countryComponent = result?.find((c: any) =>
    c?.types.includes("country")
  );
  const cityStr = cityComponent?.long_name;
  const regionStr = regionComponent?.long_name;
  const regionShortStr = regionComponent?.short_name;
  const countryStr = countryComponent?.long_name;
  const addressStr = data?.results[0]?.formatted_address;
  const lat = data?.results[0]?.geometry?.location?.lat;
  const lon = data?.results[0]?.geometry?.location?.lng;
  if (
    typeof cityStr !== "string" ||
    typeof regionStr !== "string" ||
    typeof regionShortStr !== "string" ||
    typeof countryStr !== "string" ||
    typeof addressStr !== "string" ||
    typeof lat !== "number" ||
    typeof lon !== "number"
  ) {
    throw new Error(`Error inferring geo data from city name: ${city}`);
  }

  const c: City = {
    city: cityStr,
    region: regionStr,
    regionShort: regionShortStr,
    country: countryStr,
    lat,
    lon,
    link: getGoogleMapsLink(addressStr),
  };
  await persistent.cities.writeValue({ ...cities, [city]: c });
  return c;
};

export const gmapsAPIKeyIsValid = async (key: string) => {
  try {
    const { data } = await axios.get(
      `${gMapsAPIs}/geocode/json?address=Toronto&key=${key}`
    );
    return data.status === "OK";
  } catch (e) {
    return false;
  }
};
