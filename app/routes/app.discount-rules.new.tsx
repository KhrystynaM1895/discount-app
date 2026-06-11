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
  createRule,
  parseRuleForm,
  validateRuleInput,
} from "../services/rules.server";
import { syncMetafield } from "../services/syncMetafield.server";
import { ensureAutomaticDiscount } from "../services/discountActivation.server";
import { DiscountRuleForm } from "../components/DiscountRuleForm";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { availableTags: await listCustomerTags(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const { errors, value } = validateRuleInput(parseRuleForm(formData));
  if (!value) {
    return data({ errors }, { status: 400 });
  }

  await createRule(session.shop, value);
  await syncMetafield(admin.graphql, session.shop);
  // Activate the discount Function (idempotent) so rules apply at checkout.
  await ensureAutomaticDiscount(admin.graphql, session.shop);
  return redirect("/app/discount-rules");
};

export default function NewDiscountRule() {
  const { availableTags } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  return (
    <Page
      title="Create rule"
      backAction={{
        content: "Discount rules",
        onAction: () => navigate("/app/discount-rules"),
      }}
    >
      <DiscountRuleForm
        availableTags={availableTags}
        errors={actionData?.errors}
        submitLabel="Save"
        initialValues={{
          name: "",
          customerTagId: null,
          discountType: "percentage",
          discountValue: "",
          status: "active",
          scopeType: "all",
          scopeItems: [],
        }}
      />
    </Page>
  );
}
