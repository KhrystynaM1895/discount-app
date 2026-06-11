import { useState } from "react";
import type { ActionFunctionArgs } from "react-router";
import {
  data,
  redirect,
  useActionData,
  useNavigate,
  useSubmit,
} from "react-router";
import { Card, FormLayout, Page, PageActions, TextField } from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import {
  createCustomerTag,
  isTagValidationError,
} from "../services/customerTags.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();

  try {
    await createCustomerTag(session.shop, name);
  } catch (error) {
    if (isTagValidationError(error)) {
      return data({ errors: { name: error.message } }, { status: 400 });
    }
    throw error;
  }

  return redirect("/app/customer-tags");
};

export default function NewCustomerTag() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [name, setName] = useState("");

  const handleSubmit = () => {
    submit({ name }, { method: "post" });
  };

  return (
    <Page
      title="Create tag"
      backAction={{
        content: "Customer tags",
        onAction: () => navigate("/app/customer-tags"),
      }}
    >
      <Card>
        <FormLayout>
          <TextField
            label="Name"
            name="name"
            value={name}
            onChange={setName}
            requiredIndicator
            autoComplete="off"
            helpText="No spaces. Letters, numbers and hyphens only. e.g. VIP, wholesale-2024"
            error={actionData?.errors?.name}
          />
        </FormLayout>
      </Card>
      <PageActions
        primaryAction={{ content: "Save", onAction: handleSubmit }}
        secondaryActions={[
          {
            content: "Discard",
            onAction: () => navigate("/app/customer-tags"),
          },
        ]}
      />
    </Page>
  );
}
