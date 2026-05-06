"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { ArrowLeft, Fingerprint, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SiweMessage } from "siwe";
import { useAccount, useChainId, useConnect, useSignMessage } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

import { DidLinkedContent } from "./_components/did-linked-content";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

/** EIP-4361 requires statement to be ASCII only - use fixed strings, not translations */
const SIWE_STATEMENT_LINK = "Link your decentralized identity (DID) to your Unitoken account.";
const SIWE_STATEMENT_UNLINK = "Unlink your DID from your Unitoken account.";

interface DidStatus {
  enabled: boolean;
  did?: string;
  method?: string;
  linkedAt?: string;
}

export default function DidPage() {
  const t = useTranslations("AccountPage.did");
  const [status, setStatus] = useState<DidStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const pendingLinkRef = useRef(false);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId() || 1;

  const fetchStatus = useCallback(async () => {
    console.log("[did] fetchStatus start", { API_BASE_URL });
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/did/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: Partial<DidStatus> = await res.json();
        console.log("[did] fetchStatus success", data);
        setStatus({ enabled: data.enabled ?? false, did: data.did, method: data.method, linkedAt: data.linkedAt });
      } else {
        console.log("[did] fetchStatus not ok", { status: res.status });
        setStatus(null);
      }
    } catch (e) {
      console.log("[did] fetchStatus error", e);
      setStatus(null);
      toast({ title: t("error_fetch"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const fetchDidNonce = useCallback(async () => {
    console.log("[did] fetchDidNonce start");
    const res = await fetch(`${API_BASE_URL}/dashboard/auth/did/nonce`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      console.log("[did] fetchDidNonce error", { status: res.status, err });
      throw new Error(err.error ?? t("error_nonce"));
    }
    /* eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- res.json() returns unknown */
    const data = (await res.json()) as { nonce?: string };
    console.log("[did] fetchDidNonce success", { nonce: data.nonce ? "***" : undefined });
    return data.nonce ?? "";
  }, [t]);

  const fetchUnlinkNonce = useCallback(async () => {
    console.log("[did] fetchUnlinkNonce start");
    const res = await fetch(`${API_BASE_URL}/dashboard/auth/did/unlink/nonce`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      console.log("[did] fetchUnlinkNonce error", { status: res.status, err });
      throw new Error(err.error ?? t("error_nonce"));
    }
    /* eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- res.json() returns unknown */
    const data = (await res.json()) as { nonce?: string };
    console.log("[did] fetchUnlinkNonce success", { nonce: data.nonce ? "***" : undefined });
    return data.nonce ?? "";
  }, [t]);

  const createAndSignMessage = useCallback(
    async (nonce: string, statement: string) => {
      if (!address) throw new Error(t("wallet_required"));
      const domain = typeof window !== "undefined" ? window.location.host : "aiagents-hub.vn";
      const origin = typeof window !== "undefined" ? window.location.origin : "https://aiagents-hub.vn";

      const siweMessage = new SiweMessage({
        domain,
        address,
        statement,
        uri: origin,
        version: "1",
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      const message = siweMessage.prepareMessage();
      console.log("[did] createAndSignMessage prepared", { domain, address, chainId });
      toast({ title: t("open_wallet_sign") });
      const signature = await signMessageAsync({ message });
      console.log("[did] createAndSignMessage signed", { signaturePrefix: signature.slice(0, 10) + "..." });
      return { message, signature: signature.startsWith("0x") ? signature : `0x${signature}` };
    },
    [address, chainId, signMessageAsync, t],
  );

  const handleLinkDid = useCallback(async () => {
    if (!address || linking) return;
    console.log("[did] handleLinkDid start", { address, linking });

    setLinking(true);
    try {
      const nonce = await fetchDidNonce();
      const { message, signature } = await createAndSignMessage(nonce, SIWE_STATEMENT_LINK);

      const res = await fetch(`${API_BASE_URL}/dashboard/auth/did/link`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        console.log("[did] handleLinkDid API error", { status: res.status, err });
        throw new Error(err.error ?? t("error_link"));
      }

      const result: { did: string } = await res.json();
      console.log("[did] handleLinkDid success", { did: result.did });
      toast({ title: t("link_success", { did: result.did }) });
      void fetchStatus();
    } catch (e) {
      console.log("[did] handleLinkDid error", e);
      const msg = e instanceof Error ? e.message : t("error_link");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  }, [address, linking, t, fetchDidNonce, createAndSignMessage, fetchStatus]);

  const handleUnlinkDid = useCallback(async () => {
    if (!address || !status?.enabled || unlinking) return;
    console.log("[did] handleUnlinkDid start", { address, enabled: status.enabled, unlinking });

    setUnlinking(true);
    setShowUnlinkConfirm(false);
    try {
      const nonce = await fetchUnlinkNonce();
      const { message, signature } = await createAndSignMessage(nonce, SIWE_STATEMENT_UNLINK);

      const res = await fetch(`${API_BASE_URL}/dashboard/auth/did/unlink`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        console.log("[did] handleUnlinkDid API error", { status: res.status, err });
        throw new Error(err.error ?? t("error_unlink"));
      }

      console.log("[did] handleUnlinkDid success");
      toast({ title: t("unlink_success") });
      void fetchStatus();
    } catch (e) {
      console.log("[did] handleUnlinkDid error", e);
      const msg = e instanceof Error ? e.message : t("error_unlink");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setUnlinking(false);
    }
  }, [address, status?.enabled, unlinking, t, fetchUnlinkNonce, createAndSignMessage, fetchStatus]);

  const handleConnectAndLink = useCallback(async () => {
    console.log("[did] handleConnectAndLink", { isConnected, address });
    if (isConnected && address) {
      await handleLinkDid();
      return;
    }

    pendingLinkRef.current = true;
    try {
      const injectedConnector = connectors.find((c) => c.id === "injected");
      const walletConnectConnector = connectors.find((c) => c.id === "walletConnect");

      if (injectedConnector && typeof window !== "undefined" && window.ethereum) {
        toast({ title: t("open_wallet_accept") });
        await connect({ connector: injectedConnector });
      } else if (walletConnectConnector) {
        toast({ title: t("opening_walletconnect") });
        await connect({ connector: walletConnectConnector });
      } else {
        pendingLinkRef.current = false;
        toast({ title: t("no_wallet_found"), variant: "destructive" });
      }
    } catch (e) {
      pendingLinkRef.current = false;
      toast({ title: e instanceof Error ? e.message : t("error_connect"), variant: "destructive" });
    }
  }, [isConnected, address, connectors, connect, t, handleLinkDid]);

  useEffect(() => {
    if (isConnected && address && pendingLinkRef.current && !status?.enabled && !linking) {
      console.log("[did] useEffect: pending link triggered, calling handleLinkDid");
      pendingLinkRef.current = false;
      void handleLinkDid();
    }
  }, [isConnected, address, status?.enabled, linking, handleLinkDid]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="ghost" size="sm" className="w-fit" asChild>
          <Link href="/dashboard/control/account">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back_to_account")}
          </Link>
        </Button>
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/dashboard/control/account">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("back_to_account")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground text-sm">{t("detail")}</p>

          {status && status.enabled ? (
            <DidLinkedContent
              status={status}
              showUnlinkConfirm={showUnlinkConfirm}
              setShowUnlinkConfirm={setShowUnlinkConfirm}
              unlinking={unlinking}
              onUnlink={handleUnlinkDid}
              t={t}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">{t("no_did_hint")}</p>
              <Button onClick={handleConnectAndLink} disabled={isConnecting || linking}>
                <Link2 className="mr-2 h-4 w-4" />
                {isConnecting ? t("connecting") : linking ? t("linking") : t("link_wallet")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
