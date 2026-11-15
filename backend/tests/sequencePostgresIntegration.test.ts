import assert from "node:assert/strict";
import { closePostgres, query } from "../persistence/postgres.js";

const year = 2026;
const numbers = (await query<{ order_number: string }>("SELECT order_number FROM commerce_orders WHERE order_number LIKE $1", [`TC-${year}-%`])).rows.map((row) => Number(row.order_number.split("-").at(-1))).filter(Number.isFinite);
const historicalMax = Math.max(0, ...numbers);
const current = (await query<{ next_value: string }>("SELECT next_value::text FROM app_sequences WHERE name='order' AND year=$1", [year])).rows[0];
assert.ok(current, "Current order sequence must be seeded.");
assert.ok(Number(current.next_value) > historicalMax, "Order sequence must remain above historical order numbers.");

const runId = `${Date.now()}-${process.pid}`;
const allocate = (name: string) => query<{ value: string }>("SELECT allocate_business_sequence($1,$2)::text AS value", [name, year]).then((result) => Number(result.rows[0].value));
const orderValues = await Promise.all(Array.from({ length: 20 }, () => allocate(`verification-order-${runId}`)));
const invoiceValues = await Promise.all(Array.from({ length: 20 }, () => allocate(`verification-invoice-${runId}`)));
assert.equal(new Set(orderValues).size, 20);
assert.equal(new Set(invoiceValues).size, 20);
assert.deepEqual([...orderValues].sort((a,b)=>a-b),Array.from({length:20},(_,index)=>index+1));
assert.deepEqual([...invoiceValues].sort((a,b)=>a-b),Array.from({length:20},(_,index)=>index+1));
console.log(JSON.stringify({ historicalOrderMax: historicalMax, configuredOrderNextValue: Number(current.next_value), concurrentOrderAllocations: 20, concurrentInvoiceAllocations: 20, independentSequences: true }));
await closePostgres();
