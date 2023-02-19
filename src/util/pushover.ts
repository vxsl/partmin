import axios from "axios";
import FormData from "form-data";
import { promises as fs } from "fs";

const PUSHOVER_ENDPOINT = "https://api.pushover.net/1/messages.json";

const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

export const pushover = async (_data: Object, imgName?: string) => {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) {
    throw new Error("Missing env vars");
  }
  const form = new FormData();
  let img;
  try {
    if (imgName) {
      img = await fs.readFile(`./images/${imgName}`);
      form.append("attachment", img, { filename: imgName });
    }
  } catch (e) {
    console.error(`Error reading image "${imgName}": ${e}`);
  }

  const data = { token: PUSHOVER_TOKEN, user: PUSHOVER_USER, ..._data };
  Object.entries(data).forEach(([k, v]) => form.append(k, v));
  try {
    return img
      ? axios.post(PUSHOVER_ENDPOINT, form, { headers: form.getHeaders() })
      : axios.post(PUSHOVER_ENDPOINT, data);
  } catch (error) {
    console.error(`Error sending notification: ${{ data, error }}`);
  }
};
