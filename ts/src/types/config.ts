export type Config = {
  search: {
    minArea?: number;
    parkingIncluded: boolean;
    bedrooms: {
      min: number;
    };
    propertyType: ["apartment-condo", "house", "townhouse"];
    location: {
      city: string;
      region: string;
      lat: number;
      lng: number;
      radius: number;
      mapDevelopersURL: string;
    };
    price: {
      min: number;
      max: number;
    };
    blacklist: string[];
  };
};
