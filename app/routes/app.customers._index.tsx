import { useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "react-router";
import {
  Badge,
  Box,
  Card,
  EmptyState,
  Filters,
  IndexTable,
  InlineStack,
  Page,
  Pagination,
  Select,
  Spinner,
  Text,
} from "@shopify/polaris";

import { listCustomerTags } from "../services/customerTags.server";
import { assignTag, listCustomers, syncCustomersFromShopify } from "../services/customers.server";
import { authenticate } from "../shopify.server";
import { buildSearchParams } from "../utils/searchParams";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  await syncCustomersFromShopify(admin.graphql, session.shop);

  const url = new URL(request.url);
  const sp = url.searchParams;

  const pageParam = Number(sp.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const search = sp.get("search")?.trim() || undefined;

  const tagIdParam = Number(sp.get("tagId"));
  const tagId =
    Number.isInteger(tagIdParam) && tagIdParam > 0 ? tagIdParam : undefined;

  const [result, availableTags] = await Promise.all([
    listCustomers(session.shop, { page, search, tagId }),
    listCustomerTags(session.shop),
  ]);

  return {
    customers: result.customers,
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    availableTags: availableTags.map((tag) => ({ id: tag.id, name: tag.name })),
    filters: { search: search ?? "", tagId: tagId ?? null },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent !== "assign_tag") {
    return data({ error: "Unknown intent" }, { status: 400 });
  }

  const customerId = Number(formData.get("customerId"));
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return data({ error: "customerId is required" }, { status: 400 });
  }

  const rawTagId = String(formData.get("customerTagId") ?? "");
  let customerTagId: number | null = null;
  if (rawTagId !== "") {
    const parsed = Number(rawTagId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return data({ error: "Invalid customer tag" }, { status: 400 });
    }
    customerTagId = parsed;
  }

  await assignTag(admin.graphql, customerId, session.shop, customerTagId);
  return { success: true };
};

interface CustomerRow {
  id: number;
  shopify_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  customer_tag_id: number | null;
  customerTag: { id: number; name: string } | null;
}

interface TagOption {
  id: number;
  name: string;
}

function formatName(first: string | null, last: string | null): string {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || "—";
}

function AssignTagCell({
  customer,
  availableTags,
}: {
  customer: CustomerRow;
  availableTags: TagOption[];
}) {
  const fetcher = useFetcher();
  const submitting = fetcher.state === "submitting";

  const options = [
    { label: "No tag", value: "" },
    ...availableTags.map((tag) => ({ label: tag.name, value: String(tag.id) })),
  ];

  if (submitting) {
    return <Spinner accessibilityLabel="Saving tag" size="small" />;
  }

  return (
    <Select
      label="Assign tag"
      labelHidden
      options={options}
      value={String(customer.customer_tag_id ?? "")}
      onChange={(value) =>
        fetcher.submit(
          {
            intent: "assign_tag",
            customerId: customer.id,
            customerTagId: value,
          },
          { method: "post" },
        )
      }
    />
  );
}

export default function Customers() {
  const { customers, page, totalPages, availableTags, filters } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const goWith = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      const query = buildSearchParams(searchParams, updates);
      navigate(query ? `?${query}` : "?", { replace: true });
    },
    [navigate, searchParams],
  );

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

  const hasActiveFilters = filters.search !== "" || filters.tagId !== null;

  const rowMarkup = customers.map((customer, index) => (
    <IndexTable.Row id={String(customer.id)} key={customer.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {formatName(customer.first_name, customer.last_name)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{customer.email ?? "—"}</IndexTable.Cell>
      <IndexTable.Cell>
        {customer.customerTag ? (
          <Badge tone="success">{customer.customerTag.name}</Badge>
        ) : (
          <Badge tone="info">No tag</Badge>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <AssignTagCell customer={customer} availableTags={availableTags} />
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page title="Customers">
      <Card padding="0">
        {customers.length === 0 && !hasActiveFilters ? (
          <EmptyState
            heading="No customers yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Customers appear here automatically when created or updated in
              your store.
            </p>
          </EmptyState>
        ) : (
          <>
            <Box padding="300">{filterControl}</Box>
            <IndexTable
              resourceName={{ singular: "customer", plural: "customers" }}
              itemCount={customers.length}
              selectable={false}
              emptyState="No customers match the current filters."
              headings={[
                { title: "Name" },
                { title: "Email" },
                { title: "Current tag" },
                { title: "Assign tag" },
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
    </Page>
  );
}
