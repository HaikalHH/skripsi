import { mkdir, readFile, writeFile } from "node:fs/promises";
import { USyncQuery, USyncUser, jidDecode, jidNormalizedUser } from "@whiskeysockets/baileys";
import { env, lidMapFilePath } from "../config";
import { logger } from "../logger";
import type { BotSocket } from "./types";

const lidToPhoneMap = new Map<string, string>();
const phoneToLidMap = new Map<string, string>();
const lidLookupCooldownMap = new Map<string, number>();
const lidNoPhoneAttrLogged = new Set<string>();
const waRegistrationCache = new Map<string, { exists: boolean; checkedAt: number }>();

const LID_LOOKUP_COOLDOWN_MS = 60_000;
const WA_REGISTRATION_CACHE_TTL_MS = 10 * 60_000;

export const parseJidParts = (value: string | undefined | null) => {
  if (!value) return null;
  const normalizedJid = value.includes("@") ? jidNormalizedUser(value) : value.trim();
  if (!normalizedJid) return null;

  const decoded = jidDecode(normalizedJid);
  if (decoded?.user && decoded?.server) {
    return {
      user: decoded.user.split(":")[0] ?? decoded.user,
      server: decoded.server
    };
  }

  const userPart = normalizedJid.split("@")[0] ?? normalizedJid;
  return {
    user: userPart.split(":")[0] ?? userPart,
    server: "s.whatsapp.net"
  };
};

export const normalizeWaNumber = (value: string): string | null => {
  const jid = parseJidParts(value);
  const userPart = jid?.user ?? value.trim();
  const withoutDevice = userPart.split(":")[0] ?? userPart;
  const digits = withoutDevice.replace(/\D+/g, "");

  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  if (digits) return digits;

  const compact = withoutDevice.replace(/\s+/g, "");
  return compact || null;
};

export const parsePhoneCandidateFromText = (text: string): string | null => {
  const trimmed = text.trim();
  if (!/^\+?[\d\s\-().]{8,25}$/.test(trimmed)) return null;

  const normalized = normalizeWaNumber(trimmed);
  if (!normalized || !normalized.startsWith("62")) return null;
  if (normalized.length < 10 || normalized.length > 16) return null;
  return normalized;
};

export const persistLidPhoneMap = async () => {
  try {
    await mkdir(env.BAILEYS_AUTH_DIR, { recursive: true });
    const entries = Array.from(lidToPhoneMap.entries()).map(([lid, phone]) => ({ lid, phone }));
    await writeFile(
      lidMapFilePath,
      JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2),
      "utf-8"
    );
  } catch (error) {
    logger.warn({ err: error }, "Failed to persist lid-phone map");
  }
};

export const loadPersistedLidPhoneMap = async () => {
  try {
    const raw = await readFile(lidMapFilePath, "utf-8");
    const parsed = JSON.parse(raw) as { entries?: Array<{ lid?: string; phone?: string }> };
    for (const entry of parsed.entries ?? []) {
      const lid = (entry.lid ?? "").trim();
      const phone = normalizeWaNumber(entry.phone ?? "");
      if (!lid || !phone || !phone.startsWith("62")) continue;
      lidToPhoneMap.set(lid, phone);
      phoneToLidMap.set(phone, lid);
    }
    if (lidToPhoneMap.size > 0) {
      logger.info({ mappings: lidToPhoneMap.size }, "Loaded persisted lid-phone map");
    }
  } catch {
    // no-op if file not found or invalid
  }
};

export const rememberLidMapping = (
  lidValue: string | undefined,
  phoneJidValue: string | undefined
) => {
  const lid = parseJidParts(lidValue);
  if (!lid || lid.server !== "lid") return;

  const phone = normalizeWaNumber(phoneJidValue ?? "");
  if (!phone || !phone.startsWith("62")) return;

  const previous = lidToPhoneMap.get(lid.user);
  if (previous === phone && phoneToLidMap.get(phone) === lid.user) return;

  lidToPhoneMap.set(lid.user, phone);
  phoneToLidMap.set(phone, lid.user);
  void persistLidPhoneMap();
};

export const rememberLidMappingFromRawNode = (node: any) => {
  const attrs = node?.attrs as Record<string, string | undefined> | undefined;
  if (!attrs) return;

  const lidCandidateKeys = ["from", "participant", "recipient", "author"];
  const phoneCandidateKeys = [
    "sender_pn",
    "participant_pn",
    "recipient_pn",
    "from_pn",
    "author_pn"
  ];

  const lidRaw =
    lidCandidateKeys
      .map((key) => attrs[key])
      .find((value) => typeof value === "string" && value.endsWith("@lid")) ?? undefined;

  const phoneRaw =
    phoneCandidateKeys
      .map((key) => attrs[key])
      .find((value) => {
        const normalized = normalizeWaNumber(value ?? "");
        return !!normalized && normalized.startsWith("62");
      }) ?? undefined;

  if (lidRaw && phoneRaw) {
    rememberLidMapping(lidRaw, phoneRaw);
    return;
  }

  const lid = parseJidParts(lidRaw);
  if (lid && !lidNoPhoneAttrLogged.has(lid.user)) {
    const pnKeys = Object.keys(attrs).filter((key) => key.includes("pn"));
    lidNoPhoneAttrLogged.add(lid.user);
    logger.warn({ lid: lid.user, pnKeys }, "Raw stanza has lid without phone attrs");
  }
};

export const resolvePhoneFromLid = async (
  sock: BotSocket,
  lidUser: string
): Promise<string | null> => {
  const cached = lidToPhoneMap.get(lidUser);
  if (cached) return cached;

  const now = Date.now();
  const lastTried = lidLookupCooldownMap.get(lidUser) ?? 0;
  if (now - lastTried < LID_LOOKUP_COOLDOWN_MS) {
    return null;
  }
  lidLookupCooldownMap.set(lidUser, now);

  try {
    const query = new USyncQuery()
      .withContactProtocol()
      .withUser(new USyncUser().withId(`${lidUser}@lid`));
    const result = await sock.executeUSyncQuery(query);

    for (const row of result?.list ?? []) {
      const normalized = normalizeWaNumber(row.id ?? "");
      if (!normalized || !normalized.startsWith("62")) continue;

      lidToPhoneMap.set(lidUser, normalized);
      phoneToLidMap.set(normalized, lidUser);
      logger.info({ lid: lidUser, waNumber: normalized }, "Resolved lid to phone via usync");
      return normalized;
    }
  } catch (error) {
    logger.warn({ err: error, lid: lidUser }, "Failed to resolve lid via usync");
  }

  return null;
};

export const checkWhatsAppRegistration = async (
  sock: BotSocket,
  phoneNumber: string
): Promise<boolean | undefined> => {
  const cached = waRegistrationCache.get(phoneNumber);
  const now = Date.now();
  if (cached && now - cached.checkedAt < WA_REGISTRATION_CACHE_TTL_MS) {
    return cached.exists;
  }

  try {
    const result = await sock.onWhatsApp(phoneNumber);
    const exists = Boolean(result?.[0]?.exists);
    waRegistrationCache.set(phoneNumber, { exists, checkedAt: now });
    return exists;
  } catch (error) {
    logger.warn({ err: error, phoneNumber }, "Failed to verify WhatsApp registration");
    return undefined;
  }
};

export const resolveInboundIdentity = async (sock: BotSocket, remoteJid: string) => {
  const jid = parseJidParts(remoteJid);
  if (!jid) return { waNumber: null as string | null, waLid: undefined as string | undefined };

  if (jid.server === "lid") {
    const resolved = await resolvePhoneFromLid(sock, jid.user);
    if (resolved) {
      return { waNumber: resolved, waLid: jid.user };
    }

    const mappedPhone = lidToPhoneMap.get(jid.user);
    if (mappedPhone) {
      return { waNumber: mappedPhone, waLid: jid.user };
    }

    logger.warn({ remoteJid, lid: jid.user }, "No lid->phone mapping yet, using lid fallback");
    return {
      waNumber: normalizeWaNumber(jid.user),
      waLid: jid.user
    };
  }

  return { waNumber: normalizeWaNumber(remoteJid), waLid: undefined };
};

export const buildOutboundJidCandidates = (waNumber: string) => {
  const parsed = waNumber.includes("@") ? parseJidParts(waNumber) : null;
  if (parsed && (parsed.server === "s.whatsapp.net" || parsed.server === "lid")) {
    return [`${parsed.user}@${parsed.server}`];
  }

  const normalized = normalizeWaNumber(waNumber);
  if (!normalized) return [`${waNumber}@s.whatsapp.net`];

  const candidates: string[] = [];
  const push = (jid: string) => {
    if (!jid || candidates.includes(jid)) return;
    candidates.push(jid);
  };

  if (normalized.startsWith("62")) {
    push(`${normalized}@s.whatsapp.net`);
    const lid = phoneToLidMap.get(normalized);
    if (lid) push(`${lid}@lid`);
    return candidates;
  }

  const mappedPhone = lidToPhoneMap.get(normalized);
  if (mappedPhone) {
    push(`${mappedPhone}@s.whatsapp.net`);
  }

  if (normalized.length >= 15) {
    push(`${normalized}@lid`);
  }

  push(`${normalized}@s.whatsapp.net`);
  return candidates;
};
