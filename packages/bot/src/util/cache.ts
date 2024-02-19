import { dirs } from "constants.js";
import dotenv from "dotenv-mono";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fatalError, shutdown } from "index.js";
import { debugLog, log } from "util/log.js";
import { envVarInstruction } from "util/misc.js";

dotenv.load();

type StringCacheDefConstructorArgs<T> = {
  path: string;
  envVar?: string;
  label: string;
  validate?: (v: T) => boolean | Promise<boolean>;
} & (
  | { common?: boolean; absolutePath?: undefined }
  | { common?: undefined; absolutePath: true }
);
type CacheDefConstructorArgs<T> = StringCacheDefConstructorArgs<T> & {
  readTransform: (read: string) => NonNullable<T> | undefined;
  writeTransform: (v: T) => string;
};
export class CacheDef<T> {
  envVar?: string;
  private path: string;
  private loaded: T | undefined;
  private label: string;
  protected readTransform: (read: string) => NonNullable<T> | undefined;
  protected writeTransform: (v: T) => string;
  protected validate?: (v: T) => boolean | Promise<boolean>;
  constructor({
    path,
    envVar,
    label,
    readTransform,
    writeTransform,
    validate,
    common,
    absolutePath,
  }: CacheDefConstructorArgs<T>) {
    this.path = `${
      absolutePath ? path : common ? dirs.commonData : dirs.data
    }/${path}`;
    this.envVar = envVar;
    this.label = label;
    this.readTransform = readTransform;
    this.writeTransform = writeTransform;
    this.validate = validate;
    const read = this.readValue();
    if (read) {
      this.loaded = this.readTransform(read);
    }
    if (this.loaded === undefined || this.loaded === "") {
      const env = this.readEnvVar();
      if (env !== undefined) {
        this.loaded = this.readTransform(env);
        if (this.loaded !== undefined) {
          this.writeValue(this.loaded);
        }
      }
    }
  }
  get envVarInstruction() {
    return this.envVar ? envVarInstruction(this.envVar) : "";
  }
  protected readValue() {
    let result = existsSync(this.path)
      ? readFileSync(this.path, { encoding: "utf-8" })
      : undefined;
    return result;
  }
  protected readEnvVar() {
    if (this.envVar) {
      return process.env[this.envVar];
    }
  }
  async writeValue(
    v: T,
    options?: { skipLog?: boolean; skipValidate?: boolean }
  ) {
    if (!options?.skipValidate && this.validate && !(await this.validate(v))) {
      log(`Invalid value for ${this.label}`);
      return;
    }
    this.loaded = v;
    const s = this.writeTransform(v);
    if (!options?.skipLog) {
      debugLog(`Writing new value for ${this.label}`);
    }
    writeFileSync(this.path, s);
  }
  async requireValue(options?: {
    message?: string;
  }): Promise<NonNullable<T | never>> {
    const v = await this.value();
    if (v !== undefined) {
      return v;
    }
    if (options?.message) {
      console.log(`\n\n${options.message}\n\n`);
      return shutdown().then(() => process.exit());
    } else {
      return fatalError(
        `\n\nNo value found: ${this.label}. ${this.envVarInstruction}\n\n`
      );
    }
  }
  async value() {
    if (this.loaded) {
      return this.loaded;
    }
    const read = this.readValue();
    const v = read !== undefined ? this.readTransform(read) : undefined;
    if (v) {
      this.writeValue(v);
      if (this.validate && !(await this.validate(v))) {
        return undefined;
      }
    }
    return v;
  }
}

export class StringCacheDef extends CacheDef<string> {
  constructor(arg: StringCacheDefConstructorArgs<string>) {
    super({
      ...arg,
      readTransform: (read) => read,
      writeTransform: (v) => v,
    });
  }
}
