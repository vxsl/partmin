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
import { accessNestedProperty } from "util/data.js";
import { RecursivePartial } from "util/type.js";
import _config from "../../../config/config.json";

const UnreliableParams = RuntypeRecord({
  minAreaSqFt: Optional(RuntypeNumber),
  requireOutdoorSpace: Optional(Boolean),
  requireParking: Optional(Boolean),
  petsStrict: Optional(Boolean),
});

export const unreliabilityExplanations: Record<
  keyof Static<typeof UnreliableParams>,
  string
> = {
  // TODO ensure functionality matches these descriptions:
  minAreaSqFt:
    "This will exclude listings that specify a square footage less than the configured value. Posters often report the area of their listing using the wrong units.",
  requireOutdoorSpace:
    "This will exclude listings that don't explicitly offer a yard, balcony, etc. Posters often don't bother to fill out this field, even if their listing has outdoor space.",
  requireParking:
    "This will exclude listings that don't explicitly offer parking. Posters often don't bother to fill out this field, even if their listing has parking.",
  petsStrict:
    "This will exclude listings that don't explicitly allow your type(s) of pet defined in `search.params.pets`. Posters often don't bother to fill out the pets field, even if their listing does allow pets.",
};

const Options = RuntypeRecord({
  disableGoogleMapsFeatures: Optional(Boolean),
  commuteDestinations: Optional(Array(String)),
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

export type LogLevel = "debug" | "verbose";
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
  noRetrieval: Optional(Boolean),
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

export const defaultConfigValues: RecursivePartial<Config> = {
  botBehaviour: {
    suppressGreeting: false,
    suppressUnreliableParamsWarning: false,
  },
  development: {
    headed: false,
    testing: false,
    noSandbox: false,
    noRetrieval: false,
  },
  logging: {
    debug: false,
    verbose: false,
  },
  options: {
    disableGoogleMapsFeatures: false,
    commuteDestinations: [],
  },
  search: {
    params: {
      pets: {
        cat: false,
        dog: false,
        other: false,
      },
      exclude: {
        basements: false,
        shared: false,
        swaps: false,
        sublets: false,
      },
      minBedrooms: 0,
      unreliableParams: {
        minAreaSqFt: 0,
        requireOutdoorSpace: false,
        requireParking: false,
        petsStrict: false,
      },
    },
    blacklist: [],
    blacklistRegex: [],
  },
} as const;

const getUnderlyingField = (
  fields: { [key: string]: RuntypeBase },
  k: keyof typeof fields
) =>
  "underlying" in (fields[k] ?? {})
    ? // At the time of writing there doesn't seem to be a clean way to get
      // the underlying type of a Runtype, agnostic of whether it's optional:
      // @ts-ignore
      fields[k].underlying
    : fields[k];

export const throwOnUnknownKey = (obj: any, path: string[] = []) => {
  let fields = Config.fields;
  for (const k of path) {
    if (!(k in fields)) {
      throw new Error(`Unexpected config option ${path.join(".")}`);
    }
    fields = getUnderlyingField(fields, k).fields;
  }
  const expectedKeys = Object.keys(fields);
  Object.keys(obj).forEach((k) => {
    if (!expectedKeys.includes(k) || !(k in fields)) {
      throw new Error(`Unexpected config option ${path.concat(k).join(".")}`);
    }
    if (getUnderlyingField(fields, k).tag === "record") {
      throwOnUnknownKey(obj[k], path.concat(k));
    }
  });
};

process.argv.slice(2).forEach((arg) => {
  const [_key, value] = arg.split("=");
  if (_key && value) {
    const key = _key.split("--")[1];
    const path = key?.split(".") ?? [];
    let obj: any = _config;
    for (let i = 0; i < path.length - 1; i++) {
      const p = path[i];
      if (p === undefined) break;
      obj = obj[p];
    }
    const lastKey = path[path.length - 1];
    if (lastKey === undefined) {
      console.error("Unexpected config key", key);
      return;
    }
    let v;
    if (value === "true" || value === "false") {
      v = value === "true";
    } else if (!isNaN(Number(value))) {
      v = Number(value);
    } else {
      v = value;
    }

    console.log(
      `Overriding config value ${key}: ${v} (original value ${obj[lastKey]})`
    );
    obj[lastKey] = v;
  }
});

let config: Config;
try {
  config = Config.check(_config);
} catch (e) {
  console.log("Config.json is invalid:", { error: true });
  throw e;
}

throwOnUnknownKey(config);

export const isDefaultValue = (
  path: string | ((config: Config) => any),
  options?: {
    baseNest?: (config: Config) => any;
  }
) => {
  let actual, expected;
  try {
    const nestedConfig = options?.baseNest ? options.baseNest(config) : config;
    const nestedDefault = options?.baseNest
      ? options.baseNest(defaultConfigValues as unknown as Config)
      : (defaultConfigValues as unknown as Config);
    if (typeof path === "string") {
      actual = accessNestedProperty(nestedConfig, path);
      expected = accessNestedProperty(nestedDefault, path);
    } else {
      actual = path(nestedConfig);
      expected = path(nestedDefault);
    }
  } catch (e) {
    console.error("Error while checking default value of config option");
    console.error({ actual, expected });
    console.error(e);
    if (actual === undefined && expected === undefined) {
      console.error("Assuming they are unequal");
      return false;
    }
  }
  return actual === expected;
};

export default config;
