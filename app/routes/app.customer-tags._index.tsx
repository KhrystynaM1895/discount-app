import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit } from "react-router";
import {
  Button,
  ButtonGroup,
  Card,
  EmptyState,
  IndexTable,
  Modal,
  Page,
  Text,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import {
  deleteCustomerTag,
  listCustomerTags,
} from "../services/customerTags.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tags = await listCustomerTags(session.shop);

  return { tags };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));
  const id = Number(formData.get("id"));

  if (intent === "delete") {
    await deleteCustomerTag(id, session.shop);
  }

  return { success: true };
};

export default function CustomerTagsIndex() {
  const { tags } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleDelete = () => {
    if (deleteId !== null) {
      submit({ intent: "delete", id: deleteId }, { method: "post" });
    }
    setDeleteId(null);
  };

  const rowMarkup = tags.map((tag, index) => (
    <IndexTable.Row id={String(tag.id)} key={tag.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {tag.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(tag.created_at).toLocaleDateString()}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <ButtonGroup>
            <Button onClick={() => navigate(`/app/customer-tags/${tag.id}`)}>
              Edit
            </Button>
            <Button tone="critical" onClick={() => setDeleteId(tag.id)}>
              Delete
            </Button>
          </ButtonGroup>
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Customer tags"
      primaryAction={{
        content: "Create tag",
        onAction: () => navigate("/app/customer-tags/new"),
      }}
    >
      <Card padding="0">
        {tags.length === 0 ? (
          <EmptyState
            heading="No tags yet"
            action={{
              content: "Create tag",
              onAction: () => navigate("/app/customer-tags/new"),
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Create tags to assign to customers and link them to discount
              rules.
            </p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "tag", plural: "tags" }}
            itemCount={tags.length}
            selectable={false}
            headings={[
              { title: "Name" },
              { title: "Created" },
              { title: "Actions" },
            ]}
          >
            {rowMarkup}
          </IndexTable>
        )}
      </Card>

      <Modal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete tag"
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
            This will permanently delete the tag. This action cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
