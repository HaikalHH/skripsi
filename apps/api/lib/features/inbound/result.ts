export type InboundResponseBody = Record<string, unknown>;

export type InboundHandlerResult = {
  status: number;
  body: InboundResponseBody;
};

export const makeResult = (status: number, body: InboundResponseBody): InboundHandlerResult => ({
  status,
  body
});

export const ok = (body: InboundResponseBody): InboundHandlerResult => makeResult(200, body);

export const badRequest = (body: InboundResponseBody): InboundHandlerResult =>
  makeResult(400, body);

export const tooManyRequests = (body: InboundResponseBody): InboundHandlerResult =>
  makeResult(429, body);
