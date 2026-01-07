import axios, { AxiosResponse } from "axios";
import config from "../config";

export async function tornadoApiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<AxiosResponse<T>> {
  return axios.get<T>(`${config.tornadoApiUrl}${path}`, {
    params,
  });
}

export async function tornadoApiPost<T>(
  path: string,
  body: Record<string, unknown>
): Promise<AxiosResponse<T>> {
  return axios.post<T>(`${config.tornadoApiUrl}${path}`, body);
}

export function handleTornadoApiError(err: any): never {
  if (err.response) {
    console.error(`Error: ${err.response.status} - ${err.response.data}`);
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
}
