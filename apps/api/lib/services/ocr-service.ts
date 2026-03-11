import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

const VISION_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const DEFAULT_VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cachedToken:
  | {
      accessToken: string;
      expiresAtEpochMs: number;
    }
  | null = null;

let cachedCredentialPath: string | null = null;
let cachedCredentials: ServiceAccountCredentials | null = null;

const base64UrlEncode = (value: string) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const resolveCredentialPath = (rawPath: string): string | null => {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    path.resolve(process.cwd(), trimmed),
    path.resolve(process.cwd(), "..", trimmed),
    path.resolve(process.cwd(), "..", "..", trimmed),
    path.resolve(process.cwd(), "apps", "api", trimmed)
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
};

const buildServiceAccountJwt = (credentials: ServiceAccountCredentials): string => {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: VISION_SCOPE,
    aud: credentials.token_uri ?? DEFAULT_TOKEN_URI,
    iat: nowSec,
    exp: nowSec + 3600
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(unsignedToken), credentials.private_key)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${unsignedToken}.${signature}`;
};

const loadServiceAccountCredentials = async (): Promise<ServiceAccountCredentials | null> => {
  const explicitPath = env.GCP_VISION_CREDENTIALS_PATH?.trim() ?? "";
  const apiKeyOrPath = env.GCP_VISION_API_KEY?.trim() ?? "";
  const rawPath =
    explicitPath || (apiKeyOrPath.toLowerCase().endsWith(".json") ? apiKeyOrPath : "");
  if (!rawPath) return null;

  const resolvedPath = resolveCredentialPath(rawPath);
  if (!resolvedPath) {
    throw new Error(
      `Vision credentials file not found. Checked from path: ${rawPath}.`
    );
  }

  if (cachedCredentials && cachedCredentialPath === resolvedPath) {
    return cachedCredentials;
  }

  const raw = await readFile(resolvedPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Vision service account JSON missing client_email/private_key.");
  }

  cachedCredentialPath = resolvedPath;
  cachedCredentials = {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri: parsed.token_uri
  };

  return cachedCredentials;
};

const getServiceAccountAccessToken = async (
  credentials: ServiceAccountCredentials
): Promise<string> => {
  if (cachedToken && Date.now() < cachedToken.expiresAtEpochMs - 60_000) {
    return cachedToken.accessToken;
  }

  const assertion = buildServiceAccountJwt(credentials);
  const tokenUri = credentials.token_uri ?? DEFAULT_TOKEN_URI;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Vision auth error: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Vision auth error: access_token missing.");
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAtEpochMs: Date.now() + (data.expires_in ?? 3600) * 1000
  };
  return data.access_token;
};

const buildVisionRequestBody = (imageBase64: string) =>
  JSON.stringify({
    requests: [
      {
        image: { content: imageBase64 },
        features: [{ type: "TEXT_DETECTION" }]
      }
    ]
  });

const requestVisionWithApiKey = async (imageBase64: string, apiKey: string) =>
  fetch(`${DEFAULT_VISION_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildVisionRequestBody(imageBase64)
  });

const requestVisionWithServiceAccount = async (
  imageBase64: string,
  credentials: ServiceAccountCredentials
) => {
  const accessToken = await getServiceAccountAccessToken(credentials);
  return fetch(DEFAULT_VISION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: buildVisionRequestBody(imageBase64)
  });
};

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const credentials = await loadServiceAccountCredentials();
  const apiKey = env.GCP_VISION_API_KEY?.trim() ?? "";

  let response: Response;
  if (credentials) {
    response = await requestVisionWithServiceAccount(imageBase64, credentials);
  } else if (apiKey) {
    response = await requestVisionWithApiKey(imageBase64, apiKey);
  } else {
    throw new Error(
      "Vision config missing. Set GCP_VISION_CREDENTIALS_PATH (service account JSON) or GCP_VISION_API_KEY."
    );
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Vision API error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const ocrText =
    data?.responses?.[0]?.fullTextAnnotation?.text ??
    data?.responses?.[0]?.textAnnotations?.[0]?.description ??
    "";

  if (!ocrText.trim()) {
    throw new Error("No OCR text detected");
  }

  return ocrText;
};
