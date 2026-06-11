import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import { Prisma } from "@prisma/client";

import prisma from "../db.server";

export interface CustomerWebhookPayload {
  id: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

/** Upsert a customer from a Shopify customers/create or customers/update webhook. */
export async function upsertCustomerFromWebhook(
  shop: string,
  payload: CustomerWebhookPayload,
) {
  const shopify_id = String(payload.id);
  return prisma.customer.upsert({
    where: { shop_shopify_id: { shop, shopify_id } },
    update: {
      email: payload.email ?? null,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
    },
    create: {
      shop,
      shopify_id,
      email: payload.email ?? null,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
    },
  });
}

const CUSTOMERS_SYNC_QUERY = `#graphql
  query CustomersSync($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          email
          firstName
          lastName
        }
      }
    }
  }
`;

export interface CustomerSyncResult {
  synced: number;
  protectedDataBlocked: boolean;
  errorMessages: string[];
}

/** Pull customers from Shopify Admin API into the local DB (webhook alternative). */
export async function syncCustomersFromShopify(
  graphql: AdminGraphqlClient,
  shop: string,
): Promise<CustomerSyncResult> {
  let synced = 0;
  let after: string | null = null;
  const errorMessages: string[] = [];

  for (;;) {
    const response = await graphql(CUSTOMERS_SYNC_QUERY, {
      variables: { first: 50, after },
    });
    const json = (await response.json()) as {
      data?: {
        customers?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          edges: Array<{
            node: {
              id: string;
              email: string | null;
              firstName: string | null;
              lastName: string | null;
            };
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      errorMessages.push(...json.errors.map((e) => e.message));
      break;
    }

    const customers = json.data?.customers;
    if (!customers) {
      break;
    }

    for (const { node } of customers.edges) {
      const shopify_id = node.id.replace("gid://shopify/Customer/", "");
      await prisma.customer.upsert({
        where: { shop_shopify_id: { shop, shopify_id } },
        update: {
          email: node.email ?? null,
          first_name: node.firstName ?? null,
          last_name: node.lastName ?? null,
        },
        create: {
          shop,
          shopify_id,
          email: node.email ?? null,
          first_name: node.firstName ?? null,
          last_name: node.lastName ?? null,
        },
      });
      synced += 1;
    }

    if (!customers.pageInfo.hasNextPage) {
      break;
    }
    after = customers.pageInfo.endCursor;
  }

  return {
    synced,
    protectedDataBlocked: errorMessages.some((m) => m.includes("not approved")),
    errorMessages,
  };
}

const CUSTOMERS_PAGE_SIZE = 20;

export interface ListCustomersParams {
  page?: number;
  search?: string;
  tagId?: number;
}

/** Paginated, filtered customers for a shop, for the customers list page. */
export async function listCustomers(
  shop: string,
  params: ListCustomersParams = {},
) {
  const page = Math.max(1, params.page ?? 1);

  const where: Prisma.customerWhereInput = {
    shop,
    AND: [
      params.search
        ? {
            OR: [
              { first_name: { contains: params.search, mode: "insensitive" } },
              { last_name: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {},
      params.tagId ? { customer_tag_id: params.tagId } : {},
    ],
  };

  const [customers, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      select: {
        id: true,
        shopify_id: true,
        email: true,
        first_name: true,
        last_name: true,
        customer_tag_id: true,
        customerTag: { select: { id: true, name: true } },
      },
      skip: (page - 1) * CUSTOMERS_PAGE_SIZE,
      take: CUSTOMERS_PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    customers,
    total,
    page,
    pageSize: CUSTOMERS_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)),
  };
}

/**
 * Assigns (or clears) the customer_tag for a customer, then mirrors the tag
 * onto the customer's `discount_app.tags` metafield (JSON array of tag names)
 * so the checkout Shopify Function can read it. Pass `customerTagId: null` to
 * remove the tag (writes an empty array).
 */
export async function assignTag(
  graphql: AdminGraphqlClient,
  customerId: number,
  shop: string,
  customerTagId: number | null,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shop },
    select: { id: true, shopify_id: true },
  });
  if (!customer) {
    throw new Response("Not Found", { status: 404 });
  }

  let tagName: string | null = null;
  if (customerTagId !== null) {
    const tag = await prisma.customer_tag.findFirst({
      where: { id: customerTagId, shop },
      select: { id: true, name: true },
    });
    if (!tag) {
      throw new Response("Invalid customer tag", { status: 400 });
    }
    tagName = tag.name;
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { customer_tag_id: customerTagId },
  });

  await syncCustomerTagsMetafield(graphql, customer.shopify_id, tagName);
}

/**
 * Writes the customer's tag name(s) to the `discount_app.tags` metafield as a
 * JSON array. Stored as an array (0 or 1 element today) so the Function can do
 * a simple `includes()` and the shape survives a future many-tags model.
 */
async function syncCustomerTagsMetafield(
  graphql: AdminGraphqlClient,
  shopifyId: string,
  tagName: string | null,
): Promise<void> {
  const response = await graphql(
    `#graphql
    mutation SetCustomerTags($metafields: [MetafieldsSetInput!]!) {
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
            ownerId: `gid://shopify/Customer/${shopifyId}`,
            namespace: "discount_app",
            key: "tags",
            type: "json",
            value: JSON.stringify(tagName ? [tagName] : []),
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
      `customer metafieldsSet failed: ${JSON.stringify(userErrors)}`,
    );
  }
}
