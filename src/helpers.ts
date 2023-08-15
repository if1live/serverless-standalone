import { Context } from "aws-lambda";
import http from "node:http";
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

export function uuid() {
  return randomUUID();
}

// https://github.com/dherault/serverless-offline/blob/master/src/lambda/LambdaContext.js
export function generateLambdaContext(
  functionName: string,
  awsRequestId: string,
): Context {
  const context: Partial<Context> = {
    awsRequestId,
    callbackWaitsForEmptyEventLoop: true,
    clientContext: undefined,
    functionName,
    functionVersion: "$LATEST",
    identity: undefined,
    invokedFunctionArn: `offline_invokedFunctionArn_for_${functionName}`,
    logGroupName: `offline_logGroupName_for_${functionName}`,
    logStreamName: `offline_logStreamName_for_${functionName}`,
    memoryLimitInMB: "1024",
  };
  return context as any;
}

export const emptyCallback = () => {};
