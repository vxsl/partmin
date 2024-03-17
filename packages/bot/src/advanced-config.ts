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
  advancedConfig = AdvancedConfig.check(raw);
  devOptions = advancedConfig.development ?? {};
  logLevels = advancedConfig.logging ?? {};
};
// export const defineAdvancedConfig = async () => {
//   let json;
//   try {
//     import(advancedConfigPath).then((json) => {
//       console.log("Advanced config loaded");
//       _advancedConfig = AdvancedConfig.check(json);
//       devOptions = _advancedConfig.development ?? {};
//       logLevels = _advancedConfig.logging ?? {};
//     });
//   } catch (error) {
//     console.error(error);
//     console.log(
//       `No advanced config found, writing default values to ${advancedConfigPath}`
//     );
//     writeFileSync(
//       advancedConfigPath,
//       JSON.stringify(defaultAdvancedConfigValues, null, 2)
//     );
//     json = defaultAdvancedConfigValues;
//     _advancedConfig = AdvancedConfig.check(json);
//     devOptions = _advancedConfig.development ?? {};
//     logLevels = _advancedConfig.logging ?? {};
//   }
// };

// const _advancedConfig = AdvancedConfig.check(json);
// export const devOptions = _advancedConfig.development ?? {};
// export const logLevels = _advancedConfig.logging ?? {};

// process.argv.slice(2).forEach((arg) => {
//   const [_key, value] = arg.split("=");
//   if (_key && value) {
//     const key = _key.split("--")[1];
//     const path = key?.split(".") ?? [];
//     let obj: any = _config;
//     for (let i = 0; i < path.length - 1; i++) {
//       const p = path[i];
//       if (p === undefined) break;
//       obj = obj[p];
//     }
//     const lastKey = path[path.length - 1];
//     if (lastKey === undefined) {
//       console.error("Unexpected config key", key);
//       return;
//     }
//     let v;
//     if (value === "true" || value === "false") {
//       v = value === "true";
//     } else if (!isNaN(Number(value))) {
//       v = Number(value);
//     } else {
//       v = value;
//     }

//     console.log(
//       `Overriding config value ${key}: ${v} (original value ${obj[lastKey]})`
//     );
//     obj[lastKey] = v;
//   }
// });

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
