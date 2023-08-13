import http from "http";
import { randomUUID } from "node:crypto";

// https://stackoverflow.com/a/76356734
export function getBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const bodyParts: Buffer[] = [];
    req
      .on("data", (chunk) => {
        bodyParts.push(chunk);
      })
      .on("end", () => {
        const buffer = Buffer.concat(bodyParts);
        resolve(buffer);
      });
  });
}

export function replyJson(
  res: http.ServerResponse,
  statusCode: number,
  data: object,
) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/application");
  res.end(JSON.stringify(data));
}

// https://github.com/dherault/serverless-offline/blob/master/src/utils/createUniqueId.js#L3
export function createUniqueId() {
  // xxx-xxx-xxx-xxx 규격이면 복붙할떄 귀찮아서 단어 하나로 만듬
  const text = randomUUID();
  return text.split("-").join("");
}
