export type Config = {
  search: {
    minArea?: number;
    parkingIncluded?: boolean;
    bedrooms: {
      min: number;
    };
    outdoorSpace?: boolean;
    // propertyType: ["apartment-condo", "house", "townhouse"];
    basementOK: boolean;
    roommateOK: boolean;
    petFriendly?: boolean;
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
