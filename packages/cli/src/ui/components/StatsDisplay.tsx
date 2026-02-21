/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { ThemedGradient } from './ThemedGradient.js';
import { theme } from '../semantic-colors.js';
import { formatDuration } from '../utils/formatters.js';
import type { ModelMetrics } from '../contexts/SessionContext.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
  CACHE_EFFICIENCY_HIGH,
  CACHE_EFFICIENCY_MEDIUM,
} from '../utils/displayUtils.js';
import { computeSessionStats } from '../utils/computeStats.js';
import {
  type RetrieveUserQuotaResponse,
  type ProviderQuota,
  PROVIDER_MODEL_REGISTRY,
  parseCompositeKey,
  groupModelsByProvider,
  estimateCost,
  formatCostString,
} from '@didim365/agent-cli-core';

// A more flexible and powerful StatRow component
interface StatRowProps {
  title: string;
  children: React.ReactNode; // Use children to allow for complex, colored values
}

const StatRow: React.FC<StatRowProps> = ({ title, children }) => (
  <Box>
    {/* Fixed width for the label creates a clean "gutter" for alignment */}
    <Box width={28}>
      <Text color={theme.text.link}>{title}</Text>
    </Box>
    {children}
  </Box>
);

// A SubStatRow for indented, secondary information
interface SubStatRowProps {
  title: string;
  children: React.ReactNode;
}

const SubStatRow: React.FC<SubStatRowProps> = ({ title, children }) => (
  <Box paddingLeft={2}>
    {/* Adjust width for the "» " prefix */}
    <Box width={26}>
      <Text color={theme.text.secondary}>» {title}</Text>
    </Box>
    {children}
  </Box>
);

// A Section component to group related stats
interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      {title}
    </Text>
    {children}
  </Box>
);

// Registered Gemini model IDs for quota-only row allowlist
const GEMINI_MODEL_ALLOWLIST = new Set(
  PROVIDER_MODEL_REGISTRY['gemini']?.models.map((m) => m.id) ?? [],
);

// Logic for building the unified list of table rows
const buildModelRows = (
  models: Record<string, ModelMetrics>,
  quotas?: RetrieveUserQuotaResponse,
) => {
  const providers = new Set(
    Object.keys(models).map((key) => parseCompositeKey(key).provider),
  );
  const hasMultipleProviders = providers.size > 1;

  const getModelId = (compositeKey: string) =>
    parseCompositeKey(compositeKey).model.replace('-001', '');

  const getDisplayName = (compositeKey: string) => {
    const { provider, model } = parseCompositeKey(compositeKey);
    const baseName = model.replace('-001', '');
    return hasMultipleProviders ? `${baseName} (${provider})` : baseName;
  };

  // For quota-only: only consider Gemini provider models as "used"
  const usedGeminiModelIds = new Set(
    Object.keys(models)
      .filter((key) => parseCompositeKey(key).provider === 'gemini')
      .map(getModelId),
  );

  const makeActiveRow = (name: string, metrics: ModelMetrics) => {
    const modelId = getModelId(name);
    return {
      key: name,
      modelName: getDisplayName(name),
      requests: metrics.api.totalRequests as number | string,
      cachedTokens: metrics.tokens.cached.toLocaleString(),
      inputTokens: metrics.tokens.input.toLocaleString(),
      outputTokens: metrics.tokens.candidates.toLocaleString(),
      bucket: quotas?.buckets?.find((b) => b.modelId === modelId),
      isActive: true,
      isSubtotal: false,
    };
  };

  // 1. Group models by provider and build rows with optional subtotals
  const providerGroups = groupModelsByProvider(models);
  const activeRows: Array<ReturnType<typeof makeActiveRow>> = [];

  for (const [provider, entries] of Object.entries(providerGroups)) {
    const providerRows = entries.map(([name, metrics]) =>
      makeActiveRow(name, metrics),
    );
    activeRows.push(...providerRows);

    // Add subtotal row when multi-provider and provider has 2+ models
    if (hasMultipleProviders && entries.length >= 2) {
      const subtotalReqs = entries.reduce(
        (s, [, m]) => s + m.api.totalRequests,
        0,
      );
      activeRows.push({
        key: `subtotal::${provider}`,
        modelName: `${provider} Subtotal`,
        requests: subtotalReqs,
        cachedTokens: entries
          .reduce((s, [, m]) => s + m.tokens.cached, 0)
          .toLocaleString(),
        inputTokens: entries
          .reduce((s, [, m]) => s + m.tokens.input, 0)
          .toLocaleString(),
        outputTokens: entries
          .reduce((s, [, m]) => s + m.tokens.candidates, 0)
          .toLocaleString(),
        bucket: undefined,
        isActive: true,
        isSubtotal: true,
      });
    }
  }

  // 2. Models with quota only (registered Gemini models only)
  const quotaRows =
    quotas?.buckets
      ?.filter(
        (b) =>
          b.modelId &&
          GEMINI_MODEL_ALLOWLIST.has(b.modelId) &&
          !usedGeminiModelIds.has(b.modelId),
      )
      .map((bucket) => ({
        key: bucket.modelId!,
        modelName: bucket.modelId!,
        requests: '-' as number | string,
        cachedTokens: '-',
        inputTokens: '-',
        outputTokens: '-',
        bucket,
        isActive: false,
        isSubtotal: false,
      })) || [];

  return [...activeRows, ...quotaRows];
};

const formatResetTime = (resetTime: string): string => {
  const diff = new Date(resetTime).getTime() - Date.now();
  if (diff <= 0) return '';

  const totalMinutes = Math.ceil(diff / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const fmt = (val: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat('en', {
      style: 'unit',
      unit,
      unitDisplay: 'narrow',
    }).format(val);

  if (hours > 0 && minutes > 0) {
    return `(Resets in ${fmt(hours, 'hour')} ${fmt(minutes, 'minute')})`;
  } else if (hours > 0) {
    return `(Resets in ${fmt(hours, 'hour')})`;
  }

  return `(Resets in ${fmt(minutes, 'minute')})`;
};

const ModelUsageTable: React.FC<{
  models: Record<string, ModelMetrics>;
  quotas?: RetrieveUserQuotaResponse;
  cacheEfficiency: number;
  totalCachedTokens: number;
}> = ({ models, quotas, cacheEfficiency, totalCachedTokens }) => {
  const rows = buildModelRows(models, quotas);

  if (rows.length === 0) {
    return null;
  }

  const showQuotaColumn = !!quotas && rows.some((row) => !!row.bucket);

  const nameWidth = 25;
  const requestsWidth = 7;
  const uncachedWidth = 15;
  const cachedWidth = 14;
  const outputTokensWidth = 15;
  const usageLimitWidth = showQuotaColumn ? 28 : 0;

  const cacheEfficiencyColor = getStatusColor(cacheEfficiency, {
    green: CACHE_EFFICIENCY_HIGH,
    yellow: CACHE_EFFICIENCY_MEDIUM,
  });

  const totalWidth =
    nameWidth +
    requestsWidth +
    (showQuotaColumn
      ? usageLimitWidth
      : uncachedWidth + cachedWidth + outputTokensWidth);

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box alignItems="flex-end">
        <Box width={nameWidth}>
          <Text bold color={theme.text.primary} wrap="truncate-end">
            Model Usage
          </Text>
        </Box>
        <Box
          width={requestsWidth}
          flexDirection="column"
          alignItems="flex-end"
          flexShrink={0}
        >
          <Text bold color={theme.text.primary}>
            Reqs
          </Text>
        </Box>
        {!showQuotaColumn && (
          <>
            <Box
              width={uncachedWidth}
              flexDirection="column"
              alignItems="flex-end"
              flexShrink={0}
            >
              <Text bold color={theme.text.primary}>
                Input Tokens
              </Text>
            </Box>
            <Box
              width={cachedWidth}
              flexDirection="column"
              alignItems="flex-end"
              flexShrink={0}
            >
              <Text bold color={theme.text.primary}>
                Cache Reads
              </Text>
            </Box>
            <Box
              width={outputTokensWidth}
              flexDirection="column"
              alignItems="flex-end"
              flexShrink={0}
            >
              <Text bold color={theme.text.primary}>
                Output Tokens
              </Text>
            </Box>
          </>
        )}
        {showQuotaColumn && (
          <Box
            width={usageLimitWidth}
            flexDirection="column"
            alignItems="flex-end"
          >
            <Text bold color={theme.text.primary}>
              Usage left
            </Text>
          </Box>
        )}
      </Box>

      {/* Divider */}
      <Box
        borderStyle="round"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width={totalWidth}
      ></Box>

      {rows.map((row) => (
        <Box key={row.key}>
          <Box width={nameWidth}>
            <Text
              bold={row.isSubtotal}
              dimColor={row.isSubtotal}
              color={theme.text.primary}
              wrap="truncate-end"
            >
              {row.modelName}
            </Text>
          </Box>
          <Box
            width={requestsWidth}
            flexDirection="column"
            alignItems="flex-end"
            flexShrink={0}
          >
            <Text
              color={row.isActive ? theme.text.primary : theme.text.secondary}
            >
              {row.requests}
            </Text>
          </Box>
          {!showQuotaColumn && (
            <>
              <Box
                width={uncachedWidth}
                flexDirection="column"
                alignItems="flex-end"
                flexShrink={0}
              >
                <Text
                  color={
                    row.isActive ? theme.text.primary : theme.text.secondary
                  }
                >
                  {row.inputTokens}
                </Text>
              </Box>
              <Box
                width={cachedWidth}
                flexDirection="column"
                alignItems="flex-end"
                flexShrink={0}
              >
                <Text color={theme.text.secondary}>{row.cachedTokens}</Text>
              </Box>
              <Box
                width={outputTokensWidth}
                flexDirection="column"
                alignItems="flex-end"
                flexShrink={0}
              >
                <Text
                  color={
                    row.isActive ? theme.text.primary : theme.text.secondary
                  }
                >
                  {row.outputTokens}
                </Text>
              </Box>
            </>
          )}
          <Box
            width={usageLimitWidth}
            flexDirection="column"
            alignItems="flex-end"
          >
            {row.bucket &&
              row.bucket.remainingFraction != null &&
              row.bucket.resetTime && (
                <Text color={theme.text.secondary} wrap="truncate-end">
                  {(row.bucket.remainingFraction * 100).toFixed(1)}%{' '}
                  {formatResetTime(row.bucket.resetTime)}
                </Text>
              )}
          </Box>
        </Box>
      ))}

      {cacheEfficiency > 0 && !showQuotaColumn && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.primary}>
            <Text color={theme.status.success}>Savings Highlight:</Text>{' '}
            {totalCachedTokens.toLocaleString()} (
            <Text color={cacheEfficiencyColor}>
              {cacheEfficiency.toFixed(1)}%
            </Text>
            ) of input tokens were served from the cache, reducing costs.
          </Text>
        </Box>
      )}

      {showQuotaColumn && (
        <>
          <Box marginTop={1} marginBottom={2}>
            <Text color={theme.text.primary}>
              {`Usage limits span all sessions and reset daily.\n/auth to upgrade or switch to API key.`}
            </Text>
          </Box>
          <Text color={theme.text.secondary}>
            » Tip: For a full token breakdown, run `/stats model`.
          </Text>
        </>
      )}
    </Box>
  );
};

/** Render provider-specific rate-limit quotas (Claude, OpenAI, etc.). */
const ProviderQuotaSection: React.FC<{
  providerQuotas: Record<string, ProviderQuota>;
}> = ({ providerQuotas }) => {
  const entries = Object.values(providerQuotas);
  if (entries.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={theme.text.primary}>
        Provider Rate Limits
      </Text>
      {entries.map((q) => (
        <Box key={q.provider}>
          <Box width={20}>
            <Text color={theme.text.primary}>{q.provider}</Text>
          </Box>
          <Text color={theme.text.secondary}>
            {q.requestsRemaining != null && q.requestsLimit != null
              ? `${q.requestsRemaining}/${q.requestsLimit} reqs`
              : ''}
            {q.tokensRemaining != null && q.tokensLimit != null
              ? `  ${q.tokensRemaining.toLocaleString()}/${q.tokensLimit.toLocaleString()} tokens`
              : ''}
            {q.resetTime
              ? `  ${formatResetTime(q.resetTime instanceof Date ? q.resetTime.toISOString() : String(q.resetTime))}`
              : ''}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

interface StatsDisplayProps {
  duration: string;
  title?: string;
  providerFilter?: string;
  quotas?: RetrieveUserQuotaResponse;
  providerQuotas?: Record<string, ProviderQuota>;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  duration,
  title,
  providerFilter,
  quotas,
  providerQuotas,
}) => {
  const { stats } = useSessionStats();
  const { metrics } = stats;
  const { models: allModels, tools, files } = metrics;

  // F4-1: filter models by provider when --provider flag is used
  const models = providerFilter
    ? Object.fromEntries(
        Object.entries(allModels).filter(
          ([key]) => parseCompositeKey(key).provider === providerFilter,
        ),
      )
    : allModels;
  const computed = computeSessionStats({ models, tools, files });

  const successThresholds = {
    green: TOOL_SUCCESS_RATE_HIGH,
    yellow: TOOL_SUCCESS_RATE_MEDIUM,
  };
  const agreementThresholds = {
    green: USER_AGREEMENT_RATE_HIGH,
    yellow: USER_AGREEMENT_RATE_MEDIUM,
  };
  const successColor = getStatusColor(computed.successRate, successThresholds);
  const agreementColor = getStatusColor(
    computed.agreementRate,
    agreementThresholds,
  );

  const renderTitle = () => {
    if (title) {
      return <ThemedGradient bold>{title}</ThemedGradient>;
    }
    return (
      <Text bold color={theme.text.accent}>
        Session Stats
      </Text>
    );
  };

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
      overflow="hidden"
    >
      {renderTitle()}
      <Box height={1} />

      <Section title="Interaction Summary">
        <StatRow title="Session ID:">
          <Text color={theme.text.primary}>{stats.sessionId}</Text>
        </StatRow>
        <StatRow title="Tool Calls:">
          <Text color={theme.text.primary}>
            {tools.totalCalls} ({' '}
            <Text color={theme.status.success}>✓ {tools.totalSuccess}</Text>{' '}
            <Text color={theme.status.error}>x {tools.totalFail}</Text> )
          </Text>
        </StatRow>
        <StatRow title="Success Rate:">
          <Text color={successColor}>{computed.successRate.toFixed(1)}%</Text>
        </StatRow>
        {computed.totalDecisions > 0 && (
          <StatRow title="User Agreement:">
            <Text color={agreementColor}>
              {computed.agreementRate.toFixed(1)}%{' '}
              <Text color={theme.text.secondary}>
                ({computed.totalDecisions} reviewed)
              </Text>
            </Text>
          </StatRow>
        )}
        {files &&
          (files.totalLinesAdded > 0 || files.totalLinesRemoved > 0) && (
            <StatRow title="Code Changes:">
              <Text color={theme.text.primary}>
                <Text color={theme.status.success}>
                  +{files.totalLinesAdded}
                </Text>{' '}
                <Text color={theme.status.error}>
                  -{files.totalLinesRemoved}
                </Text>
              </Text>
            </StatRow>
          )}
      </Section>

      <Section title="Performance">
        <StatRow title="Wall Time:">
          <Text color={theme.text.primary}>{duration}</Text>
        </StatRow>
        <StatRow title="Agent Active:">
          <Text color={theme.text.primary}>
            {formatDuration(computed.agentActiveTime)}
          </Text>
        </StatRow>
        <SubStatRow title="API Time:">
          <Text color={theme.text.primary}>
            {formatDuration(computed.totalApiTime)}{' '}
            <Text color={theme.text.secondary}>
              ({computed.apiTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
        <SubStatRow title="Tool Time:">
          <Text color={theme.text.primary}>
            {formatDuration(computed.totalToolTime)}{' '}
            <Text color={theme.text.secondary}>
              ({computed.toolTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
      </Section>
      <ModelUsageTable
        models={models}
        quotas={quotas}
        cacheEfficiency={computed.cacheEfficiency}
        totalCachedTokens={computed.totalCachedTokens}
      />
      {(() => {
        const costEstimate = estimateCost(models, parseCompositeKey);
        return (
          costEstimate.totalCost > 0 && (
            <Box marginTop={1}>
              <Text color={theme.text.primary}>
                Estimated Cost:{' '}
                <Text color={theme.text.accent}>
                  {formatCostString(costEstimate)}
                </Text>
              </Text>
            </Box>
          )
        );
      })()}
      {providerQuotas && Object.keys(providerQuotas).length > 0 && (
        <ProviderQuotaSection providerQuotas={providerQuotas} />
      )}
    </Box>
  );
};
