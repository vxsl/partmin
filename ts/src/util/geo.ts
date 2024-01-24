import haversine from "haversine";
import { Config } from "../types/config.js";
import { verboseLog } from "./misc.js";
import { tmpDir } from "../constants.js";
import { readJSON, writeJSON } from "./io.js";
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

export const isWithinRadii = (lat: number, lon: number, config: Config) => {
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

export const withinRadius = ({
  lat,
  lon,
  radiusLat,
  radiusLon,
  radiusDiameterKm,
}: {
  lat: number;
  lon: number;
  radiusLat: number;
  radiusLon: number;
  radiusDiameterKm: number;
}) => {
  const distance = haversine(
    { latitude: radiusLat, longitude: radiusLon },
    { latitude: lat, longitude: lon },
    { unit: "km" }
  );
  const result = distance <= radiusDiameterKm;
  return result;
};
