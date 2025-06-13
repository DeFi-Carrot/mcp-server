import { Client as CarrotHttpClient } from "@carrot-protocol/http-client";
import { CARROT_API_URL } from "./config.js";

export function getCarrotHttpClient() {
  return new CarrotHttpClient(CARROT_API_URL);
}
