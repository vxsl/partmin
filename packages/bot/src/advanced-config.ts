import { writeFileSync } from "fs";
import { Boolean, Optional, Record as RuntypeRecord, Static } from "runtypes";
import { throwOnUnknownKey } from "util/runtypes.js";
import { RecursivePartial } from "util/type.js";

const configDir = `${process.cwd()}/../../config`;
export const advancedConfigPath = `${configDir}/advanced-config.json`;

export type LogLevel = "debug" | "verbose";
const Logging = RuntypeRecord<Record<LogLevel, Optional<Boolean>>>({
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

export const AdvancedConfig = RuntypeRecord({
  botBehaviour: Optional(BotBehaviour),
  development: Optional(Development),
  logging: Optional(Logging),
});

export type StaticAdvancedConfig = Static<typeof AdvancedConfig>;

export const defaultAdvancedConfigValues: RecursivePartial<StaticAdvancedConfig> =
  {
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
  } as const;

let advancedConfig: StaticAdvancedConfig | undefined;
export let devOptions: NonNullable<StaticAdvancedConfig["development"]> = {};
export let logLevels: NonNullable<StaticAdvancedConfig["logging"]> = {};

export const defineAdvancedConfig = async () => {
  const raw = await import(advancedConfigPath).catch(() => {
    console.log(
      `No advanced config found, writing default values to ${advancedConfigPath}`
    );
    writeFileSync(
      advancedConfigPath,
      JSON.stringify(defaultAdvancedConfigValues, null, 2)
    );
    return defaultAdvancedConfigValues;
  });

  console.log("Advanced config loaded");

  process.argv.slice(2).forEach((arg) => {
    const [_key, value] = arg.split("=");
    if (_key && value) {
      const key = _key.split("--")[1];
      const path = key?.split(".") ?? [];
      let obj: any = raw;
      for (let i = 0; i < path.length - 1; i++) {
        const p = path[i];
        if (p === undefined) break;
        obj = obj[p];
      }
      const lastKey = path[path.length - 1];
      if (lastKey === undefined) {
        console.error("Unexpected advanced config key", key);
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
        `Overriding advanced config value ${key}: ${v} (original value ${obj[lastKey]})`
      );
      obj[lastKey] = v;
    }
  });

  advancedConfig = AdvancedConfig.check(raw);
  devOptions = advancedConfig.development ?? {};
  logLevels = advancedConfig.logging ?? {};
};

export const validateAdvancedConfig = (c: StaticAdvancedConfig) => {
  try {
    AdvancedConfig.check(c);
  } catch (e) {
    console.error("Invalid advanced config.");
    throw e;
  }

  throwOnUnknownKey(AdvancedConfig.fields, c, {
    message: "Unexpected advanced config option",
  });
};
