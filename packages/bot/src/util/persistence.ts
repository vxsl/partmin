import { getDirs } from "constants.js";
import dotenv from "dotenv-mono";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fatalError, shutdown } from "index.js";
import { debugLog, log } from "util/log.js";
import { envVarInstruction } from "util/string.js";

dotenv.load();

type PersistentStringDefConstructorArgs<T> = {
  envVar?: string;
  label: string;
  validate?: (v: T) => boolean | Promise<boolean>;
  /**
   * Re-read the file on every access instead of answering from the copy loaded
   * at startup. For files a human edits directly, where the bot is expected to
   * notice without being restarted.
   */
  reloadFromDisk?: boolean;
} & (
  | { common?: boolean; dir?: string; path: string; absolutePath?: undefined }
  | {
      common?: undefined;
      dir?: undefined;
      path?: undefined;
      absolutePath: string;
    }
);
type PersistentDataDefConstructorArgs<T> =
  PersistentStringDefConstructorArgs<T> & {
    readTransform: (read: string) => NonNullable<T> | undefined;
    writeTransform: (v: T) => string;
  };
export class PersistentDataDef<T> {
  envVar?: string;
  private path: string;
  private loaded: T | undefined;
  private lastRead: string | undefined;
  private reloadFromDisk: boolean;
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
    dir,
    absolutePath,
    reloadFromDisk,
  }: PersistentDataDefConstructorArgs<T>) {
    const dirs = getDirs();
    this.path =
      absolutePath ??
      `${dir ?? (common ? dirs.commonData : dirs.data)}/${path}`;
    this.envVar = envVar;
    this.label = label;
    this.readTransform = readTransform;
    this.writeTransform = writeTransform;
    this.validate = validate;
    this.reloadFromDisk = reloadFromDisk ?? false;
    const read = this.readValue();
    if (read) {
      this.lastRead = read;
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
    this.lastRead = s;
    if (!options?.skipLog) {
      debugLog(`Writing new value for ${this.label}`);
    }
    writeFileSync(this.path, s);
  }
  async requireValue(options?: {
    message?: string;
  }): Promise<NonNullable<T | never>> {
    const v = await this.value();
    if (v !== undefined && v !== null) {
      return v as NonNullable<T>;
    }
    if (options?.message) {
      console.log(`\n\n${options.message}\n\n`);
      return shutdown().then(() => process.exit());
    } else {
      return fatalError(
        `No value found: ${this.label}. ${this.envVarInstruction}`
      );
    }
  }
  async value() {
    if (this.reloadFromDisk) {
      return await this.reloadedValue();
    }
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

  /**
   * Picks up edits made to the file by hand, which the cached path above can't:
   * it answers with whatever was on disk at startup for the life of the process.
   *
   * Re-validating on every read would be wasteful — and for the user config,
   * noisy, since validation warns in Discord — so the raw text is compared first
   * and the work only happens when it has actually changed. A file that's been
   * edited into an invalid state leaves the last good value in place rather than
   * taking the bot down.
   */
  private async reloadedValue() {
    const read = this.readValue();
    if (read === undefined || read === this.lastRead) {
      return this.loaded;
    }
    const v = this.readTransform(read);
    if (v === undefined) {
      log(
        `Couldn't parse the new contents of ${this.label}; keeping the previous value.`
      );
      return this.loaded;
    }
    try {
      if (this.validate && !(await this.validate(v))) {
        throw new Error("failed validation");
      }
    } catch (e) {
      log(`Ignoring an invalid change to ${this.label}: ${e}`, { error: true });
      // remembered so the same broken contents aren't re-reported every read
      this.lastRead = read;
      return this.loaded;
    }
    if (this.lastRead !== undefined) {
      debugLog(`Picked up a change to ${this.label}`);
    }
    this.lastRead = read;
    this.loaded = v;
    return this.loaded;
  }
}

export class PersistentStringDef extends PersistentDataDef<string> {
  constructor(arg: PersistentStringDefConstructorArgs<string>) {
    super({
      ...arg,
      readTransform: (read) => read,
      writeTransform: (v) => v,
    });
  }
}
