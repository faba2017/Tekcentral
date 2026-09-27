import { baselinePaidOrderAlerts } from "../adminOperations.js";

const result = await baselinePaidOrderAlerts();

console.log(`Baselined paid order alerts: ${result.count}`);
if (result.orderNumbers.length > 0) {
  console.log(`Order numbers: ${result.orderNumbers.join(", ")}`);
}
