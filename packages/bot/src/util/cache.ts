import dotenv from "dotenv-mono";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fatalError, shutdown } from "index.js";
import { debugLog } from "util/log.js";

dotenv.load();

export class CacheDef<T> {
  envVar?: string;
  private path: string;
  private loaded: T | undefined;
  private label: string;
  protected readTransform: (read: string) => NonNullable<T>;
  protected writeTransform: (v: T) => string;
  constructor({
    path,
    envVar,
    label,
    readTransform,
    writeTransform,
  }: {
    path: string;
    envVar?: string;
    label: string;
    readTransform: (read: string) => NonNullable<T>;
    writeTransform: (v: T) => string;
  }) {
    this.path = path;
    this.envVar = envVar;
    this.label = label;
    this.readTransform = readTransform;
    this.writeTransform = writeTransform;
    const read = this.readValue();
    if (read) {
      this.loaded = this.readTransform(read);
    }
  }
  get envVarInstruction() {
    return this.envVar
      ? `Paste the value into a .env file at the project root like so:\n${this.envVar}=_____________`
      : "";
  }
  protected readValue() {
    let result = existsSync(this.path)
      ? readFileSync(this.path, { encoding: "utf-8" })
      : undefined;
    if (this.envVar && (result === undefined || result === "")) {
      result = process.env[this.envVar];
    }
    return result;
  }
  writeValue(v: T, options?: { skipLog?: boolean }) {
    this.loaded = v;
    const s = this.writeTransform(v);
    if (!options?.skipLog) {
      debugLog(`Writing new value for ${this.label}`);
    }
    writeFileSync(this.path, s);
  }
  requireValue(options?: {
    message?: string;
  }): NonNullable<T> | Promise<never> {
    const v = this.value;
    if (v) {
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
  get value() {
    if (this.loaded) {
      return this.loaded;
    }
    const read = this.readValue();
    const v = read !== undefined ? this.readTransform(read) : undefined;
    if (v) {
      this.writeValue(v);
    }
    return v;
  }
}

export class StringCacheDef extends CacheDef<string> {
  constructor({
    path,
    envVar,
    label,
  }: {
    path: string;
    envVar?: string;
    label: string;
  }) {
    super({
      path,
      envVar,
      label,
      readTransform: (read) => read,
      writeTransform: (v) => v,
    });
  }
}
