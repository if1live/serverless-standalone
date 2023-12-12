import http from "node:http";

export const region = "ap-northeast-1";
export const account = "123456789012";

export type Req = Parameters<http.RequestListener>[0];
export type Res = Parameters<http.RequestListener>[1];
