import type { ActionFunctionArgs } from "react-router";

import {
  type OrderPaidPayload,
  recordDiscountApplications,
} from "../services/stats.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  await recordDiscountApplications(shop, payload as OrderPaidPayload);
  return new Response(null, { status: 200 });
};
