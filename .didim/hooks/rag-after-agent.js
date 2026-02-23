#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable no-undef */
// .didim/hooks/rag-after-agent.js
// Phase 1: AfterAgent Hook — Q&A + 운영 메타데이터 + 장기기억 PostgreSQL 저장
// 설계서 참조: docs/00_project/SystemEngineerAgent_service/PoC/poc_chat_rag_plan.md §6.2
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';

// ── 설정 ──────────────────────────────────────────────
const DB_URL =
  process.env.RAG_DATABASE_URL ||
  'postgresql://localhost:5432/didim_api';
const TENANT_ID = process.env.RAG_TENANT_ID?.trim() || '';
const MAX_STORE_LENGTH = 10000; // 저장 최대 문자 수
const CONNECT_TIMEOUT_MS = 1500;
// Hook timeout(5s) 예산: connect 1500 + query×2 1500×2 = 4500 < 5000
const QUERY_TIMEOUT_MS = 1500;
const MEMORY_ENABLED = process.env.RAG_MEMORY_ENABLED !== 'false';
const MEMORY_MIN_SUMMARY_LEN = safeInt(
  process.env.RAG_MEMORY_MIN_SUMMARY_LEN, 20,
);
const MEMORY_DEFAULT_TTL_DAYS = safeInt(
  process.env.RAG_MEMORY_DEFAULT_TTL_DAYS, 90,
);

// ── 유틸리티 ──────────────────────────────────────────
function safeInt(envValue, fallback) {
  const n = Number(envValue);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function createClient() {
  const pgModule = await import('pg');
  const Client = pgModule.default?.Client ?? pgModule.Client;
  if (!Client) {
    throw new Error('pg.Client is unavailable');
  }
  return new Client({
    connectionString: DB_URL,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
}

function deriveProjectId(cwd) {
  const stableCwd = realpathSync(cwd);
  return createHash('sha256').update(stableCwd).digest('hex');
}

async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

function isLocalDatabase(dbUrl) {
  try {
    const host = new URL(dbUrl).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === 'host.docker.internal'
    );
    // 주의: .local TLD(mDNS)는 조직 내부 원격 DB일 수 있으므로 로컬 판별에서 제외.
    // macOS Bonjour 호스트명 사용 시 RAG_TENANT_ID를 명시적으로 설정할 것.
  } catch {
    return false;
  }
}

function toErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

// ── 운영 메타데이터 추출 ──────────────────────────────
function parseTag(prompt, key) {
  const match = prompt.match(new RegExp(`\\[${key}:([^\\]]+)\\]`, 'i'));
  return match?.[1]?.trim() || null;
}

function normalizeEnvironment(value) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return ['prod', 'stg', 'dev', 'qa', 'unknown'].includes(normalized)
    ? normalized
    : 'unknown';
}

function extractOpsMetadata(prompt) {
  const serviceName =
    parseTag(prompt, 'service') ||
    process.env.RAG_DEFAULT_SERVICE_NAME ||
    null;
  const environment = normalizeEnvironment(
    parseTag(prompt, 'env') ||
      parseTag(prompt, 'environment') ||
      process.env.RAG_DEFAULT_ENVIRONMENT ||
      null,
  );
  const incidentType =
    parseTag(prompt, 'incident') || parseTag(prompt, 'type');
  const ticketId =
    prompt.match(/\b(?:INC|CHG|PROB|REQ)-\d+\b/i)?.[0]?.toUpperCase() || null;
  return { serviceName, environment, incidentType, ticketId };
}

// ── 장기기억 추출 ────────────────────────────────────
function normalizeText(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function inferMemoryType(prompt, metadata) {
  const p = prompt.toLowerCase();
  if (metadata.ticketId || p.includes('포스트모템') || p.includes('재발방지')) {
    return 'incident_postmortem';
  }
  if (p.includes('절차') || p.includes('runbook') || p.includes('대응 순서')) {
    return 'runbook';
  }
  if (p.includes('선호') || p.includes('기본값')) {
    return 'preference';
  }
  return 'fact';
}

// M-2: 마크다운 prefix(#, >, ```) 제거하여 summary 품질 향상
function stripMarkdownPrefix(line) {
  return line
    .replace(/^#{1,6}\s+/, '')   // ## Heading → Heading
    .replace(/^>\s?/, '')         // > quote → quote
    .replace(/^```\w*$/, '')      // ```js → '' (코드블록 시작)
    .replace(/^\*{1,2}|_\{1,2}/, '') // bold/italic prefix
    .trim();
}

function buildMemoryCandidate(prompt, response, metadata) {
  const lines = response.split('\n').map((s) => stripMarkdownPrefix(s.trim()));
  // 마크다운 헤더 등 짧은 라인 스킵 → 실질적 내용이 있는 첫 라인 선택
  const firstLine =
    lines.find((s) => s.length >= MEMORY_MIN_SUMMARY_LEN) ||
    lines.find((s) => s.length > 0) ||
    response;
  const summary = Array.from(firstLine).slice(0, 280).join('');
  if (!summary || summary.trim().length < MEMORY_MIN_SUMMARY_LEN) return null;
  const memoryType = inferMemoryType(prompt, metadata);
  // M-1: truncation 120→280 — summary 전체를 hash input에 포함하여 충돌 감소
  const keyBase = [
    memoryType,
    metadata.serviceName || 'global',
    metadata.environment || 'unknown',
    normalizeText(summary),
  ].join('|');
  const memoryKey = createHash('sha256').update(keyBase).digest('hex');
  return {
    memoryKey,
    memoryType,
    summary,
    detailJson: {
      ticket_id: metadata.ticketId,
      incident_type: metadata.incidentType,
      extracted_from: 'rag-after-agent',
    },
    confidence: 0.65,
    importance: memoryType === 'runbook' ? 4 : 3,
  };
}

async function upsertMemoryItem(client, scope, candidate, sourceHistoryId) {
  const expiresAt =
    candidate.memoryType === 'preference' && MEMORY_DEFAULT_TTL_DAYS > 0
      ? new Date(Date.now() + MEMORY_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000)
      : null;
  await client.query(
    `INSERT INTO se_agent_management.memory_items
       (tenant_id, project_id, service_name, environment, memory_key, memory_type, summary, detail_json,
        source_history_ids, confidence, importance, expires_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, ARRAY[$9]::bigint[], $10, $11, $12, NOW())
     ON CONFLICT (tenant_id, project_id, memory_key)
     DO UPDATE SET
       summary = CASE WHEN length(EXCLUDED.summary) > length(se_agent_management.memory_items.summary)
                      THEN EXCLUDED.summary
                      ELSE se_agent_management.memory_items.summary END,
       detail_json = EXCLUDED.detail_json,
       source_history_ids = (
         SELECT ARRAY(
           SELECT DISTINCT x
           FROM unnest(se_agent_management.memory_items.source_history_ids || EXCLUDED.source_history_ids) AS x
           ORDER BY x DESC
           LIMIT 20
         )
       ),
       reinforcement_count = se_agent_management.memory_items.reinforcement_count + 1,
       confidence = LEAST(1.0, se_agent_management.memory_items.confidence + 0.05),
       importance = GREATEST(se_agent_management.memory_items.importance, EXCLUDED.importance),
       expires_at = COALESCE(se_agent_management.memory_items.expires_at, EXCLUDED.expires_at),
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [
      scope.tenantId,
      scope.projectId,
      scope.serviceName,
      scope.environment,
      candidate.memoryKey,
      candidate.memoryType,
      candidate.summary,
      JSON.stringify(candidate.detailJson),
      sourceHistoryId,
      candidate.confidence,
      candidate.importance,
      expiresAt,
    ],
  );
}

// ── 메인 로직 ────────────────────────────────────────
async function main() {
  const input = await readHookInput();
  const { prompt, prompt_response, session_id, cwd } = input;

  // TASK-002: 필터링 로직
  // 빈 응답이나 시스템 명령은 저장 스킵
  if (!prompt || !prompt_response || !cwd) return {};
  if (prompt_response === '[no response text]') return {};

  // 슬래시 커맨드 제외 (/model, /settings 등)
  if (prompt.trim().startsWith('/')) return {};

  // 공유 DB 환경에서 tenant 미설정은 fail-closed
  if (!TENANT_ID && !isLocalDatabase(DB_URL)) {
    process.stderr.write(
      '[rag-after-agent] RAG_TENANT_ID is required for non-local DB.\n',
    );
    return {};
  }
  const tenantId = TENANT_ID || 'local-default';

  // M-4: deriveProjectId / createClient 를 try 블록 안으로 이동
  //      → realpathSync ENOENT, pg import 실패 등이 catch 블록에서 분류 보고됨
  let client;
  try {
    // 프로젝트 ID 파생 (realpath(cwd) SHA-256)
    const projectId = deriveProjectId(cwd);
    const metadata = extractOpsMetadata(prompt);

    client = await createClient();
    await client.connect();

    // M-5: 서버 측 쿼리 타임아웃 — 클라이언트가 죽어도 서버 쿼리가 무기한 실행되지 않도록
    await client.query(`SET statement_timeout = '${QUERY_TIMEOUT_MS}'`);

    // ── Phase 1 핵심: chat_history INSERT (독립 커밋) ──
    // Issue #1 수정: memory upsert 실패가 Q&A 저장을 롤백하지 않도록 분리
    const insertResult = await client.query(
      `INSERT INTO se_agent_management.chat_history
         (tenant_id, project_id, session_id, service_name, environment, incident_type, ticket_id, prompt, response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        tenantId,
        projectId,
        session_id,
        metadata.serviceName,
        metadata.environment,
        metadata.incidentType,
        metadata.ticketId,
        Array.from(prompt).slice(0, MAX_STORE_LENGTH).join(''),
        Array.from(prompt_response).slice(0, MAX_STORE_LENGTH).join(''),
      ],
    );

    // ── 장기기억 upsert (best-effort — 실패해도 chat_history는 이미 저장됨) ──
    const sourceHistoryId = insertResult.rows?.[0]?.id;
    const candidate = buildMemoryCandidate(prompt, prompt_response, metadata);
    if (MEMORY_ENABLED && candidate && sourceHistoryId) {
      try {
        await upsertMemoryItem(
          client,
          {
            tenantId,
            projectId,
            serviceName: metadata.serviceName,
            environment: metadata.environment,
          },
          candidate,
          sourceHistoryId,
        );
      } catch (memErr) {
        process.stderr.write(
          `[rag-after-agent] Memory upsert failed (chat_history saved): ${toErrorMessage(memErr)}\n`,
        );
      }
    }
  } catch (err) {
    // Issue #4 수정: 파일시스템 에러(ENOENT/EACCES)와 DB 에러를 구분하여 보고
    const errMsg = toErrorMessage(err);
    const errCode = err instanceof Error ? err.code : undefined;
    const category =
      errCode === 'ENOENT' || errCode === 'EACCES' ? 'Path error' : 'DB error';
    process.stderr.write(
      `[rag-after-agent] ${category}: ${errMsg}\n`,
    );
  } finally {
    if (client) await client.end().catch(() => undefined);
  }

  return {};
}

// TASK-003: 최상위 에러 핸들러 — exit 0 + 빈 JSON 보장
main()
  .then((output) => {
    process.stdout.write(JSON.stringify(output));
  })
  .catch((err) => {
    process.stderr.write(
      `[rag-after-agent] Fatal: ${toErrorMessage(err)}\n`,
    );
    process.stdout.write(JSON.stringify({}));
  });
