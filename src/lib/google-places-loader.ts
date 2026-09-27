export interface PlaceLike { id?: string; addressComponents?: import("@/lib/google-address").GoogleAddressComponent[]; location?: { lat: () => number; lng: () => number }; fetchFields: (input: { fields: string[] }) => Promise<void>; }
export interface PredictionLike { text: { toString: () => string }; toPlace: () => PlaceLike; }
interface SuggestionLike { placePrediction?: PredictionLike; }
export interface PlacesLibrary { AutocompleteSessionToken: new () => object; AutocompleteSuggestion: { fetchAutocompleteSuggestions: (input: Record<string, unknown>) => Promise<{ suggestions: SuggestionLike[] }> }; }
interface GoogleMapsWindow extends Window { google?: { maps: { importLibrary: (name: string) => Promise<PlacesLibrary> } }; __tekcentralGoogleMapsReady?: () => void; gm_authFailure?: () => void; }
let mapsPromise: Promise<void> | undefined;
const scriptId = "tekcentral-google-maps-script";

export function loadGoogleMaps(key: string) {
  const googleWindow = window as GoogleMapsWindow;
  if (googleWindow.google?.maps.importLibrary) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const fail = (message: string) => { mapsPromise = undefined; reject(new Error(message)); };
    googleWindow.__tekcentralGoogleMapsReady = () => { delete googleWindow.__tekcentralGoogleMapsReady; resolve(); };
    googleWindow.gm_authFailure = () => fail("Google Maps authentication was rejected. Check browser-key API and referrer restrictions.");
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("error", () => fail("Google Maps JavaScript failed to load."), { once: true }); return; }
    const script = document.createElement("script"); script.id = scriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&libraries=places&v=weekly&callback=__tekcentralGoogleMapsReady&auth_referrer_policy=origin`;
    script.async = true; script.onerror = () => fail("Google Maps JavaScript failed to load."); document.head.append(script);
  });
  return mapsPromise;
}

export function getGoogleMapsWindow() { return window as GoogleMapsWindow; }
