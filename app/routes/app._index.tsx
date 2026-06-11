import { lazy, Suspense, useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Box,
  Text,
  InlineGrid,
  InlineStack,
  Icon,
  Spinner,
} from "@shopify/polaris";
import {
  DiscountIcon,
  CheckCircleIcon,
  PersonIcon,
  CartIcon,
} from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getDiscountStats } from "../services/stats.server";

// PolarisViz touches `window`, so it must never render on the server.
const DashboardCharts = lazy(() => import("../components/DashboardCharts"));

const DAYS = 30;

/** Normalize a raw `applied_at` day to a `YYYY-MM-DD` key. */
function toDateKey(value: string | Date): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const stats = await getDiscountStats(session.shop);

  // Fill missing days (gaps with 0 applications) so the line chart spans 30 days.
  const counts = new Map(
    stats.applicationsByDay.map((d) => [toDateKey(d.date), d.count]),
  );

  const applicationsByDayFilled: { date: string; count: number }[] = [];
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (DAYS - 1));

  for (let i = 0; i < DAYS; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    applicationsByDayFilled.push({ date: key, count: counts.get(key) ?? 0 });
  }

  return { stats, applicationsByDayFilled };
};

function StatCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: typeof DiscountIcon;
  tone?: "success";
}) {
  return (
    <Card>
      <Box padding="200">
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <Box>
            <Icon source={icon} tone={tone === "success" ? "success" : "base"} />
          </Box>
          <Box>
            <Text as="p" variant="heading2xl">
              {value}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {title}
            </Text>
          </Box>
        </InlineStack>
      </Box>
    </Card>
  );
}

/** Placeholder shown while charts load on the client. */
function ChartsFallback() {
  return (
    <Layout.Section>
      <Card>
        <Box minHeight="320px">
          <InlineStack align="center" blockAlign="center">
            <Spinner accessibilityLabel="Loading charts" size="large" />
          </InlineStack>
        </Box>
      </Card>
    </Layout.Section>
  );
}

export default function Dashboard() {
  const { stats, applicationsByDayFilled } = useLoaderData<typeof loader>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
            <StatCard
              title="Total rules"
              value={stats.totalRules}
              icon={DiscountIcon}
            />
            <StatCard
              title="Active rules"
              value={stats.activeRules}
              icon={CheckCircleIcon}
              tone={stats.activeRules > 0 ? "success" : undefined}
            />
            <StatCard
              title="Customers in database"
              value={stats.totalCustomers}
              icon={PersonIcon}
            />
            <StatCard
              title="Discounts applied (last 30 days)"
              value={stats.applicationsLast30Days}
              icon={CartIcon}
            />
          </InlineGrid>
        </Layout.Section>

        {mounted ? (
          <Suspense fallback={<ChartsFallback />}>
            <DashboardCharts
              applicationsByDayFilled={applicationsByDayFilled}
              applicationsByRule={stats.applicationsByRule}
              activeRules={stats.activeRules}
              totalRules={stats.totalRules}
            />
          </Suspense>
        ) : (
          <ChartsFallback />
        )}
      </Layout>
    </Page>
  );
}
