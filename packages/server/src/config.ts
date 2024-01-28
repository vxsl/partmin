import {
  Array,
  Boolean,
  Literal,
  Number,
  Optional,
  Record as RuntypeRecord,
  Static,
  String,
} from "runtypes";
import { RuntypeBase } from "runtypes/lib/runtype.js";
import { LogLevel } from "util/log.js";
import _config from "../../../config.json";

const Options = RuntypeRecord({
  computeDistanceTo: Optional(Array(String)),
});

const SearchParams = RuntypeRecord({
  outdoorSpace: Optional(Boolean),
  basementNotAccepted: Optional(Literal(true)),
  roommateNotAccepted: Optional(Literal(true)),
  petFriendly: Optional(Boolean),
  price: RuntypeRecord({
    min: Number,
    max: Number,
  }),
});

const Location = RuntypeRecord({
  city: String,
  region: String,
  mapDevelopersURL: String,
});

const Logging = RuntypeRecord<Record<LogLevel, RuntypeBase>>({
  debug: Optional(Boolean),
  verbose: Optional(Boolean),
});

const Development = RuntypeRecord({
  headed: Optional(Boolean),
  testing: Optional(Boolean),
  skipGreeting: Optional(Boolean),
});

const Config = RuntypeRecord({
  development: Optional(Development),
  logging: Optional(Logging),
  options: Optional(Options),
  search: RuntypeRecord({
    params: SearchParams,
    location: Location,
    blacklist: Optional(Array(String)),
  }),
});

export type Config = Static<typeof Config>;

const config = Config.check(_config);

export default config;
