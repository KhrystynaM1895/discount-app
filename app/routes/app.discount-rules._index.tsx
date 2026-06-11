import { useCallback, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  useSubmit,
} from "react-router";
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  EmptyState,
  Filters,
  IndexTable,
  InlineStack,
  Modal,
  Page,
  Pagination,
  Select,
  Text,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { listCustomerTags } from "../services/customerTags.server";
import {
  deleteRule,
  listRules,
  toggleStatus,
} from "../services/rules.server";
import { syncMetafield } from "../services/syncMetafield.server";
import { buildSearchParams } from "../utils/searchParams";

type SortField = "name" | "updated_at" | "status";
type SortDir = "asc" | "desc";

const SORT_FIELDS: SortField[] = ["name", "updated_at", "status"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const sp = url.searchParams;

  const pageParam = Number(sp.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const search = sp.get("search")?.trim() || undefined;

  const tagIdParam = Number(sp.get("tagId"));
  const tagId =
    Number.isInteger(tagIdParam) && tagIdParam > 0 ? tagIdParam : undefined;

  const sortFieldParam = sp.get("sortField");
  const sortField: SortField = SORT_FIELDS.includes(sortFieldParam as SortField)
    ? (sortFieldParam as SortField)
    : "updated_at";
  const sortDir: SortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";

  const [result, availableTags] = await Promise.all([
    listRules(session.shop, { page, search, tagId, sortField, sortDir }),
    listCustomerTags(session.shop),
  ]);

  return {
    rules: result.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      customerTagName: rule.customerTag?.name ?? null,
      discountType: rule.discount_type,
      discountValue: Number(rule.discount_value),
      status: rule.status,
      scopeType: rule.scope_type,
      scopeCount: rule._count.scope_items,
      updatedAt: rule.updated_at,
    })),
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    availableTags: availableTags.map((tag) => ({ id: tag.id, name: tag.name })),
    filters: { search: search ?? "", tagId: tagId ?? null, sortField, sortDir },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));
  const id = Number(formData.get("id"));

  if (intent === "delete") {
    await deleteRule(session.shop, id);
  } else if (intent === "toggle") {
    await toggleStatus(session.shop, id);
  }

  await syncMetafield(admin.graphql, session.shop);
  return { ok: true };
};

function formatDiscount(type: string, value: number): string {
  return type === "percentage" ? `${value}%` : `$${value.toFixed(2)}`;
}

function formatScope(scopeType: string, count: number): string {
  if (scopeType === "collection") {
    return `${count} ${count === 1 ? "collection" : "collections"}`;
  }
  if (scopeType === "product") {
    return `${count} ${count === 1 ? "product" : "products"}`;
  }
  return "All products";
}

// IndexTable column index → sort field (only sortable columns appear here).
const COLUMN_SORT_FIELD: Record<number, SortField> = {
  0: "name",
  4: "status",
  5: "updated_at",
};
const SORT_FIELD_COLUMN: Record<SortField, number> = {
  name: 0,
  status: 4,
  updated_at: 5,
};

export default function DiscountRulesIndex() {
  const { rules, page, totalPages, availableTags, filters } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const goWith = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      const query = buildSearchParams(searchParams, updates);
      navigate(query ? `?${query}` : "?", { replace: true });
    },
    [navigate, searchParams],
  );

  const handleToggle = (id: number) => {
    submit({ intent: "toggle", id }, { method: "post" });
  };

  const handleDelete = () => {
    if (deleteId !== null) {
      submit({ intent: "delete", id: deleteId }, { method: "post" });
    }
    setDeleteId(null);
  };

  const handleSort = (headingIndex: number, direction: "ascending" | "descending") => {
    const field = COLUMN_SORT_FIELD[headingIndex];
    if (!field) return;
    goWith({ sortField: field, sortDir: direction === "ascending" ? "asc" : "desc" });
  };

  const tagOptions = [
    { label: "All tags", value: "" },
    ...availableTags.map((tag) => ({ label: tag.name, value: String(tag.id) })),
  ];

  const appliedFilters = [];
  if (filters.tagId !== null) {
    const tagName =
      availableTags.find((tag) => tag.id === filters.tagId)?.name ??
      String(filters.tagId);
    appliedFilters.push({
      key: "tagId",
      label: `Customer tag: ${tagName}`,
      onRemove: () => goWith({ tagId: null }),
    });
  }

  const filterControl = (
    <Filters
      queryValue={filters.search}
      queryPlaceholder="Search by name"
      onQueryChange={(value) => goWith({ search: value })}
      onQueryClear={() => goWith({ search: null })}
      onClearAll={() => goWith({ search: null, tagId: null })}
      filters={[
        {
          key: "tagId",
          label: "Customer tag",
          shortcut: true,
          filter: (
            <Select
              label="Customer tag"
              labelHidden
              options={tagOptions}
              value={filters.tagId === null ? "" : String(filters.tagId)}
              onChange={(value) => goWith({ tagId: value || null })}
            />
          ),
        },
      ]}
      appliedFilters={appliedFilters}
    />
  );

  const rowMarkup = rules.map((rule, index) => (
    <IndexTable.Row id={String(rule.id)} key={rule.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {rule.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {rule.customerTagName ?? <Badge>No tag</Badge>}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {formatDiscount(rule.discountType, rule.discountValue)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {formatScope(rule.scopeType, rule.scopeCount)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={rule.status === "active" ? "success" : undefined}>
          {rule.status === "active" ? "Active" : "Inactive"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(rule.updatedAt).toLocaleDateString()}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <ButtonGroup>
            <Button
              onClick={() => navigate(`/app/discount-rules/${rule.id}`)}
            >
              Edit
            </Button>
            <Button onClick={() => handleToggle(rule.id)}>
              {rule.status === "active" ? "Deactivate" : "Activate"}
            </Button>
            <Button tone="critical" onClick={() => setDeleteId(rule.id)}>
              Delete
            </Button>
          </ButtonGroup>
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const hasActiveFilters = filters.search !== "" || filters.tagId !== null;

  return (
    <Page
      title="Discount rules"
      primaryAction={{
        content: "Create rule",
        onAction: () => navigate("/app/discount-rules/new"),
      }}
    >
      <Card padding="0">
        {rules.length === 0 && !hasActiveFilters ? (
          <EmptyState
            heading="Create your first discount rule"
            action={{
              content: "Create rule",
              onAction: () => navigate("/app/discount-rules/new"),
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Discount rules apply automatic discounts to customers with a
              matching tag.
            </p>
          </EmptyState>
        ) : (
          <>
            <Box padding="300">{filterControl}</Box>
            <IndexTable
              resourceName={{ singular: "rule", plural: "rules" }}
              itemCount={rules.length}
              selectable={false}
              sortable={[true, false, false, false, true, false, false]}
              sortColumnIndex={SORT_FIELD_COLUMN[filters.sortField]}
              sortDirection={filters.sortDir === "asc" ? "ascending" : "descending"}
              onSort={handleSort}
              emptyState="No rules match the current filters."
              headings={[
                { title: "Name" },
                { title: "Customer tag" },
                { title: "Discount" },
                { title: "Scope" },
                { title: "Status" },
                { title: "Last updated" },
                { title: "Actions" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          </>
        )}
      </Card>

      {totalPages > 1 && (
        <Box padding="400">
          <InlineStack align="center">
            <Pagination
              hasPrevious={page > 1}
              onPrevious={() => goWith({ page: page - 1 })}
              hasNext={page < totalPages}
              onNext={() => goWith({ page: page + 1 })}
              label={`Page ${page} of ${totalPages}`}
            />
          </InlineStack>
        </Box>
      )}

      <Modal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete discount rule"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setDeleteId(null) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This will permanently delete the discount rule. This action cannot
            be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
