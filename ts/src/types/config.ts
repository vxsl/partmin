export type Config = {
  search: {
    // minArea?: number;
    // parkingIncluded?: boolean;
    // bedrooms: {
    //   min: number;
    // };
    outdoorSpace?: boolean;
    // propertyType: ["apartment-condo", "house", "townhouse"];
    basementNotAccepted?: true;
    roommateNotAccepted?: true;
    petFriendly?: boolean;
    location: {
      city: string;
      region: string;
      mapDevelopersURL: string;
    };
    price: {
      min: number;
      max: number;
    };
    blacklist: string[];
  };
};
