import haversine from "haversine";
import { Config } from "../types/config.js";
import { verboseLog } from "./misc.js";

export const withinRadius = (lat: number, lon: number, config: Config) => {
  verboseLog(
    `checking if ${lat}, ${lon} is within ${config.search.location.radius}km radius of ${config.search.location.lat}, ${config.search.location.lng}`
  );
  const center = {
    latitude: config.search.location.lat,
    longitude: config.search.location.lng,
  };
  const target = { latitude: lat, longitude: lon };
  const distance = haversine(center, target, { unit: "km" });
  const result = distance <= config.search.location.radius;

  verboseLog(
    `(${lat}, ${lon}) is${!result ? " NOT" : ""} within radius (${
      config.search.location.lat
    }, ${config.search.location.lng})`
  );
  return result;
};
