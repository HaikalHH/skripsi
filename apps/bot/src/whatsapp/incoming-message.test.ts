import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/inbound", () => ({
  forwardInboundMessage: vi.fn(),
  sendInboundReplyPayload: vi.fn()
}));

vi.mock("./lid-map", () => ({
  checkWhatsAppRegistration: vi.fn(),
  parseJidParts: vi.fn(),
  parsePhoneCandidateFromText: vi.fn(),
  normalizeWaNumber: vi.fn(),
  rememberLidMapping: vi.fn(),
  resolveInboundIdentity: vi.fn()
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

import { forwardInboundMessage, sendInboundReplyPayload } from "../api/inbound";
import {
  checkWhatsAppRegistration,
  parseJidParts,
  parsePhoneCandidateFromText,
  normalizeWaNumber,
  rememberLidMapping,
  resolveInboundIdentity
} from "./lid-map";
import { processIncomingMessage } from "./incoming-message";

describe("processIncomingMessage", () => {

  it("TC-010: returns without error when message has no remoteJid", async () => {
    const sock = {
      sendMessage: vi.fn()
    } as any;

    const msg = {
      key: {},
      message: {
        conversation: "register"
      }
    };

    await expect(processIncomingMessage(sock, msg)).resolves.toBeUndefined();

    expect(forwardInboundMessage).not.toHaveBeenCalled();
    expect(sendInboundReplyPayload).not.toHaveBeenCalled();
    expect(sock.sendMessage).not.toHaveBeenCalled();
  });


  it("TC-010b: returns without error when remoteJid is a group (@g.us)", async () => {
    const sock = {
      sendMessage: vi.fn()
    } as any;

    const msg = {
      key: { remoteJid: "1234567890-1234567890@g.us" },
      message: {
        conversation: "register"
      }
    };

    await expect(processIncomingMessage(sock, msg)).resolves.toBeUndefined();

    expect(forwardInboundMessage).not.toHaveBeenCalled();
    expect(sendInboundReplyPayload).not.toHaveBeenCalled();
    expect(sock.sendMessage).not.toHaveBeenCalled();
  });


  it("TC-010c: returns without error when message is sent by bot itself (fromMe)", async () => {
    const sock = {
      sendMessage: vi.fn()
    } as any;

    const msg = {
      key: {
        remoteJid: "6281234567890@s.whatsapp.net",
        fromMe: true
      },
      message: {
        conversation: "ini pesan dari bot sendiri"
      }
    };

    await expect(processIncomingMessage(sock, msg)).resolves.toBeUndefined();

    expect(forwardInboundMessage).not.toHaveBeenCalled();
    expect(sendInboundReplyPayload).not.toHaveBeenCalled();
    expect(sock.sendMessage).not.toHaveBeenCalled();
  });


  describe("LID mapping", () => {
    beforeEach(() => {
      vi.mocked(forwardInboundMessage).mockReset();
      vi.mocked(sendInboundReplyPayload).mockReset();
      vi.mocked(rememberLidMapping).mockReset();
      vi.mocked(resolveInboundIdentity).mockReset();
      vi.mocked(parseJidParts).mockReset();
      vi.mocked(parsePhoneCandidateFromText).mockReset();
      vi.mocked(normalizeWaNumber).mockReset();
      vi.mocked(checkWhatsAppRegistration).mockReset();
    });


    it("TC-021: stores LID mapping when remote is @lid and text contains 628... number", async () => {
      const sock = {
        sendMessage: vi.fn(),
        onWhatsApp: vi.fn()
      } as any;

      vi.mocked(parseJidParts).mockReturnValue({ user: "12345678", server: "lid" });
      vi.mocked(parsePhoneCandidateFromText).mockReturnValue("628123456789");
      vi.mocked(normalizeWaNumber).mockReturnValue(null);
      vi.mocked(resolveInboundIdentity).mockResolvedValue({
        waNumber: "628123456789",
        waLid: "12345678"
      });
      vi.mocked(forwardInboundMessage).mockResolvedValue({
        ok: true,
        payload: {}
      });
      vi.mocked(sendInboundReplyPayload).mockResolvedValue(undefined);

      const msg = {
        key: { remoteJid: "12345678@lid", fromMe: false },
        message: { conversation: "628123456789" }
      };

      await processIncomingMessage(sock, msg);

      expect(rememberLidMapping).toHaveBeenCalledWith(
        "12345678@lid",
        "628123456789@s.whatsapp.net"
      );
    });


    it("TC-022: stores LID mapping from participant metadata as fallback", async () => {
      const sock = {
        sendMessage: vi.fn(),
        onWhatsApp: vi.fn()
      } as any;

      vi.mocked(parseJidParts).mockReturnValue({ user: "12345678", server: "lid" });
      vi.mocked(parsePhoneCandidateFromText).mockReturnValue(null);
      vi.mocked(normalizeWaNumber).mockReturnValue("628987654321");
      vi.mocked(resolveInboundIdentity).mockResolvedValue({
        waNumber: "628987654321",
        waLid: "12345678"
      });
      vi.mocked(forwardInboundMessage).mockResolvedValue({
        ok: true,
        payload: {}
      });
      vi.mocked(sendInboundReplyPayload).mockResolvedValue(undefined);

      const msg = {
        key: {
          remoteJid: "12345678@lid",
          participant: "628987654321@s.whatsapp.net",
          fromMe: false
        },
        message: { conversation: "halo" }
      };

      await processIncomingMessage(sock, msg);

      expect(rememberLidMapping).toHaveBeenCalledWith(
        "12345678@lid",
        "628987654321@s.whatsapp.net"
      );
    });


    it("TC-023: does not forward message when waNumber cannot be resolved", async () => {
      const sock = {
        sendMessage: vi.fn(),
        onWhatsApp: vi.fn()
      } as any;

      vi.mocked(parseJidParts).mockReturnValue({ user: "12345678", server: "lid" });
      vi.mocked(parsePhoneCandidateFromText).mockReturnValue(null);
      vi.mocked(normalizeWaNumber).mockReturnValue(null);
      vi.mocked(resolveInboundIdentity).mockResolvedValue({
        waNumber: null,
        waLid: undefined
      });

      const msg = {
        key: { remoteJid: "12345678@lid", fromMe: false },
        message: { conversation: "halo" }
      };

      await expect(processIncomingMessage(sock, msg)).resolves.toBeUndefined();

      expect(forwardInboundMessage).not.toHaveBeenCalled();
      expect(sendInboundReplyPayload).not.toHaveBeenCalled();
    });


    it("TC-024: payload includes phoneInputRegistered when registration check succeeds", async () => {
      const sock = {
        sendMessage: vi.fn(),
        onWhatsApp: vi.fn()
      } as any;

      vi.mocked(parseJidParts).mockReturnValue({ user: "628111222333", server: "s.whatsapp.net" });
      vi.mocked(parsePhoneCandidateFromText).mockReturnValue("628999888777");
      vi.mocked(normalizeWaNumber).mockReturnValue("628111222333");
      vi.mocked(resolveInboundIdentity).mockResolvedValue({
        waNumber: "628111222333",
        waLid: undefined
      });
      vi.mocked(checkWhatsAppRegistration).mockResolvedValue(true);
      vi.mocked(forwardInboundMessage).mockResolvedValue({
        ok: true,
        payload: {}
      });
      vi.mocked(sendInboundReplyPayload).mockResolvedValue(undefined);

      const msg = {
        key: { remoteJid: "628111222333@s.whatsapp.net", fromMe: false },
        message: { conversation: "628999888777" }
      };

      await processIncomingMessage(sock, msg);

      expect(forwardInboundMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneInput: "628999888777",
          phoneInputRegistered: true
        })
      );
    });
  });
});
