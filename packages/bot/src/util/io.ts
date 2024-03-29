import axios from "axios";
import { createWriteStream, promises as fs } from "fs";
import { log } from "util/log.js";

// TODO use runtypes or something here:
export const parseJSON = <T>(s: string): T | undefined => {
  try {
    const parsed = JSON.parse(s);
    return parsed;
  } catch (e) {
    log(`Error parsing JSON at path ${s}: ${e}`);
  }
  return undefined;
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
