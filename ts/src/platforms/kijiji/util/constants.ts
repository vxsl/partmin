import { Config } from "types/config.js";

export const rentalCategory = "b-apartments-condos";
export const canadaStr = "canada";
export const canadaID = "c37l0";
export const baseURL = `https://www.kijiji.ca/${rentalCategory}/${canadaStr}/${canadaID}`;

type RecursiveKeyMap<T> = {
  [K in keyof T]: T[K] extends object ? RecursiveKeyMap<T[K]> : string;
};
const configDict: RecursiveKeyMap<Config> = {
  search: {
    minArea: "Size (sqft)",
    parkingIncluded: "test",
    bedrooms: {
      min: "test",
    },
    propertyType: ["apartment-condo", "house", "townhouse"],
    location: {
      city: "test",
      region: "test",
      lat: "test",
      lng: "test",
      radius: "test",
      mapDevelopersURL: "test",
    },
    price: {
      min: "test",
      max: "test",
    },
    blacklist: ["test"],
  },
};
