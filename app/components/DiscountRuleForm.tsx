import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Layout,
  Link,
  PageActions,
  RadioButton,
  ResourceItem,
  ResourceList,
  Select,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";

export interface ScopeItem {
  shopifyGid: string;
  itemType: string;
  displayTitle: string;
  imageUrl?: string;
}

export interface CustomerTagOption {
  id: number;
  name: string;
}

export interface DiscountRuleFormValues {
  name: string;
  customerTagId: number | null;
  discountType: string;
  discountValue: string;
  status: string;
  scopeType: string;
  scopeItems: ScopeItem[];
}

export interface DiscountRuleFormErrors {
  name?: string;
  customer_tag_id?: string;
  discount_value?: string;
  scope?: string;
}

interface DiscountRuleFormProps {
  initialValues: DiscountRuleFormValues;
  availableTags: CustomerTagOption[];
  errors?: DiscountRuleFormErrors;
  submitLabel: string;
}

export function DiscountRuleForm({
  initialValues,
  availableTags,
  errors,
  submitLabel,
}: DiscountRuleFormProps) {
  const navigate = useNavigate();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [name, setName] = useState(initialValues.name);
  const [customerTagId, setCustomerTagId] = useState<number | null>(
    initialValues.customerTagId,
  );
  const [discountType, setDiscountType] = useState(initialValues.discountType);
  const [discountValue, setDiscountValue] = useState(
    initialValues.discountValue,
  );
  const [status, setStatus] = useState(initialValues.status);
  const [scopeType, setScopeType] = useState(initialValues.scopeType);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>(
    initialValues.scopeItems,
  );

  const tagSelectOptions = useMemo(
    () => [
      { label: "Select a customer tag", value: "" },
      ...availableTags.map((tag) => ({ label: tag.name, value: String(tag.id) })),
    ],
    [availableTags],
  );

  const handleCustomerTagChange = useCallback((value: string) => {
    const parsed =
      value !== "" && Number.isInteger(Number(value)) ? Number(value) : null;
    setCustomerTagId(parsed);
  }, []);

  // --- Scope resource picker ---
  const handleScopeChange = useCallback((value: string) => {
    setScopeType(value);
    setScopeItems([]);
  }, []);

  const handleBrowse = useCallback(async () => {
    const type: "collection" | "product" =
      scopeType === "collection" ? "collection" : "product";

    const selection = await shopify.resourcePicker({
      type,
      multiple: true,
      selectionIds: scopeItems.map((item) => ({ id: item.shopifyGid })),
    });

    if (!selection) {
      return;
    }

    setScopeItems(
      selection.map((resource) => ({
        shopifyGid: resource.id,
        itemType: type,
        displayTitle: resource.title,
        imageUrl:
          "images" in resource
            ? resource.images[0]?.originalSrc
            : (resource.image?.originalSrc ?? undefined),
      })),
    );
  }, [scopeType, scopeItems, shopify]);

  const removeScopeItem = useCallback((gid: string) => {
    setScopeItems((prev) => prev.filter((item) => item.shopifyGid !== gid));
  }, []);

  // --- Submit ---
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.set("name", name);
    formData.set("customer_tag_id", String(customerTagId ?? ""));
    formData.set("discount_type", discountType);
    formData.set("discount_value", discountValue);
    formData.set("status", status);
    formData.set("scope_type", scopeType);
    scopeItems.forEach((item) => {
      formData.append("shopify_gid", item.shopifyGid);
      formData.append("item_type", item.itemType);
      formData.append("display_title", item.displayTitle);
    });
    submit(formData, { method: "post" });
  }, [
    name,
    customerTagId,
    discountType,
    discountValue,
    status,
    scopeType,
    scopeItems,
    submit,
  ]);

  const showScopePicker = scopeType === "collection" || scopeType === "product";

  return (
    <>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Rule details
              </Text>
              <FormLayout>
                <TextField
                  label="Name"
                  value={name}
                  onChange={setName}
                  error={errors?.name}
                  autoComplete="off"
                  requiredIndicator
                />
                {availableTags.length === 0 ? (
                  <Banner tone="warning" title="No customer tags found">
                    <p>
                      <Link url="/app/customer-tags/new">
                        Create a customer tag first
                      </Link>{" "}
                      before adding a discount rule.
                    </p>
                  </Banner>
                ) : (
                  <Select
                    label="Customer tag"
                    options={tagSelectOptions}
                    value={String(customerTagId ?? "")}
                    onChange={handleCustomerTagChange}
                    helpText="Assign a tag group to this rule. Manage tags under Customer tags."
                    error={errors?.customer_tag_id}
                    requiredIndicator
                  />
                )}
                <Select
                  label="Discount type"
                  options={[
                    { label: "Percentage", value: "percentage" },
                    { label: "Fixed amount", value: "fixed_amount" },
                  ]}
                  value={discountType}
                  onChange={setDiscountType}
                />
                <TextField
                  label={
                    discountType === "percentage" ? "Percentage (%)" : "Amount"
                  }
                  type="number"
                  min={0}
                  value={discountValue}
                  onChange={setDiscountValue}
                  error={errors?.discount_value}
                  autoComplete="off"
                  requiredIndicator
                />
                <Select
                  label="Status"
                  options={[
                    { label: "Active", value: "active" },
                    { label: "Inactive", value: "inactive" },
                  ]}
                  value={status}
                  onChange={setStatus}
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Scope
              </Text>
              <BlockStack gap="200">
                <RadioButton
                  label="All products"
                  id="scope-all"
                  name="scope-type"
                  checked={scopeType === "all"}
                  onChange={() => handleScopeChange("all")}
                />
                <RadioButton
                  label="Specific collections"
                  id="scope-collection"
                  name="scope-type"
                  checked={scopeType === "collection"}
                  onChange={() => handleScopeChange("collection")}
                />
                <RadioButton
                  label="Specific products"
                  id="scope-product"
                  name="scope-type"
                  checked={scopeType === "product"}
                  onChange={() => handleScopeChange("product")}
                />
              </BlockStack>

              {showScopePicker && (
                <BlockStack gap="300">
                  <InlineStack>
                    <Button onClick={handleBrowse}>Browse</Button>
                  </InlineStack>
                  {errors?.scope && (
                    <Text as="span" tone="critical">
                      {errors.scope}
                    </Text>
                  )}
                  {scopeItems.length > 0 && (
                    <ResourceList
                      resourceName={{ singular: "item", plural: "items" }}
                      items={scopeItems}
                      renderItem={(item) => (
                        <ResourceItem
                          id={item.shopifyGid}
                          onClick={() => {}}
                          media={
                            item.imageUrl ? (
                              <Thumbnail
                                size="small"
                                source={item.imageUrl}
                                alt={item.displayTitle}
                              />
                            ) : undefined
                          }
                        >
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <Text as="span" variant="bodyMd">
                              {item.displayTitle}
                            </Text>
                            <Button
                              variant="plain"
                              tone="critical"
                              onClick={() => removeScopeItem(item.shopifyGid)}
                            >
                              Remove
                            </Button>
                          </InlineStack>
                        </ResourceItem>
                      )}
                    />
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <PageActions
        primaryAction={{ content: submitLabel, onAction: handleSubmit }}
        secondaryActions={[
          {
            content: "Discard",
            onAction: () => navigate("/app/discount-rules"),
          },
        ]}
      />
    </>
  );
}
