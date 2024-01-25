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

const Config = Record({
  headless: Optional(Boolean),
  testing: Optional(Boolean),
  verbose: Optional(Boolean),
  debug: Optional(Boolean),
  skipGreeting: Optional(Boolean),
  search: Record({
    params: SearchParams,
    location: Location,
    blacklist: Optional(Array(String)),
  }),
});

export type Config = Static<typeof Config>;

const config = Config.check(_config);

export default config;
