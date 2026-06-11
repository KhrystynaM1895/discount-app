import type { ActionFunctionArgs } from "react-router";

import {
  type CustomerWebhookPayload,
  upsertCustomerFromWebhook,
} from "../services/customers.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  await upsertCustomerFromWebhook(shop, payload as CustomerWebhookPayload);
  return new Response(null, { status: 200 });
};
