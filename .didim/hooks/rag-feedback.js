#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable no-undef */
// .didim/hooks/rag-feedback.js
// 수동 품질 피드백 기록 스크립트
// 설계서 참조: docs/00_project/SystemEngineerAgent_service/PoC/poc_chat_rag_plan.md §6.3
//
// 사용 예:
//   node rag-feedback.js --target memory --id 12 --type accepted --note "실운영에서 채택"
//   node rag-feedback.js --target history --id 123 --type rejected --note "문맥 불일치"

// ── 설정 ──────────────────────────────────────────────
const DB_URL =
  process.env.RAG_DATABASE_URL ||
  'postgresql://localhost:5432/didim_api';
const CONNECT_TIMEOUT_MS = 3000;
const QUERY_TIMEOUT_MS = 3000;

// ── 인자 파싱 ────────────────────────────────────────
const args = new Map(
  process.argv.slice(2).reduce((acc, cur, idx, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[idx + 1]]);
    return acc;
  }, []),
);

const targetId = Number(args.get('id'));
const target = (args.get('target') || 'memory').toLowerCase(); // memory | history
const feedbackType = args.get('type'); // accepted | edited | rejected
const note = args.get('note') || null;

if (
  !targetId ||
  !['memory', 'history'].includes(target) ||
  !['accepted', 'edited', 'rejected'].includes(feedbackType)
) {
  process.stderr.write(
    'usage: --target <memory|history> --id <number> --type <accepted|edited|rejected> [--note "..."]\n',
  );
  process.exit(1);
}

const tenantId = process.env.RAG_TENANT_ID;
const projectId = process.env.RAG_PROJECT_ID; // 사전에 계산/주입
const sessionId = process.env.RAG_SESSION_ID || 'manual-feedback';
if (!tenantId || !projectId) {
  process.stderr.write('RAG_TENANT_ID and RAG_PROJECT_ID are required.\n');
  process.exit(1);
}

// ── 유틸리티 ──────────────────────────────────────────
function toErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
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

// ── 메인 로직 ────────────────────────────────────────
async function main() {
  const client = await createClient();
  try {
    await client.connect();

    if (target === 'memory') {
      await client.query(
        `INSERT INTO se_agent_management.memory_feedback
           (memory_item_id, tenant_id, project_id, feedback_type, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [targetId, tenantId, projectId, feedbackType, note],
      );
    } else {
      await client.query(
        `INSERT INTO se_agent_management.chat_history_feedback
           (chat_history_id, tenant_id, project_id, session_id, feedback_type, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [targetId, tenantId, projectId, sessionId, feedbackType, note],
      );
    }

    process.stdout.write(
      `Feedback recorded: target=${target} id=${targetId} type=${feedbackType}\n`,
    );
  } catch (err) {
    const errCode = err instanceof Error ? err.code : undefined;
    const category =
      errCode === 'ENOENT' || errCode === 'EACCES' ? 'Path error' : 'DB error';
    process.stderr.write(
      `[rag-feedback] ${category}: ${toErrorMessage(err)}\n`,
    );
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((err) => {
  process.stderr.write(`[rag-feedback] Fatal: ${toErrorMessage(err)}\n`);
  process.exit(1);
});
