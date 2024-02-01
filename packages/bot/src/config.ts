import {
  Array,
  Boolean,
  Optional,
  Number as RuntypeNumber,
  Record as RuntypeRecord,
  Static,
  String,
} from "runtypes";
import { RuntypeBase } from "runtypes/lib/runtype.js";
import { LogLevel, log, logNoDiscord } from "util/log.js";
import _config from "../../../config/config.json";

const UnreliableParams = RuntypeRecord({
  minAreaSqFt: Optional(RuntypeNumber),
  outdoorSpace: Optional(Boolean),
  parking: Optional(Boolean),
  petsStrict: Optional(Boolean),
});

export const unreliabilityExplanations: Record<
  keyof Static<typeof UnreliableParams>,
  string
> = {
  // TODO ensure functionality matches these descriptions:
  minAreaSqFt:
    "This will exclude listings that specify a square footage less than the configured value. Posters often report the area of their listing using the wrong units.",
  outdoorSpace:
    "This will exclude listings that don't explicitly offer a yard, balcony, etc. Posters often don't bother to fill out this field, even if their listing has outdoor space.",
  parking:
    "This will exclude listings that don't explicitly offer parking. Posters often don't bother to fill out this field, even if their listing has parking.",
  petsStrict:
    "This will exclude listings that don't explicitly allow your type(s) of pet defined in `search.params.pets`. Posters often don't bother to fill out the pets field, even if their listing does allow pets.",
};

const Options = RuntypeRecord({
  computeDistanceTo: Optional(Array(String)),
});
const PetParams = RuntypeRecord({
  cat: Optional(Boolean),
  dog: Optional(Boolean),
  other: Optional(Boolean),
});

export type PetType = keyof Static<typeof PetParams>;

const SearchParams = RuntypeRecord({
  pets: Optional(PetParams),
  exclude: Optional(
    RuntypeRecord({
      basements: Optional(Boolean),
      shared: Optional(Boolean),
      swaps: Optional(Boolean),
      sublets: Optional(Boolean),
    })
  ),
  minBedrooms: Optional(RuntypeNumber),
  price: RuntypeRecord({
    min: RuntypeNumber,
    max: RuntypeNumber,
  }),
  unreliableParams: Optional(UnreliableParams),
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

const BotBehaviour = RuntypeRecord({
  suppressGreeting: Optional(Boolean),
  suppressUnreliableParamsWarning: Optional(Boolean),
});

const Development = RuntypeRecord({
  headed: Optional(Boolean),
  testing: Optional(Boolean),
  noSandbox: Optional(Boolean),
});

const Config = RuntypeRecord({
  botBehaviour: Optional(BotBehaviour),
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

export const throwOnUnknownKey = (obj: any, path: string[] = []) => {
  let fields = Config.fields;
  for (const p of path) {
    const target = "underlying" in fields[p] ? fields[p].underlying : fields[p];
    fields = target.fields;
  }
  const expectedKeys = Object.keys(fields);
  Object.keys(obj).forEach((k) => {
    if (!expectedKeys.includes(k)) {
      throw new Error(`Unexpected config option ${path.concat(k).join(".")}`);
    }
    const target = "underlying" in fields[k] ? fields[k].underlying : fields[k];
    if (target.tag === "record") {
      throwOnUnknownKey(obj[k], path.concat(k));
    }
  });
};

process.argv.slice(2).forEach((arg) => {
  const [_key, value] = arg.split("=");
  if (_key && value) {
    const key = _key.split("--")[1];
    const path = key.split(".");
    let obj = _config;
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

let config: Config;
try {
  config = Config.check(_config);
} catch (e) {
  log("Config.json is invalid:", { error: true, skipDiscord: true });
  throw e;
}

throwOnUnknownKey(config);
logNoDiscord("No unexpected config keys found.");

export default config;
