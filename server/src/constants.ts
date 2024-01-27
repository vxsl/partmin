import fs from "fs";
export const tmpDir = "./.tmp";

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
}
