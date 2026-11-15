import { listAdminProducts } from "../internalProductRepository.js";
import { getPublicationReview } from "../productPublicationRepository.js";

const MAX_QUERY_LENGTH = 120;
const MAX_RESULTS = 20;

type CanonicalProduct = Awaited<ReturnType<typeof listAdminProducts>>[number];
type PublicationReview = Awaited<ReturnType<typeof getPublicationReview>>;

export interface AdminAiAutomationProductTarget {
  id: string;
  name: string;
  sku: string;
  publicationState: string;
  readinessStatus: string;
  readinessSummary: string;
  editable: true;
}

function targetDto(product: CanonicalProduct, review: PublicationReview): AdminAiAutomationProductTarget {
  const publicationState = review.state;
  const readinessStatus = review.readiness.status;
  const readinessSummary = publicationState === "PUBLISHED"
    ? "Published"
    : readinessStatus === "READY_FOR_PUBLISH_REVIEW"
      ? "Ready to launch"
      : review.readiness.blockers.length
        ? "Needs review"
        : "Draft";
  return { id: product.id, name: product.name, sku: product.sku!, publicationState, readinessStatus, readinessSummary, editable: true };
}

function isCanonicalIneligibility(error: unknown) {
  const message=error instanceof Error?error.message:"";
  return /Internal product not found|verified supplier mapping is required|Publication readiness is not available|Product is not editable/i.test(message);
}

export async function searchAdminAiAutomationProductTargets(
  input: { query?: string; selectedId?: string; limit?: number },
  dependencies: { listProducts?: typeof listAdminProducts; getReview?: typeof getPublicationReview } = {},
) {
  const query = (input.query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const normalized = query.toLocaleLowerCase("en-ZA");
  const limit = Math.max(1, Math.min(MAX_RESULTS, Math.trunc(input.limit ?? MAX_RESULTS)));
  const allProducts = await (dependencies.listProducts ?? listAdminProducts)();
  const products = allProducts
    .filter((product) => Boolean(product.id && product.name.trim() && product.sku?.trim()))
    .filter((product) => !normalized || `${product.name} ${product.sku}`.toLocaleLowerCase("en-ZA").includes(normalized))
    .sort((left, right) => left.name.localeCompare(right.name, "en-ZA"));
  const getReview = dependencies.getReview ?? getPublicationReview;
  const results: AdminAiAutomationProductTarget[] = [];
  for (const product of products) {
    if (results.length >= limit) break;
    try { results.push(targetDto(product, await getReview(product.id))); } catch (error) { if(!isCanonicalIneligibility(error))throw error; }
  }
  let selected: AdminAiAutomationProductTarget | undefined;
  const selectedId = input.selectedId?.trim();
  if (selectedId) {
    selected = results.find((item) => item.id === selectedId);
    if (!selected) {
      const product = allProducts.find((item) => item.id === selectedId && Boolean(item.name.trim() && item.sku?.trim()));
      if (product) { try { selected = targetDto(product, await getReview(product.id)); } catch (error) { if(!isCanonicalIneligibility(error))throw error;selected=undefined; } }
    }
  }
  return { products: results, selected, query, limit };
}

export const __adminAiAutomationProductTargetsTest = { MAX_QUERY_LENGTH, MAX_RESULTS, targetDto, isCanonicalIneligibility };
