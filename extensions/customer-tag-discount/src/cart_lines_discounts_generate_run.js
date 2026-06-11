// @ts-check

/**
 * Each rule in the `discount_app.rules` shop metafield (written by
 * app/services/syncMetafield.server.ts):
 *
 * {
 *   name: string,
 *   customerTag: string,                 // app-internal tag name, e.g. "VIP"
 *   discountType: "percentage" | "fixed_amount",
 *   discountValue: number,
 *   scopeType: "all" | "collection" | "product",
 *   scopeItems: { shopifyGid: string, itemType: "collection" | "product" }[],
 *   productGids: string[]                // flattened product allow-list for
 *                                        // "product" and "collection" scope
 * }
 *
 * The customer's tags come from the `discount_app.tags` customer metafield
 * (written by app/services/customers.server.ts) — a JSON array of tag names.
 */

const NO_DISCOUNT = { operations: [] };

/**
 * @param {import("../generated/api").CartLinesDiscountsGenerateRunInput} input
 * @returns {import("../generated/api").CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const rules = input.shop?.metafield?.jsonValue;
  if (!Array.isArray(rules) || rules.length === 0) {
    return NO_DISCOUNT;
  }

  const customerTags = input.cart?.buyerIdentity?.customer?.metafield?.jsonValue;
  if (!Array.isArray(customerTags) || customerTags.length === 0) {
    return NO_DISCOUNT;
  }

  const lines = input.cart?.lines ?? [];
  const candidates = [];

  for (const rule of rules) {
    if (!customerTags.includes(rule.customerTag)) continue;

    const targets = lineTargets(lines, rule);
    if (targets.length === 0) continue;

    candidates.push({
      message: rule.name,
      targets,
      value:
        rule.discountType === "percentage"
          ? { percentage: { value: String(rule.discountValue) } }
          : { fixedAmount: { amount: String(rule.discountValue) } },
    });
  }

  if (candidates.length === 0) {
    return NO_DISCOUNT;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          // FIRST: when multiple rules match a line, the first wins.
          // Switch to "MAXIMUM" to let the best discount win.
          selectionStrategy: "FIRST",
        },
      },
    ],
  };
}

/**
 * Cart-line targets a rule applies to, by scope.
 * @returns {{ cartLine: { id: string } }[]}
 */
function lineTargets(lines, rule) {
  const variantLines = lines.filter(
    (line) => line.merchandise?.__typename === "ProductVariant",
  );

  if (rule.scopeType === "all") {
    return variantLines.map((line) => ({ cartLine: { id: line.id } }));
  }

  // "product" and "collection" both resolve to a flat product GID allow-list
  // (collections are flattened to product GIDs at sync time on the app side).
  const allowed = new Set(rule.productGids ?? []);
  return variantLines
    .filter((line) => allowed.has(line.merchandise.product?.id))
    .map((line) => ({ cartLine: { id: line.id } }));
}
