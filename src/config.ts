import {
  Array,
  Boolean,
  Literal,
  Number,
  Optional,
  Record,
  Static,
  String,
} from "runtypes";
import _config from "../config.json";

const SearchParams = Record({
  outdoorSpace: Optional(Boolean),
  basementNotAccepted: Optional(Literal(true)),
  roommateNotAccepted: Optional(Literal(true)),
  petFriendly: Optional(Boolean),
  price: Record({
    min: Number,
    max: Number,
  }),
});

const Location = Record({
  city: String,
  region: String,
  mapDevelopersURL: String,
});

const Logging = Record({
  debug: Optional(Boolean),
  verbose: Optional(Boolean),
});

const Development = Record({
  headed: Optional(Boolean),
  testing: Optional(Boolean),
  skipGreeting: Optional(Boolean),
});

const Config = Record({
  development: Optional(Development),
  logging: Optional(Logging),
  search: Record({
    params: SearchParams,
    location: Location,
    blacklist: Optional(Array(String)),
  }),
});

export type Config = Static<typeof Config>;

const config = Config.check(_config);

export default config;
