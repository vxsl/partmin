import axios from "axios";
import { promises as fs, createWriteStream } from "fs";

export const getConfigValue = async (fn: (data: any) => any) =>
  await readJSON("config.json").then(fn);

export const readJSON = async <T>(path: string): Promise<T | undefined> => {
  try {
    const f = await fs.readFile(path, "utf-8");
    return JSON.parse(f);
  } catch {
    return undefined;
  }
};

export const writeJSON = async (path: string, data: Object) =>
  await fs.writeFile(path, JSON.stringify(data, null, 2));

export const downloadImage = async (src: string, path: string) => {
  let f: fs.FileHandle | undefined;
  try {
    f = await fs.open(path, "w");
    const ws = createWriteStream(path);
    return axios({
      url: src,
      responseType: "stream",
    })
      .then(
        (response) =>
          new Promise<void>((resolve, reject) => {
            response.data
              .pipe(ws)
              .on("finish", () => resolve())
              .on("error", (e: Error) => reject(e));
          })
      )
      .finally(() => {
        f?.close();
      });
  } finally {
    await f?.close();
  }
};
