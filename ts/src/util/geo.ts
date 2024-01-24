import haversine from "haversine";
import { Config } from "../types/config.js";
import { verboseLog } from "./misc.js";

const decodeMapDevelopersURL = (
  url: string
): { lat: number; lon: number; radius: number }[] => {
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
      radius: parseFloat(radius) / 1000,
    };
  });
};

export const withinRadii = (lat: number, lon: number, config: Config) => {
  const radii = decodeMapDevelopersURL(config.search.location.mapDevelopersURL);
  verboseLog(`checking if ${lat}, ${lon} is within ${radii.length} radii:`);
  verboseLog(radii);
  let success: { lat: number; lon: number } | undefined;
  const result = radii.some((radius) => {
    const result = withinRadius({
      lat,
      lon,
      radiusLat: radius.lat,
      radiusLon: radius.lon,
      radiusDiameterKm: radius.radius,
    });
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
