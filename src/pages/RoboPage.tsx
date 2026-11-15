import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConsentCard, ZeusCapabilityRail, ZeusComposer, ZeusConversation, ZeusGroupedProductResults, ZeusGuardrail, ZeusIdentity, ZeusResults, ZeusSuggestions } from "@/components/zeus/ZeusWorkspace";
import { getProductBySlug } from "@/data/catalogue";
import { usePageMetadata } from "@/lib/page-metadata";
import { askZeus, getZeusConsent, grantZeusConsent, revokeZeusConsent, ZeusApiError, type ZeusGuardAction, type ZeusMessage, type ZeusReply } from "@/lib/zeus";
import { useCustomerAuth } from "@/state/customer-auth";
import { cancelPendingCartAction, confirmPendingCartAction } from "@/lib/cart-api";
import { CartConfirmationCard } from "@/components/zeus/CartConfirmationCard";
import { useCart } from "@/state/cart";

export function RoboPage() {
  usePageMetadata({ title: "Ask Zeus | TekCentral", description: "Ask Zeus for grounded help finding and comparing technology, understanding policies and reviewing your TekCentral account orders.", path: "/zeus" });
  const [params] = useSearchParams();
  const product = params.get("product") ? getProductBySlug(params.get("product") ?? "") : undefined;
  const [messages, setMessages] = useState<ZeusMessage[]>([]);
  const [reply, setReply] = useState<ZeusReply>();
  const [question, setQuestion] = useState(product ? `Tell me about ${product.brand} ${product.name}.` : "");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [errorActions, setErrorActions] = useState<ZeusGuardAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);
  const [pendingConsentMessages, setPendingConsentMessages] = useState<ZeusMessage[]>([]);
  const auth = useCustomerAuth();
  const cart = useCart();

  useEffect(() => { let active = true; void (async () => { const granted = auth.state === "authenticated" ? (await getZeusConsent()).granted : false; if (active) setConsentGranted(granted); })(); return () => { active = false; }; }, [auth.state]);

  const applyReply = (next: ZeusMessage[], result: ZeusReply) => { setMessages([...next, { role: "assistant", content: result.message }]); setReply(result); if (result.consentRequired) { setConsentRequired(true); setPendingConsentMessages(next); } };
  const submit = async (value: string) => { const content = value.trim(); if (!content || loading) return; const next = [...messages, { role: "user" as const, content }].slice(-16); const contextProductIds = reply?.products.map((item) => item.id) ?? []; setMessages(next); setQuestion(""); setReply(undefined); setError(""); setErrorCode(""); setErrorActions([]); setLoading(true); try { applyReply(next, await askZeus(next, contextProductIds)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Zeus could not complete the request."); if (cause instanceof ZeusApiError) { setErrorCode(cause.code ?? ""); setErrorActions(cause.actions); } } finally { setLoading(false); } };
  const reset = () => { setMessages([]); setReply(undefined); setQuestion(""); setError(""); setErrorCode(""); setErrorActions([]); setConsentRequired(false); setPendingConsentMessages([]); };
  const retry = () => void submit(messages.filter((message) => message.role === "user").at(-1)?.content ?? question);
  const allowAccountAssistance = async () => { setLoading(true); setError(""); try { await grantZeusConsent(); setConsentGranted(true); setConsentRequired(false); applyReply(pendingConsentMessages, await askZeus(pendingConsentMessages)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Permission could not be saved."); } finally { setLoading(false); } };
  const confirmCart = async () => { if (!reply?.pendingCartAction) return; setLoading(true); setError(""); try { const result = await confirmPendingCartAction(reply.pendingCartAction.pendingActionId); if (result.state === "CART_PRICE_CHANGED" && result.pendingActionId && result.product && result.quantity && result.expiresAt) setReply({ ...reply, message: "The price changed. Please confirm the updated price.", pendingCartAction: { ...reply.pendingCartAction, pendingActionId: result.pendingActionId, product: result.product, quantity: result.quantity, expiresAt: result.expiresAt } }); else if (result.cart) { cart.restoreCart(result.cart.lines.map(({ productId, quantity }) => ({ productId, quantity }))); setReply({ ...reply, message: "Your cart was updated successfully.", pendingCartAction: undefined, cart: result.cart }); } } catch (cause) { setError(cause instanceof Error ? cause.message : "The cart update could not be confirmed."); } finally { setLoading(false); } };

  return <main className="min-h-[calc(100vh-80px)] w-full min-w-0 overflow-x-clip bg-[#F5F7F9] pb-8">
    <ZeusIdentity authenticated={auth.state === "authenticated"} consentGranted={consentGranted} onReset={reset}/>
    <div className="mx-auto grid w-full min-w-0 max-w-[1560px] grid-cols-[minmax(0,1fr)] gap-5 px-4 pt-5 sm:px-6 sm:pt-7 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-7 lg:px-8 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-w-0 max-w-full overflow-hidden"><ZeusCapabilityRail onChoose={(prompt) => void submit(prompt)}/></aside>
      <section className="relative min-w-0 overflow-hidden rounded-[20px] border border-[#E1E6EB] bg-white shadow-[0_10px_30px_rgba(16,24,40,0.05)]" aria-label="Zeus conversation workspace">
        <div className="min-h-[480px] sm:min-h-[560px]">
          <ZeusConversation messages={messages} loading={loading}>
            {reply && (reply.productResults?.length ? <ZeusGroupedProductResults reply={reply}/> : <ZeusResults reply={reply}/>)}
            {reply?.pendingCartAction && <CartConfirmationCard action={reply.pendingCartAction} loading={loading} onConfirm={() => void confirmCart()} onCancel={() => { void cancelPendingCartAction(reply.pendingCartAction!.pendingActionId).finally(() => setReply({ ...reply, pendingCartAction: undefined, message: "The cart change was cancelled." })); }}/>}
            {reply?.cart && <section role="status" className="rounded-md border border-[#E4E7EC] bg-white p-4" aria-label="Cart summary"><div className="flex items-center justify-between gap-3"><h3 className="font-black">Your cart</h3><strong>{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(reply.cart.subtotal)}</strong></div><div className="mt-3 space-y-2">{reply.cart.lines.map((line) => <div key={line.lineId} className="flex justify-between gap-3 text-sm"><span>{line.quantity} × {line.name}</span><strong>{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(line.lineTotal)}</strong></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><a href="/cart" className="rounded-md bg-[#469D8B] px-4 py-2 text-sm font-black">View Cart</a><a href="/shop" className="rounded-md border px-4 py-2 text-sm font-black">Continue Shopping</a><a href="/checkout" className="rounded-md border px-4 py-2 text-sm font-black">Go to Checkout</a></div></section>}
            {consentRequired && <ConsentCard loading={loading} onContinue={() => void allowAccountAssistance()} onDecline={() => { setConsentRequired(false); setPendingConsentMessages([]); }}/>}
            {error && <ZeusGuardrail code={errorCode} message={error} actions={errorActions} onRetry={retry}/>}
          </ZeusConversation>
          {messages.length === 0 && <ZeusSuggestions authenticated={auth.state === "authenticated"} onChoose={(prompt) => void submit(prompt)}/>}
        </div>
        {auth.state === "authenticated" && consentGranted && !consentRequired && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EAECF0] px-4 py-3 text-xs text-[#667085] sm:px-6"><span>Secure account assistance is enabled for this session.</span><button type="button" onClick={() => void revokeZeusConsent().then(() => setConsentGranted(false)).catch((cause) => setError(cause instanceof Error ? cause.message : "Permission could not be revoked."))} className="font-black text-[#176B5C] underline">Turn off</button></div>}
        <ZeusComposer value={question} loading={loading} onChange={setQuestion} onSubmit={() => void submit(question)}/>
      </section>
    </div>
  </main>;
}
