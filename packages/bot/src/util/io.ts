import axios from "axios";
import { createWriteStream, promises as fs } from "fs";

// TODO use runtypes or something here:
export const parseJSON = <T>(s: string): T => JSON.parse(s);
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
