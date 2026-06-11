import prisma from "../db.server";

/** A single discount entry as it appears in a Shopify order `discount_applications`. */
export interface OrderDiscountApplication {
  title?: string | null;
  value?: string | number | null;
  value_type?: string | null;
}

/** The subset of the orders/paid webhook payload we read. */
export interface OrderPaidPayload {
  id: number | string;
  customer?: { id: number | string | null } | null;
  discount_applications?: OrderDiscountApplication[] | null;
}

/**
 * Records one `discount_application` row per discount that fired on a paid order.
 * Discounts are matched back to a rule by title — the Function sets the discount
 * message to `rule.name`, which Shopify surfaces as `discount_application.title`.
 * Idempotent on retries via `skipDuplicates` + the `[shop, order_id,
 * discount_rule_id]` unique constraint.
 */
export async function recordDiscountApplications(
  shop: string,
  payload: OrderPaidPayload,
): Promise<void> {
  const applications = payload.discount_applications ?? [];
  if (applications.length === 0) {
    return;
  }

  const orderId = String(payload.id);
  const customerShopifyId = payload.customer?.id
    ? String(payload.customer.id)
    : null;

  const activeRules = await prisma.discount_rule.findMany({
    where: { shop, status: "active" },
    select: { id: true, name: true },
  });
  const ruleByName = new Map(activeRules.map((rule) => [rule.name, rule]));

  const localCustomer = customerShopifyId
    ? await prisma.customer.findUnique({
        where: { shop_shopify_id: { shop, shopify_id: customerShopifyId } },
        select: { id: true },
      })
    : null;

  const rows = applications.map((item) => ({
    shop,
    order_id: orderId,
    discount_rule_id: item.title ? (ruleByName.get(item.title)?.id ?? null) : null,
    customer_id: localCustomer?.id ?? null,
    discount_value: item.value ?? 0,
    discount_type: item.value_type ?? "",
  }));

  await prisma.discount_application.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

/** Dashboard statistics for a shop: totals plus 30-day usage aggregates. */
export async function getDiscountStats(shop: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalRules,
    activeRules,
    totalCustomers,
    applicationsLast30Days,
    applicationsByDay,
    applicationsByRule,
  ] = await prisma.$transaction([
    prisma.discount_rule.count({ where: { shop } }),

    prisma.discount_rule.count({ where: { shop, status: "active" } }),

    prisma.customer.count({ where: { shop } }),

    prisma.discount_application.count({
      where: { shop, applied_at: { gte: thirtyDaysAgo } },
    }),

    // daily applications for last 30 days — for line/bar chart
    prisma.$queryRaw<{ date: string; count: number }[]>`
      SELECT DATE(applied_at) as date, COUNT(*)::int as count
      FROM discount_application
      WHERE shop = ${shop}
        AND applied_at >= ${thirtyDaysAgo}
      GROUP BY DATE(applied_at)
      ORDER BY date ASC
    `,

    // applications per rule — for bar chart
    prisma.$queryRaw<{ rule_name: string; count: number }[]>`
      SELECT dr.name as rule_name, COUNT(da.id)::int as count
      FROM discount_application da
      LEFT JOIN discount_rule dr ON da.discount_rule_id = dr.id
      WHERE da.shop = ${shop}
        AND da.applied_at >= ${thirtyDaysAgo}
      GROUP BY dr.name
      ORDER BY count DESC
      LIMIT 10
    `,
  ]);

  return {
    totalRules,
    activeRules,
    totalCustomers,
    applicationsLast30Days,
    applicationsByDay,
    applicationsByRule,
  };
}
