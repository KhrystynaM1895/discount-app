import { Card, Box, Text, Layout, EmptyState } from "@shopify/polaris";
import {
  PolarisVizProvider,
  LineChart,
  BarChart,
  DonutChart,
} from "@shopify/polaris-viz";
import "@shopify/polaris-viz/build/esm/styles.css";

type Props = {
  applicationsByDayFilled: { date: string; count: number }[];
  applicationsByRule: { rule_name: string | null; count: number }[];
  activeRules: number;
  totalRules: number;
};

function ChartCard({
  title,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  isEmpty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <Box paddingBlockEnd="300">
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
      </Box>
      {isEmpty ? (
        <EmptyState heading={emptyMessage} image="">
          <p />
        </EmptyState>
      ) : (
        // PolarisViz charts fill their parent — give them an explicit height.
        <PolarisVizProvider>
          <div style={{ height: 320 }}>{children}</div>
        </PolarisVizProvider>
      )}
    </Card>
  );
}

export default function DashboardCharts({
  applicationsByDayFilled,
  applicationsByRule,
  activeRules,
  totalRules,
}: Props) {
  const lineData = [
    {
      name: "Applications",
      data: applicationsByDayFilled.map((d) => ({
        key: d.date,
        value: d.count,
      })),
    },
  ];

  const barData = [
    {
      name: "Applications",
      data: applicationsByRule.map((d) => ({
        key: d.rule_name ?? "Unknown",
        value: d.count,
      })),
    },
  ];

  const donutData = [
    { name: "Active", data: [{ key: "Active", value: activeRules }] },
    {
      name: "Inactive",
      data: [{ key: "Inactive", value: totalRules - activeRules }],
    },
  ];

  const lineIsEmpty = applicationsByDayFilled.every((d) => d.count === 0);

  return (
    <>
      <Layout.Section>
        <ChartCard
          title="Discount applications — last 30 days"
          isEmpty={lineIsEmpty}
          emptyMessage="No discount applications in the last 30 days."
        >
          <LineChart data={lineData} />
        </ChartCard>
      </Layout.Section>

      <Layout.Section variant="oneHalf">
        <ChartCard
          title="Applications by rule — last 30 days"
          isEmpty={applicationsByRule.length === 0}
          emptyMessage="No data yet."
        >
          <BarChart data={barData} />
        </ChartCard>
      </Layout.Section>

      <Layout.Section variant="oneHalf">
        <ChartCard
          title="Rules by status"
          isEmpty={totalRules === 0}
          emptyMessage="No rules created yet."
        >
          <DonutChart data={donutData} />
        </ChartCard>
      </Layout.Section>
    </>
  );
}
