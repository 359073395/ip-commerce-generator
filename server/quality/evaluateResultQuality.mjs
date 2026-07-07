export function evaluateResultQuality({
  result = {},
  definition = {},
  knowledge = [],
  requestBody = {},
} = {}) {
  const resultText = flattenResultText(result);
  const userFacts = extractUserFacts(requestBody);
  const selectionFacts = extractSelectionFacts(requestBody.selections || []);
  const knowledgeTerms = extractKnowledgeTerms(knowledge);

  const checks = [
    checkCompleteness(result, definition),
    checkUserFacts(resultText, userFacts),
    checkSelections(resultText, selectionFacts),
    checkKnowledgeEvidence(resultText, knowledgeTerms),
    checkActionability(result, definition),
    checkRiskNotes(result),
  ];
  const score = clampScore(Math.round(checks.reduce((sum, item) => sum + item.score, 0)));
  const missing = checks.filter((item) => !item.passed).map((item) => item.label);

  return {
    score,
    level: score >= 85 ? 'excellent' : score >= 70 ? 'pass' : 'needs_review',
    checks,
    missing,
    evidence: {
      userFactsConsidered: userFacts.length,
      selectionsConsidered: selectionFacts.length,
      knowledgeTermsConsidered: knowledgeTerms.length,
    },
  };
}

function checkCompleteness(result, definition) {
  const hasSummary = Boolean(String(result.summary || '').trim());
  const hasSections = Array.isArray(result.sections) && result.sections.length >= 2;
  const hasTable = Array.isArray(result.tables) && result.tables.length >= 1;
  const hasScript = Array.isArray(result.scripts) && result.scripts.length >= 1;
  const scriptRequired = definition.id === 'script' || definition.id === 'commerce';
  const passed = hasSummary && hasSections && (scriptRequired ? hasScript : (hasTable || hasScript || result.sections.length >= 3));
  return {
    id: 'completeness',
    label: '完整骨架',
    passed,
    score: passed ? 22 : hasSummary && hasSections ? 14 : 6,
    detail: scriptRequired ? '脚本/带货模块需要 summary、sections 和 scripts。' : '普通模块需要 summary、多个 sections，并尽量有表格或脚本。',
  };
}

function checkUserFacts(resultText, facts) {
  if (!facts.length) {
    return { id: 'user_facts', label: '用户事实使用', passed: true, score: 14, detail: '用户未提供明确事实。' };
  }
  const hits = facts.filter((fact) => textIncludesFact(resultText, fact));
  const ratio = hits.length / facts.length;
  return {
    id: 'user_facts',
    label: '用户事实使用',
    passed: ratio >= 0.35 || hits.length >= 2,
    score: ratio >= 0.6 ? 20 : ratio >= 0.35 || hits.length >= 2 ? 15 : 7,
    detail: `命中 ${hits.length}/${facts.length} 个用户事实。`,
  };
}

function checkSelections(resultText, selections) {
  if (!selections.length) {
    return { id: 'frontend_selections', label: '前端选择使用', passed: true, score: 12, detail: '本次没有前端选择项。' };
  }
  const hits = selections.filter((fact) => textIncludesFact(resultText, fact));
  const passed = hits.length >= Math.min(2, selections.length);
  return {
    id: 'frontend_selections',
    label: '前端选择使用',
    passed,
    score: passed ? 14 : hits.length ? 9 : 3,
    detail: `命中 ${hits.length}/${selections.length} 个选择项。`,
  };
}

function checkKnowledgeEvidence(resultText, terms) {
  if (!terms.length) {
    return { id: 'knowledge_evidence', label: '知识库证据', passed: false, score: 4, detail: '未读取到知识库命中词。' };
  }
  const hits = terms.filter((term) => textIncludesFact(resultText, term));
  const passed = hits.length >= 2 || resultText.length > 500;
  return {
    id: 'knowledge_evidence',
    label: '知识库证据',
    passed,
    score: passed ? 16 : hits.length ? 10 : 5,
    detail: `结果中体现 ${hits.length}/${terms.length} 个知识库关键词。`,
  };
}

function checkActionability(result, definition) {
  const hasNextActions = Array.isArray(result.nextActions) && result.nextActions.length >= 2;
  const hasRows = (result.tables || []).some((table) => Array.isArray(table.rows) && table.rows.length >= 2);
  const hasScriptBody = (result.scripts || []).some((script) => Array.isArray(script.body) && script.body.length >= 2 && script.hook && script.cta);
  const passed = hasNextActions || hasRows || hasScriptBody;
  return {
    id: 'actionability',
    label: '可执行程度',
    passed,
    score: passed ? 18 : 7,
    detail: definition.id === 'script' ? '脚本应包含 hook、body、cta 或明确下一步。' : '结果应包含表格、脚本或下一步行动。',
  };
}

function checkRiskNotes(result) {
  const notes = Array.isArray(result.riskNotes) ? result.riskNotes : [];
  const passed = notes.length >= 1;
  return {
    id: 'risk_notes',
    label: '风险提醒',
    passed,
    score: passed ? 10 : 0,
    detail: passed ? `包含 ${notes.length} 条提醒。` : '缺少待确认项、合规或人工核验提醒。',
  };
}

function extractUserFacts(requestBody = {}) {
  const facts = [];
  collectValues(requestBody.formData, facts);
  collectValues(requestBody.context?.projectProfile, facts);
  if (requestBody.context?.agentGoal) facts.push(requestBody.context.agentGoal);
  return normalizeFacts(facts);
}

function extractSelectionFacts(selections = []) {
  const facts = [];
  for (const selection of selections || []) {
    if (selection.choice) facts.push(selection.choice);
    if (selection.subChoice) facts.push(selection.subChoice);
    if (Array.isArray(selection.choices)) facts.push(...selection.choices);
  }
  return normalizeFacts(facts);
}

function extractKnowledgeTerms(knowledge = []) {
  const terms = [];
  for (const item of knowledge || []) {
    if (item.heading) terms.push(item.heading);
    if (Array.isArray(item.matchedTerms)) terms.push(...item.matchedTerms);
  }
  return normalizeFacts(terms).slice(0, 24);
}

function collectValues(input, output) {
  if (!input || typeof input !== 'object') return;
  for (const value of Object.values(input)) {
    if (typeof value === 'string') output.push(value);
    else if (Array.isArray(value)) output.push(...value.filter((item) => typeof item === 'string'));
    else if (value && typeof value === 'object') collectValues(value, output);
  }
}

function normalizeFacts(values) {
  const seen = new Set();
  const facts = [];
  for (const value of values) {
    const fact = String(value || '').replace(/\s+/g, ' ').trim();
    if (!fact || fact.length < 2) continue;
    const clipped = fact.slice(0, 80);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(clipped);
  }
  return facts.slice(0, 40);
}

function textIncludesFact(text, fact) {
  const normalizedText = String(text || '').toLowerCase();
  const normalizedFact = String(fact || '').toLowerCase();
  if (!normalizedFact) return false;
  if (normalizedText.includes(normalizedFact)) return true;
  const tokens = normalizedFact
    .split(/[\s,，。；;:：|/、（）()「」"'“”‘’]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return tokens.some((token) => normalizedText.includes(token));
}

function flattenResultText(result = {}) {
  return [
    result.module,
    result.summary,
    ...(result.sections || []).flatMap((section) => [section.title, ...(section.items || [])]),
    ...(result.tables || []).flatMap((table) => [table.title, ...(table.columns || []), ...(table.rows || []).flat()]),
    ...(result.scripts || []).flatMap((script) => [script.title, script.hook, ...(script.body || []), ...(script.shots || []), script.cta]),
    ...(result.nextActions || []),
    ...(result.riskNotes || []),
  ].filter(Boolean).join('\n');
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}
