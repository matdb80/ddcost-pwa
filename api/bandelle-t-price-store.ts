import { createBandellePriceStore } from "./bandelle-price-store";
import { validateBandelleTPrices, applyBandelleTPriceOperations } from "../src/lib/bandelle-t-pricebook";
const store = createBandellePriceStore({
  table: "bandelle_t_price_revisions", validate: validateBandelleTPrices,
  apply: applyBandelleTPriceOperations, roundingLabel: "al millesimo",
});
export const readBandellePrices = store.read;
export const listBandellePriceHistory = store.history;
export const saveBandellePrices = store.save;
