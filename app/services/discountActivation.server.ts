import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";

/**
 * The handle of the discount Shopify Function (see
 * `extensions/customer-tag-discount/shopify.extension.toml`). A Function does
 * nothing until a Discount references it — this single automatic app discount
 * activates the Function for every rule in the `discount_app.rules` metafield.
 */
const FUNCTION_HANDLE = "customer-tag-discount";

/** Shop metafield where we record the created discount's id (idempotency guard). */
const FLAG_NAMESPACE = "discount_app";
const FLAG_KEY = "automatic_discount_id";

/**
 * Ensures exactly one automatic app discount exists for the customer-tag
 * Function. Idempotent: stores the created discount id in a shop metafield and
 * returns early on subsequent calls. Requires the Function to be deployed
 * (`shopify app deploy`) so its handle resolves, and the `write_discounts` scope.
 */
export async function ensureAutomaticDiscount(
  graphql: AdminGraphqlClient,
  shop: string,
): Promise<void> {
  const existing = await readActivationFlag(graphql);
  if (existing) {
    return;
  }

  const response = await graphql(
    `#graphql
    mutation CreateCustomerTagDiscount($handle: String!, $startsAt: DateTime!) {
      discountAutomaticAppCreate(
        automaticAppDiscount: {
          title: "Customer Tag Discounts"
          functionHandle: $handle
          startsAt: $startsAt
          discountClasses: [PRODUCT]
          combinesWith: {
            orderDiscounts: true
            productDiscounts: true
            shippingDiscounts: true
          }
        }
      ) {
        automaticAppDiscount {
          discountId
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        handle: FUNCTION_HANDLE,
        startsAt: new Date().toISOString(),
      },
    },
  );

  const json = (await response.json()) as {
    data?: {
      discountAutomaticAppCreate?: {
        automaticAppDiscount: { discountId: string } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    };
  };

  const result = json.data?.discountAutomaticAppCreate;
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `discountAutomaticAppCreate failed: ${JSON.stringify(userErrors)}`,
    );
  }

  const discountId = result?.automaticAppDiscount?.discountId;
  if (!discountId) {
    throw new Error("discountAutomaticAppCreate returned no discountId");
  }

  await writeActivationFlag(graphql, shop, discountId);
}

async function readActivationFlag(
  graphql: AdminGraphqlClient,
): Promise<string | null> {
  const response = await graphql(
    `#graphql
    query DiscountActivationFlag($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) {
          value
        }
      }
    }`,
    { variables: { namespace: FLAG_NAMESPACE, key: FLAG_KEY } },
  );

  const json = (await response.json()) as {
    data?: { shop?: { metafield?: { value: string } | null } };
  };
  return json.data?.shop?.metafield?.value ?? null;
}

async function writeActivationFlag(
  graphql: AdminGraphqlClient,
  shop: string,
  discountId: string,
): Promise<void> {
  const shopResponse = await graphql(`#graphql
    query ShopId {
      shop {
        id
      }
    }`);
  const shopJson = (await shopResponse.json()) as {
    data?: { shop?: { id: string } };
  };
  const ownerId = shopJson.data?.shop?.id;
  if (!ownerId) {
    throw new Error("Unable to resolve shop id for activation flag");
  }

  const response = await graphql(
    `#graphql
    mutation SetActivationFlag($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: FLAG_NAMESPACE,
            key: FLAG_KEY,
            type: "single_line_text_field",
            value: discountId,
          },
        ],
      },
    },
  );

  const json = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        userErrors: { field: string[] | null; message: string }[];
      };
    };
  };
  const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `activation flag metafieldsSet failed: ${JSON.stringify(userErrors)}`,
    );
  }
}
