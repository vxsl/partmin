import {
  Array,
  Boolean,
  Literal,
  Optional,
  Number as RuntypeNumber,
  Record as RuntypeRecord,
  Static,
  String,
} from "runtypes";
import { RuntypeBase } from "runtypes/lib/runtype.js";
import { LogLevel, log } from "util/log.js";
import _config from "../../../../config/config.json";

const Options = RuntypeRecord({
  computeDistanceTo: Optional(Array(String)),
});

const SearchParams = RuntypeRecord({
  outdoorSpace: Optional(Boolean),
  excludeBasements: Optional(Literal(true)),
  excludeShared: Optional(Literal(true)),
  petFriendly: Optional(Boolean),
  price: RuntypeRecord({
    min: RuntypeNumber,
    max: RuntypeNumber,
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
  noSandbox: Optional(Boolean),
});

const Config = RuntypeRecord({
  development: Optional(Development),
  logging: Optional(Logging),
  options: Optional(Options),
  search: RuntypeRecord({
    params: SearchParams,
    location: Location,
    blacklist: Optional(Array(String)),
    blacklistRegex: Optional(Array(String)),
  }),
});

export type Config = Static<typeof Config>;

const config = Config.check(_config);
config.search.blacklistRegex?.forEach((r) => {
  try {
    new RegExp(r);
  } catch (e) {
    throw new Error(`Invalid blacklistRegex in config: ${r}`);
  }
});

process.argv.slice(2).forEach((arg) => {
  const [_key, value] = arg.split("=");
  if (_key && value) {
    const key = _key.split("--")[1];
    const path = key.split(".");
    let obj = config;
    for (let i = 0; i < path.length - 1; i++) {
      obj = obj[path[i]];
    }
    const lastKey = path[path.length - 1];
    let v;
    if (value === "true" || value === "false") {
      v = value === "true";
    } else if (!isNaN(Number(value))) {
      v = Number(value);
    } else {
      v = value;
    }
    log(
      `Overriding config value ${key}: ${v} (original value ${obj[lastKey]})`
    );
    obj[lastKey] = v;
  }
});

export default config;
