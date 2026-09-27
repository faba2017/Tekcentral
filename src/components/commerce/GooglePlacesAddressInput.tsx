import { useEffect, useRef, useState } from "react";
import { parseGoogleAddressComponents } from "@/lib/google-address";
import { getGoogleMapsWindow, loadGoogleMaps, type PlacesLibrary, type PredictionLike } from "@/lib/google-places-loader";
import type { DeliveryAddress } from "@/types/order";

type SuggestionState = "INITIAL" | "LOADING" | "READY" | "NO_RESULTS" | "UNAVAILABLE";

function developmentDiagnostic(error: unknown) {
  if (!import.meta.env.DEV) return "";
  const message = error instanceof Error ? error.message : "Google Places request failed.";
  if (/referer|referrer|auth/i.test(message)) return "Google Places could not load: check localhost referrer restrictions.";
  if (/key/i.test(message)) return "Google Places could not load: check the browser API key configuration.";
  return "Google Places could not load. Check Maps JavaScript API, Places API, billing and quota settings.";
}

export function GooglePlacesAddressInput({ value, onChange, onSelect, onUnavailable, onAvailable, error, errorId }: { value: string; onChange: (value: string) => void; onSelect: (address: Partial<DeliveryAddress>) => void; onUnavailable: () => void; onAvailable?: () => void; error?: string; errorId: string }) {
  const browserKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const [library, setLibrary] = useState<PlacesLibrary>(); const [suggestions, setSuggestions] = useState<PredictionLike[]>([]); const [active, setActive] = useState(-1); const [state, setState] = useState<SuggestionState>(browserKey ? "INITIAL" : "UNAVAILABLE"); const [diagnostic, setDiagnostic] = useState(browserKey || !import.meta.env.DEV ? "" : "Google Places could not load: VITE_GOOGLE_MAPS_API_KEY is missing."); const tokenRef = useRef<object>(); const requestRef = useRef(0);
  useEffect(() => {
    if (!browserKey) { onUnavailable(); return; }
    let current = true;
    loadGoogleMaps(browserKey).then(async () => {
      const google = getGoogleMapsWindow().google;
      if (!google) throw new Error("Google Maps JavaScript loaded without importLibrary.");
      const places = await google.maps.importLibrary("places");
      if (current) { setLibrary(places); setState("INITIAL"); setDiagnostic(""); onAvailable?.(); }
    }).catch((reason) => { if (current) { console.error("TekCentral Google Places initialization failed.", reason); setDiagnostic(developmentDiagnostic(reason)); setState("UNAVAILABLE"); onUnavailable(); } });
    return () => { current = false; };
  }, [browserKey, onAvailable, onUnavailable]);
  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!library || value.trim().length < 3) return;
    const timer = window.setTimeout(() => {
      setState("LOADING"); tokenRef.current ??= new library.AutocompleteSessionToken();
      library.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value.trim(), includedRegionCodes: ["za"], language: "en", region: "za", sessionToken: tokenRef.current })
        .then(({ suggestions: items }) => { if (requestId !== requestRef.current) return; const predictions = items.flatMap((item) => item.placePrediction ? [item.placePrediction] : []); setSuggestions(predictions); setActive(-1); setState(predictions.length ? "READY" : "NO_RESULTS"); })
        .catch((reason) => { if (requestId === requestRef.current) { console.error("TekCentral Google Places suggestion request failed.", reason); setDiagnostic(developmentDiagnostic(reason)); setSuggestions([]); setState("UNAVAILABLE"); onUnavailable(); } });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [library, onUnavailable, value]);
  const choose = async (prediction: PredictionLike) => {
    try {
      const place = prediction.toPlace(); await place.fetchFields({ fields: ["id", "addressComponents", "location"] });
      const parsed = parseGoogleAddressComponents(place.addressComponents ?? []);
      onSelect({ ...parsed, placeId: place.id, latitude: place.location?.lat(), longitude: place.location?.lng(), validationStatus: undefined });
      setSuggestions([]); setActive(-1); setState("INITIAL"); tokenRef.current = library ? new library.AutocompleteSessionToken() : undefined;
    } catch (reason) { console.error("TekCentral Google Place details request failed.", reason); setDiagnostic(developmentDiagnostic(reason)); setState("UNAVAILABLE"); onUnavailable(); }
  };
  return <label className="relative block text-sm font-black text-[#0A0A0A] sm:col-span-2">Street address
    <input name="tekcentral-address-search" value={value} onChange={(event) => { const next = event.target.value; if (next.trim().length < 3) { requestRef.current += 1; setSuggestions([]); setActive(-1); setState("INITIAL"); } onChange(next); }} onKeyDown={(event) => { if (!suggestions.length) return; if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, suggestions.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); } else if (event.key === "Enter" && active >= 0) { event.preventDefault(); void choose(suggestions[active]); } else if (event.key === "Escape") { setSuggestions([]); setActive(-1); setState("INITIAL"); } }} aria-describedby={errorId} aria-autocomplete="list" aria-controls="google-address-suggestions" aria-expanded={suggestions.length > 0} className="mt-2 h-12 w-full rounded-md border border-[#E4E7EC] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--tek-accent)] focus:ring-4 focus:ring-[rgba(70,157,139,0.14)]" autoComplete="off" />
    {state === "LOADING" && <span className="absolute right-3 top-11 text-xs font-semibold text-[#727986]">Searching...</span>}
    {state === "NO_RESULTS" && value.trim().length >= 3 && <span className="mt-2 block text-xs font-semibold text-[#727986]">No matching addresses found</span>}
    {suggestions.length > 0 && <ul id="google-address-suggestions" role="listbox" className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-[#E4E7EC] bg-white p-1 shadow-xl">{suggestions.map((prediction, index) => <li key={`${prediction.text.toString()}-${index}`}><button type="button" role="option" aria-selected={active === index} onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(prediction)} className={`w-full rounded px-3 py-2 text-left text-sm font-semibold ${active === index ? "bg-[#EFFFFB]" : "hover:bg-[#F6F7F9]"}`}>{prediction.text.toString()}</button></li>)}</ul>}
    {diagnostic && <span className="mt-2 block text-xs font-semibold text-[#B54708]">{diagnostic}</span>}
    {error && <span id={errorId} className="mt-2 block text-sm font-semibold text-red-700">{error}</span>}
  </label>;
}
