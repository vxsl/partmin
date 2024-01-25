import config from "../config.json" assert { type: "json" };

export type Config = {
  headless?: boolean;
  testing?: boolean;
  verbose?: boolean;
  debug?: boolean;
  skipGreeting?: boolean;

  search: {
    params: {
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
      price: {
        min: number;
        max: number;
      };
    };

    location: {
      city: string;
      region: string;
      mapDevelopersURL: string;
    };
    blacklist: string[];
  };
};

export default config as Config;
