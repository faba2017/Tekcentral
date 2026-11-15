import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { productTaxonomy } from "../src/lib/product-taxonomy.js";
import { loadPersistenceConfig } from "./persistence/config.js";
import { query, withTransaction } from "./persistence/postgres.js";

export type TaxonomyLevel = "CATEGORY" | "SUBCATEGORY" | "PRODUCT_TYPE";
export type TaxonomyLifecycle = "ACTIVE" | "DEPRECATED" | "ARCHIVED";
export interface CanonicalTaxonomyNode {
  id: string; name: string; slug: string; parentId?: string; level: TaxonomyLevel; status: TaxonomyLifecycle;
  sortOrder: number; storefrontVisible: boolean; seoTitle?: string; seoDescription?: string; aliases: string[];
  revision: number; createdAt: string; updatedAt: string;
}
interface Store { version: 1; nodes: CanonicalTaxonomyNode[] }
const storePath = () => resolve(process.cwd(), ".data", "canonical-taxonomy.json");
let cache: { nodes: CanonicalTaxonomyNode[]; expiresAt: number } | undefined;

export function bootstrapTaxonomyNodes(): CanonicalTaxonomyNode[] {
  const createdAt = new Date(0).toISOString(); const rows: CanonicalTaxonomyNode[] = []; const usedIds = new Set<string>();
  const stableId = (id: string, parentId: string) => { if (!usedIds.has(id)) { usedIds.add(id); return id; } const qualified = `${id}__${parentId}`; usedIds.add(qualified); return qualified; };
  productTaxonomy.forEach((category) => {
    rows.push({ id: category.id, name: category.label, slug: category.slug, level: "CATEGORY", status: "ACTIVE", sortOrder: category.sortOrder, storefrontVisible: true, seoTitle: category.seoTitle, seoDescription: category.description, aliases: [], revision: 1, createdAt, updatedAt: createdAt });
    category.children.forEach((subcategory, index) => {
      rows.push({ id: subcategory.id, name: subcategory.label, slug: subcategory.slug, parentId: category.id, level: "SUBCATEGORY", status: "ACTIVE", sortOrder: index + 1, storefrontVisible: true, aliases: [], revision: 1, createdAt, updatedAt: createdAt });
      subcategory.productTypes?.forEach((productType, typeIndex) => rows.push({ id: stableId(productType.id, subcategory.id), name: productType.label, slug: productType.slug, parentId: subcategory.id, level: "PRODUCT_TYPE", status: "ACTIVE", sortOrder: typeIndex + 1, storefrontVisible: true, aliases: [], revision: 1, createdAt, updatedAt: createdAt }));
    });
  });
  return rows;
}

async function seedPostgresIfEmpty() {
  const count = Number((await query<{ count: string }>("SELECT count(*)::text AS count FROM canonical_taxonomy_nodes")).rows[0]?.count ?? 0); if (count) return;
  const seed = bootstrapTaxonomyNodes();
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('canonical-taxonomy-seed'))");
    const existing = Number((await client.query<{ count: string }>("SELECT count(*)::text AS count FROM canonical_taxonomy_nodes")).rows[0]?.count ?? 0); if (existing) return;
    for (const node of seed) await client.query("INSERT INTO canonical_taxonomy_nodes(id,name,slug,parent_id,level,status,sort_order,storefront_visible,seo_title,seo_description,aliases,revision,created_at,updated_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb)", [node.id,node.name,node.slug,node.parentId??null,node.level,node.status,node.sortOrder,node.storefrontVisible,node.seoTitle??null,node.seoDescription??null,JSON.stringify(node.aliases),node.revision,node.createdAt,node.updatedAt,JSON.stringify(node)]);
  });
}
function timestamp(value: unknown) { return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString(); }
function fromRow(row: Record<string, unknown>): CanonicalTaxonomyNode { return { id:String(row.id),name:String(row.name),slug:String(row.slug),parentId:row.parent_id?String(row.parent_id):undefined,level:row.level as TaxonomyLevel,status:row.status as TaxonomyLifecycle,sortOrder:Number(row.sort_order),storefrontVisible:Boolean(row.storefront_visible),seoTitle:row.seo_title?String(row.seo_title):undefined,seoDescription:row.seo_description?String(row.seo_description):undefined,aliases:Array.isArray(row.aliases)?row.aliases.map(String):[],revision:Number(row.revision),createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at) }; }
async function readLocal(): Promise<CanonicalTaxonomyNode[]> { try { const value=JSON.parse(await readFile(storePath(),"utf8")) as Store; if(value.version===1&&Array.isArray(value.nodes)) return value.nodes; } catch { /* bootstrap below */ } const nodes=bootstrapTaxonomyNodes(); await writeLocal(nodes); return nodes; }
async function writeLocal(nodes: CanonicalTaxonomyNode[]) { const target=storePath(),temp=`${target}.${process.pid}.${randomUUID()}.tmp`; await mkdir(dirname(target),{recursive:true}); await writeFile(temp,JSON.stringify({version:1,nodes},null,2)); await rename(temp,target); }
export function invalidateCanonicalTaxonomyCache(){ cache=undefined; }
export async function listCanonicalTaxonomyNodes(options: { fresh?: boolean } = {}) {
  if(!options.fresh&&cache&&cache.expiresAt>Date.now()) return structuredClone(cache.nodes);
  let nodes: CanonicalTaxonomyNode[];
  if(loadPersistenceConfig().provider==="POSTGRES"){ await seedPostgresIfEmpty(); nodes=(await query<Record<string,unknown>>("SELECT id,name,slug,parent_id,level,status,sort_order,storefront_visible,seo_title,seo_description,aliases,revision,created_at,updated_at FROM canonical_taxonomy_nodes ORDER BY level,sort_order,name")).rows.map(fromRow); }
  else nodes=await readLocal();
  cache={nodes,expiresAt:Date.now()+30_000}; return structuredClone(nodes);
}
export async function saveCanonicalTaxonomyNode(node: CanonicalTaxonomyNode, expectedRevision?: number) {
  if(loadPersistenceConfig().provider==="POSTGRES"){
    await withTransaction(async(client)=>{ await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`taxonomy:${node.parentId??"ROOT"}:${node.slug}`]); const duplicate=await client.query("SELECT id FROM canonical_taxonomy_nodes WHERE coalesce(parent_id,'')=coalesce($1,'') AND slug=$2 AND id<>$3",[node.parentId??null,node.slug,node.id]); if(duplicate.rowCount) throw new Error("TAXONOMY_SLUG_CONFLICT"); const result=await client.query("INSERT INTO canonical_taxonomy_nodes(id,name,slug,parent_id,level,status,sort_order,storefront_visible,seo_title,seo_description,aliases,revision,created_at,updated_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,parent_id=excluded.parent_id,level=excluded.level,status=excluded.status,sort_order=excluded.sort_order,storefront_visible=excluded.storefront_visible,seo_title=excluded.seo_title,seo_description=excluded.seo_description,aliases=excluded.aliases,revision=excluded.revision,updated_at=excluded.updated_at,payload=excluded.payload WHERE canonical_taxonomy_nodes.revision=$16 RETURNING id",[node.id,node.name,node.slug,node.parentId??null,node.level,node.status,node.sortOrder,node.storefrontVisible,node.seoTitle??null,node.seoDescription??null,JSON.stringify(node.aliases),node.revision,node.createdAt,node.updatedAt,JSON.stringify(node),expectedRevision??node.revision]); if(!result.rowCount) throw new Error("TAXONOMY_REVISION_CONFLICT"); });
  } else { const nodes=await readLocal(); const duplicate=nodes.find(item=>(item.parentId??"")===(node.parentId??"")&&item.slug===node.slug&&item.id!==node.id); if(duplicate) throw new Error("TAXONOMY_SLUG_CONFLICT"); const index=nodes.findIndex(item=>item.id===node.id); if(index>=0&&expectedRevision!==undefined&&nodes[index].revision!==expectedRevision) throw new Error("TAXONOMY_REVISION_CONFLICT"); if(index>=0)nodes[index]=node;else nodes.push(node); await writeLocal(nodes); }
  invalidateCanonicalTaxonomyCache(); return node;
}
