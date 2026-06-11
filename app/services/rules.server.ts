import { Prisma } from "@prisma/client";

import prisma from "../db.server";

export interface ScopeItemInput {
  shopifyGid: string;
  itemType: string;
  displayTitle?: string;
}

/** Raw, untrusted values as parsed from the submitted form. */
export interface RawRuleInput {
  name: string;
  customerTagId: string;
  discountType: string;
  discountValue: string;
  status: string;
  scopeType: string;
  scopeItems: ScopeItemInput[];
}

/** Validated, normalized values ready to persist. */
export interface RuleInput {
  name: string;
  customerTagId: number;
  discountType: string;
  discountValue: number;
  status: string;
  scopeType: string;
  scopeItems: ScopeItemInput[];
}

export interface RuleErrors {
  name?: string;
  customer_tag_id?: string;
  discount_value?: string;
  scope?: string;
}

const DISCOUNT_TYPES = ["percentage", "fixed_amount"];
const SCOPE_TYPES = ["all", "collection", "product"];
const STATUSES = ["active", "inactive"];

export function validateRuleInput(raw: RawRuleInput): {
  errors: RuleErrors;
  value: RuleInput | null;
} {
  const errors: RuleErrors = {};

  const name = raw.name.trim();
  if (!name) {
    errors.name = "Name is required";
  } else if (name.length > 100) {
    errors.name = "Name must be 100 characters or fewer";
  }

  const customerTagId = Number(raw.customerTagId);
  if (
    raw.customerTagId.trim() === "" ||
    !Number.isInteger(customerTagId) ||
    customerTagId <= 0
  ) {
    errors.customer_tag_id = "Customer tag is required";
  }

  const discountType = DISCOUNT_TYPES.includes(raw.discountType)
    ? raw.discountType
    : "percentage";

  const discountValue = Number(raw.discountValue);
  if (raw.discountValue.trim() === "" || Number.isNaN(discountValue)) {
    errors.discount_value = "Discount value is required";
  } else if (discountValue <= 0) {
    errors.discount_value = "Discount value must be greater than 0";
  } else if (discountType === "percentage" && discountValue > 100) {
    errors.discount_value = "Percentage cannot exceed 100";
  }

  const scopeType = SCOPE_TYPES.includes(raw.scopeType) ? raw.scopeType : "all";
  if (scopeType !== "all" && raw.scopeItems.length === 0) {
    errors.scope = "Select at least one item for this scope";
  }

  const status = STATUSES.includes(raw.status) ? raw.status : "active";

  if (Object.keys(errors).length > 0) {
    return { errors, value: null };
  }

  return {
    errors,
    value: {
      name,
      customerTagId,
      discountType,
      discountValue,
      status,
      scopeType,
      scopeItems: scopeType === "all" ? [] : raw.scopeItems,
    },
  };
}

/** Parses the submitted discount-rule form into raw (unvalidated) input. */
export function parseRuleForm(formData: FormData): RawRuleInput {
  const gids = formData.getAll("shopify_gid").map(String);
  const types = formData.getAll("item_type").map(String);
  const titles = formData.getAll("display_title").map(String);

  const scopeItems: ScopeItemInput[] = gids.map((gid, index) => ({
    shopifyGid: gid,
    itemType: types[index] ?? "",
    displayTitle: titles[index] ?? "",
  }));

  return {
    name: String(formData.get("name") ?? ""),
    customerTagId: String(formData.get("customer_tag_id") ?? ""),
    discountType: String(formData.get("discount_type") ?? ""),
    discountValue: String(formData.get("discount_value") ?? ""),
    status: String(formData.get("status") ?? ""),
    scopeType: String(formData.get("scope_type") ?? ""),
    scopeItems,
  };
}

/** Ensures the tag exists and belongs to the shop before persisting an FK. */
async function assertCustomerTagBelongsToShop(shop: string, customerTagId: number) {
  const tag = await prisma.customer_tag.findFirst({
    where: { id: customerTagId, shop },
    select: { id: true },
  });
  if (!tag) {
    throw new Response("Invalid customer tag", { status: 400 });
  }
}

const RULES_PAGE_SIZE = 20;

export interface ListRulesParams {
  page?: number;
  search?: string;
  tagId?: number;
  sortField?: "name" | "updated_at" | "status";
  sortDir?: "asc" | "desc";
}

export async function listRules(shop: string, params: ListRulesParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const sortField = params.sortField ?? "updated_at";
  const sortDir = params.sortDir ?? "desc";

  const where: Prisma.discount_ruleWhereInput = {
    shop,
    AND: [
      params.search
        ? { name: { contains: params.search, mode: "insensitive" } }
        : {},
      params.tagId ? { customer_tag_id: params.tagId } : {},
    ],
  };

  const [rules, total] = await prisma.$transaction([
    prisma.discount_rule.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      include: {
        _count: { select: { scope_items: true } },
        customerTag: { select: { id: true, name: true } },
      },
      skip: (page - 1) * RULES_PAGE_SIZE,
      take: RULES_PAGE_SIZE,
    }),
    prisma.discount_rule.count({ where }),
  ]);

  return {
    rules,
    total,
    page,
    pageSize: RULES_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / RULES_PAGE_SIZE)),
  };
}

export function getRule(shop: string, id: number) {
  return prisma.discount_rule.findFirst({
    where: { id, shop },
    include: {
      scope_items: true,
      customerTag: { select: { id: true, name: true } },
    },
  });
}

export async function createRule(shop: string, input: RuleInput) {
  await assertCustomerTagBelongsToShop(shop, input.customerTagId);

  return prisma.discount_rule.create({
    data: {
      shop,
      name: input.name,
      customer_tag_id: input.customerTagId,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      status: input.status,
      scope_type: input.scopeType,
      scope_items:
        input.scopeType === "all"
          ? undefined
          : {
              create: input.scopeItems.map((item) => ({
                shopify_gid: item.shopifyGid,
                item_type: item.itemType,
              })),
            },
    },
  });
}

export async function updateRule(shop: string, id: number, input: RuleInput) {
  await assertCustomerTagBelongsToShop(shop, input.customerTagId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.discount_rule.findFirst({ where: { id, shop } });
    if (!existing) {
      throw new Response("Not Found", { status: 404 });
    }

    await tx.discount_rule.update({
      where: { id },
      data: {
        name: input.name,
        customer_tag_id: input.customerTagId,
        discount_type: input.discountType,
        discount_value: input.discountValue,
        status: input.status,
        scope_type: input.scopeType,
      },
    });

    await tx.discount_rule_scope_item.deleteMany({
      where: { discount_rule_id: id },
    });

    if (input.scopeType !== "all" && input.scopeItems.length > 0) {
      await tx.discount_rule_scope_item.createMany({
        data: input.scopeItems.map((item) => ({
          discount_rule_id: id,
          shopify_gid: item.shopifyGid,
          item_type: item.itemType,
        })),
      });
    }
  });
}

export function deleteRule(shop: string, id: number) {
  return prisma.discount_rule.deleteMany({ where: { id, shop } });
}

export async function toggleStatus(shop: string, id: number) {
  const rule = await prisma.discount_rule.findFirst({ where: { id, shop } });
  if (!rule) {
    return;
  }
  await prisma.discount_rule.update({
    where: { id },
    data: { status: rule.status === "active" ? "inactive" : "active" },
  });
}
