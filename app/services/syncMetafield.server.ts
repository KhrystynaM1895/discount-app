import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

/**
 * Serializes all *active* discount rules for a shop into the
 * `discount_app.rules` shop metafield (type json), which Shopify Functions read.
 * Must be called after every discount_rule mutation.
 */
export async function syncMetafield(
  graphql: AdminGraphqlClient,
  shop: string,
): Promise<void> {
  const rules = await prisma.discount_rule.findMany({
    where: { shop, status: "active" },
    include: { customerTag: true, scope_items: true },
  });

  const activeRules = [];
  for (const rule of rules) {
    const scopeItems = rule.scope_items.map((item) => ({
      shopifyGid: item.shopify_gid,
      itemType: item.item_type,
    }));

    // Functions can't resolve collection membership for our dynamic data, so we
    // flatten each collection to its product GIDs here. `productGids` is the
    // effective product allow-list the Function matches cart lines against for
    // both "product" and "collection" scope.
    // NOTE: this is a snapshot at sync time — products added to a collection
    // later won't be discounted until the next rule mutation re-runs this sync.
    let productGids: string[] = [];
    if (rule.scope_type === "product") {
      productGids = scopeItems
        .filter((item) => item.itemType === "product")
        .map((item) => item.shopifyGid);
    } else if (rule.scope_type === "collection") {
      const collectionGids = scopeItems
        .filter((item) => item.itemType === "collection")
        .map((item) => item.shopifyGid);
      const gidLists = await Promise.all(
        collectionGids.map((gid) => fetchCollectionProductGids(graphql, gid)),
      );
      productGids = [...new Set(gidLists.flat())];
    }

    activeRules.push({
      name: rule.name,
      customerTag: rule.customerTag?.name ?? "",
      discountType: rule.discount_type,
      discountValue: Number(rule.discount_value),
      scopeType: rule.scope_type,
      scopeItems,
      productGids,
    });
  }

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
    throw new Error("Unable to resolve shop id for metafield sync");
  }

  const response = await graphql(
    `#graphql
    mutation SetDiscountRules($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
        }
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
            namespace: "discount_app",
            key: "rules",
            type: "json",
            value: JSON.stringify(activeRules),
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
    throw new Error(`metafieldsSet failed: ${JSON.stringify(userErrors)}`);
  }
}

/** All product GIDs belonging to a collection, following pagination. */
async function fetchCollectionProductGids(
  graphql: AdminGraphqlClient,
  collectionGid: string,
): Promise<string[]> {
  const productGids: string[] = [];
  let after: string | null = null;

  for (;;) {
    const response = await graphql(
      `#graphql
      query CollectionProducts($id: ID!, $after: String) {
        collection(id: $id) {
          products(first: 250, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
            }
          }
        }
      }`,
      { variables: { id: collectionGid, after } },
    );

    const json = (await response.json()) as {
      data?: {
        collection?: {
          products: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: { id: string }[];
          };
        } | null;
      };
    };

    const products = json.data?.collection?.products;
    if (!products) {
      break;
    }
    productGids.push(...products.nodes.map((node) => node.id));

    if (!products.pageInfo.hasNextPage) {
      break;
    }
    after = products.pageInfo.endCursor;
  }

  return productGids;
}
