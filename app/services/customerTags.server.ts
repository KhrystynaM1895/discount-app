import { Prisma } from "@prisma/client";

import prisma from "../db.server";

export interface TagValidationError {
  field: "name";
  message: string;
}

export function isTagValidationError(
  error: unknown,
): error is TagValidationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "field" in error &&
    "message" in error
  );
}

const NAME_PATTERN = /^[a-zA-Z0-9-]+$/;

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw { field: "name", message: "Name is required" } as TagValidationError;
  }
  if (trimmed.length > 50) {
    throw {
      field: "name",
      message: "Name must be 50 characters or fewer",
    } as TagValidationError;
  }
  if (!NAME_PATTERN.test(trimmed)) {
    throw {
      field: "name",
      message: "Only letters, numbers and hyphens are allowed — no spaces",
    } as TagValidationError;
  }
  return trimmed;
}

const DUPLICATE_ERROR: TagValidationError = {
  field: "name",
  message: "Tag already exists",
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function listCustomerTags(shop: string) {
  return prisma.customer_tag.findMany({
    where: { shop },
    orderBy: { name: "asc" },
    select: { id: true, name: true, created_at: true, updated_at: true },
  });
}

export async function getCustomerTag(id: number, shop: string) {
  const tag = await prisma.customer_tag.findFirst({ where: { id, shop } });
  if (!tag) {
    throw new Response("Not Found", { status: 404 });
  }
  return tag;
}

export async function createCustomerTag(shop: string, name: string) {
  const validName = validateName(name);

  const existing = await prisma.customer_tag.findFirst({
    where: { shop, name: validName },
  });
  if (existing) {
    throw DUPLICATE_ERROR;
  }

  try {
    return await prisma.customer_tag.create({
      data: { shop, name: validName },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw DUPLICATE_ERROR;
    }
    throw error;
  }
}

export async function updateCustomerTag(id: number, shop: string, name: string) {
  const validName = validateName(name);

  const tag = await prisma.customer_tag.findFirst({ where: { id, shop } });
  if (!tag) {
    throw new Response("Not Found", { status: 404 });
  }

  const duplicate = await prisma.customer_tag.findFirst({
    where: { shop, name: validName, id: { not: id } },
  });
  if (duplicate) {
    throw DUPLICATE_ERROR;
  }

  try {
    return await prisma.customer_tag.update({
      where: { id },
      data: { name: validName },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw DUPLICATE_ERROR;
    }
    throw error;
  }
}

export function deleteCustomerTag(id: number, shop: string) {
  return prisma.customer_tag.deleteMany({ where: { id, shop } });
}
