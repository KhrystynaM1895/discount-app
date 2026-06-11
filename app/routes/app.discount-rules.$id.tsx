import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
} from "react-router";
import { Page } from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { listCustomerTags } from "../services/customerTags.server";
import {
  getRule,
  parseRuleForm,
  updateRule,
  validateRuleInput,
} from "../services/rules.server";
import { syncMetafield } from "../services/syncMetafield.server";
import { DiscountRuleForm } from "../components/DiscountRuleForm";

/** Derives a readable label from a gid, e.g. "gid://shopify/Collection/123" → "Collection 123". */
function gidToTitle(gid: string): string {
  const parts = gid.split("/");
  const id = parts[parts.length - 1];
  const type = parts[parts.length - 2];
  return type && id ? `${type} ${id}` : gid;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    throw new Response("Not Found", { status: 404 });
  }

  const rule = await getRule(session.shop, id);
  if (!rule) {
    throw new Response("Not Found", { status: 404 });
  }

  const availableTags = await listCustomerTags(session.shop);

  return {
    availableTags,
    values: {
      name: rule.name,
      customerTagId: rule.customer_tag_id,
      discountType: rule.discount_type,
      discountValue: String(rule.discount_value),
      status: rule.status,
      scopeType: rule.scope_type,
      scopeItems: rule.scope_items.map((item) => ({
        shopifyGid: item.shopify_gid,
        itemType: item.item_type,
        displayTitle: gidToTitle(item.shopify_gid),
      })),
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    throw new Response("Not Found", { status: 404 });
  }

  const formData = await request.formData();
  const { errors, value } = validateRuleInput(parseRuleForm(formData));
  if (!value) {
    return data({ errors }, { status: 400 });
  }

  await updateRule(session.shop, id, value);
  await syncMetafield(admin.graphql, session.shop);
  return redirect("/app/discount-rules");
};

export default function EditDiscountRule() {
  const { availableTags, values } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  return (
    <Page
      title="Edit rule"
      backAction={{
        content: "Discount rules",
        onAction: () => navigate("/app/discount-rules"),
      }}
    >
      <DiscountRuleForm
        availableTags={availableTags}
        errors={actionData?.errors}
        submitLabel="Save"
        initialValues={values}
      />
    </Page>
  );
}
