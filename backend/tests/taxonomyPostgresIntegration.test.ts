import assert from "node:assert/strict";
import { closePostgres, query } from "../persistence/postgres.js";
import { bootstrapTaxonomyNodes, invalidateCanonicalTaxonomyCache, listCanonicalTaxonomyNodes } from "../canonicalTaxonomyRepository.js";
import { createCanonicalTaxonomyNode, getCanonicalTaxonomyTree, resolveCanonicalTaxonomy, updateCanonicalTaxonomyNode } from "../canonicalTaxonomyService.js";

const nodes = await listCanonicalTaxonomyNodes({ fresh: true });
assert.equal(nodes.length, bootstrapTaxonomyNodes().length);
assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length);
const original = nodes.find((node) => node.level === "CATEGORY");
assert.ok(original);
const created = await createCanonicalTaxonomyNode({ name: "Integration Category", level: "CATEGORY", storefrontVisible: false, actor: "Taxonomy integration" });
assert.equal(created.storefrontVisible, false);
const renamed = await updateCanonicalTaxonomyNode({ id: created.id, name: "Integration Hardware", slug: "integration-hardware", expectedRevision: created.revision, actor: "Taxonomy integration" });
assert.equal(renamed.node.aliases.includes("integration-category"), true);
const child = await createCanonicalTaxonomyNode({ name: "Runtime-only Devices", parentId: created.id, level: "SUBCATEGORY", storefrontVisible: true, actor: "Taxonomy integration" });
const visible = await updateCanonicalTaxonomyNode({ id: created.id, storefrontVisible: true, expectedRevision: renamed.node.revision, actor: "Taxonomy integration" });
invalidateCanonicalTaxonomyCache();
const runtimeTree = await getCanonicalTaxonomyTree({ storefrontOnly: true });
const runtimeCategory = runtimeTree.find((node) => node.id === created.id);
assert.equal(runtimeCategory?.name, "Integration Hardware");
assert.equal(runtimeCategory?.aliases.includes("integration-category"), true);
assert.equal(runtimeCategory?.children.some((node) => node.id === child.id), true);
assert.deepEqual(await resolveCanonicalTaxonomy({ name: "Runtime Product", categoryId: created.id, subcategoryId: child.id, taxonomyVersion: 1, taxonomyStatus: "VERIFIED" }), { categoryId: created.id, subcategoryId: child.id, productTypeId: undefined, taxonomyVersion: 1, taxonomyStatus: "VERIFIED" });
const conflict = await Promise.allSettled([
  updateCanonicalTaxonomyNode({ id: created.id, name: "Concurrent A", expectedRevision: visible.node.revision, actor: "Taxonomy integration" }),
  updateCanonicalTaxonomyNode({ id: created.id, name: "Concurrent B", expectedRevision: visible.node.revision, actor: "Taxonomy integration" }),
]);
assert.equal(conflict.filter((item) => item.status === "fulfilled").length, 1);
const latest = (await listCanonicalTaxonomyNodes({fresh:true})).find((node)=>node.id===created.id)!;
await updateCanonicalTaxonomyNode({id:created.id,status:"ARCHIVED",expectedRevision:latest.revision,confirmMove:true,actor:"Taxonomy integration"});
invalidateCanonicalTaxonomyCache();
assert.equal((await getCanonicalTaxonomyTree()).some((node)=>node.id===created.id),false);
assert.equal((await resolveCanonicalTaxonomy({name:"Archived Product",categoryId:created.id,taxonomyVersion:1,taxonomyStatus:"VERIFIED"})).taxonomyStatus,"UNMAPPED");
const tree = await getCanonicalTaxonomyTree({ includeInactive: true });
assert.ok(tree.some((node) => node.id === original.id));
assert.equal(Number((await query<{count:string}>("SELECT count(*)::text AS count FROM canonical_taxonomy_nodes")).rows[0]?.count), nodes.length + 2);
await closePostgres();
const databaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
invalidateCanonicalTaxonomyCache();
await assert.rejects(() => listCanonicalTaxonomyNodes({ fresh: true }), /DATABASE_URL is required/);
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
console.log("Canonical taxonomy PostgreSQL integration tests passed.");
