import type {
  DocumentChunk,
  DocumentFileType,
  QuestionIntent,
} from '../types/knowledge.ts';

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'for', 'to', 'of',
  'in', 'with', 'as', 'by', 'be', 'are', 'was', 'were', 'it', 'that', 'this',
  'these', 'those', 'from', 'what', 'whats', 'how', 'when', 'where', 'who', 'why',
  'do', 'does', 'did', 'can', 'could', 'would', 'should', 'will', 'our', 'your',
  'my', 'their', 'we', 'you', 'they', 'about', 'into', 'between', 'compare',
  'difference', 'differences', 'versus', 'vs', 'mean', 'means', 'meaning',
  'define', 'definition', 'explain', 'tell', 'describe', 'please', 'give', 'me',
  'term', 'word', 'concept', 'summarize', 'summary', 'overview', 'list', 'all',
  'steps', 'procedure', 'process', 'using', 'based', 'selected', 'library',
  'libraries', 'document', 'documents', 'file', 'files',
]);

export function stemToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && token.length > 3) {
    return token.slice(0, -1);
  }
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  return token;
}

export function tokenizeContent(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function detectQuestionIntent(question: string): QuestionIntent {
  const q = question.trim().toLowerCase();

  if (
    /\b(compare|comparison|difference between|differences between|distinguish|contrast|versus|vs\.?|how does .+ differ)\b/.test(
      q
    )
  ) {
    return 'comparison';
  }

  if (
    /\b(how do i|how to|how can i|what is the procedure|what are the steps|steps to|step-by-step|process for|workflow for|checklist|escalate|escalation procedure)\b/.test(
      q
    )
  ) {
    return 'procedure';
  }

  if (
    /\b(summarize|summary|overview|topics|contents|outline|key takeaways|key guidelines|what is in|what does this (?:library|document|file) cover|list (?:all|the) (?:terms|definitions|rules|policies|topics))\b/.test(
      q
    )
  ) {
    return 'summary';
  }

  if (
    /^(what is|what's|what are|what does .+ mean|define|meaning of|definition of|who is|explain the term)\b/.test(
      q
    ) ||
    /\b(mean|means|meaning|definition of|define)\b/.test(q)
  ) {
    return 'definition';
  }

  return 'general';
}

export function extractFocusTerms(question: string): {
  focusTokens: string[];
  focusPhrase: string | null;
} {
  const cleaned = question
    .toLowerCase()
    .replace(/[?!."'`]/g, ' ')
    .replace(
      /^(can you |please |could you )?(tell me |explain )?(what is|what's|what are|what does|define|definition of|meaning of|how do i|how to|compare)\s+(an?|the)?\s*/i,
      ''
    )
    .replace(/\b(mean|means|meaning)\b/g, ' ')
    .trim();

  const focusTokens = tokenizeContent(cleaned);
  const focusPhrase =
    focusTokens.length >= 2 && focusTokens.length <= 5 ? focusTokens.join(' ') : null;

  return { focusTokens, focusPhrase };
}

export function splitContentIntoUnits(content: string): string[] {
  const lines = content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const units: string[] = [];
  for (const line of lines) {
    if (line.length <= 360) {
      units.push(line);
    } else {
      const sentences = line
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (sentences.length > 1) {
        units.push(...sentences);
      } else {
        units.push(line);
      }
    }
  }
  return units;
}

export function computePrecisionLexicalScore(params: {
  question: string;
  intent: QuestionIntent;
  content: string;
  documentTitle: string;
}): { lexicalScore: number; matchedFocusRatio: number; exactPhraseHit: boolean } {
  const { question, intent, content, documentTitle } = params;
  const { focusTokens, focusPhrase } = extractFocusTerms(question);
  const qTokens = focusTokens.length > 0 ? focusTokens : tokenizeContent(question);

  if (qTokens.length === 0) {
    return { lexicalScore: 0, matchedFocusRatio: 0, exactPhraseHit: false };
  }

  const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ');
  const haystack = `${documentTitle} ${content}`.toLowerCase();
  const docTokensList = tokenizeContent(haystack);
  const docTokens = new Set(docTokensList);
  const docStems = new Set(docTokensList.map(stemToken));

  let matchedCount = 0;
  let weightedSum = 0;
  for (const token of qTokens) {
    const stem = stemToken(token);
    if (docTokens.has(token) || docStems.has(stem)) {
      matchedCount += 1;
      weightedSum += 1;
    } else if (stem.length >= 4 && haystack.includes(stem)) {
      matchedCount += 0.65;
      weightedSum += 0.65;
    }
  }

  const matchedFocusRatio = matchedCount / qTokens.length;
  if (matchedCount === 0) {
    return { lexicalScore: 0, matchedFocusRatio: 0, exactPhraseHit: false };
  }

  let phraseBonus = 0;
  let exactPhraseHit = false;

  if (focusPhrase) {
    const phraseStem = focusPhrase
      .split(' ')
      .map(stemToken)
      .join(' ');
    const normalizedStems = docTokensList.map(stemToken).join(' ');
    if (normalizedContent.includes(focusPhrase) || normalizedStems.includes(phraseStem)) {
      exactPhraseHit = true;
      phraseBonus += 0.45;
    }
  }

  // Boost when an individual line looks like a definition or section header matching the focus term(s)
  const units = content.split(/\n+/);
  let definitionHeadingHit = false;
  for (const rawLine of units) {
    const line = rawLine.trim();
    const keyMatch = line.match(/^(?:[-*•]\s+|\d+\.\s+)?(?:\*\*|__)?([^:\n–-]{2,70})(?:\*\*|__)?\s*[:–-]/);
    if (!keyMatch) continue;
    const headingTokens = tokenizeContent(keyMatch[1]);
    const headingStems = new Set(headingTokens.map(stemToken));
    const headingMatchesAll = qTokens.every(
      (t) => headingTokens.includes(t) || headingStems.has(stemToken(t))
    );
    if (headingMatchesAll) {
      definitionHeadingHit = true;
      break;
    }
  }

  if (definitionHeadingHit) {
    phraseBonus += intent === 'definition' ? 0.5 : 0.35;
  }

  let bigramBonus = 0;
  for (let i = 0; i < qTokens.length - 1; i++) {
    const pair = `${qTokens[i]} ${qTokens[i + 1]}`;
    if (normalizedContent.includes(pair)) {
      bigramBonus += 0.15;
    }
  }

  const proceduralCueBonus =
    intent === 'procedure' &&
    (/\b(step\s*\d+|procedure|workflow|checklist|how to)\b/i.test(content) ||
      /^\s*\d+\.\s+/m.test(content))
      ? 0.14
      : 0;

  // Penalize partial multi-term matches strongly on definitions so "active treatment"
  // does not rank alongside "active claimant", while staying tolerant on 3+ word procedures.
  const coverageMultiplier =
    qTokens.length >= 2 && matchedFocusRatio < 0.75
      ? intent === 'definition' || qTokens.length === 2
        ? 0.55
        : 0.85
      : 1;

  const rawScore =
    (weightedSum / qTokens.length) * coverageMultiplier +
    phraseBonus +
    bigramBonus +
    proceduralCueBonus;

  return {
    lexicalScore: Math.min(1, Number(rawScore.toFixed(4))),
    matchedFocusRatio,
    exactPhraseHit: exactPhraseHit || definitionHeadingHit,
  };
}

export interface RankablePassage {
  chunk: DocumentChunk;
  documentTitle: string;
  fileType: DocumentFileType;
  libraryId?: string;
  libraryName?: string;
  folderName: string | null;
  score: number;
  lexicalScore?: number;
  vectorScore?: number;
  matchedFocusRatio?: number;
  exactPhraseHit?: boolean;
}

/**
 * Filter redundant/low-relevance passages, keeping the top 3-5 focused passages
 * (expanding up to 7 for multi-library comparisons or summaries).
 */
export function selectRelevantPassages<T extends RankablePassage>(params: {
  question: string;
  intent: QuestionIntent;
  ranked: T[];
  hasSemanticVectors: boolean;
  libraryCount: number;
}): T[] {
  const { intent, ranked, hasSemanticVectors, libraryCount } = params;

  const targetMax =
    intent === 'comparison' || intent === 'summary'
      ? Math.min(8, Math.max(5, libraryCount * 2))
      : libraryCount > 1
      ? 6
      : 5;

  const hasStrongFocusMatch = ranked.some(
    (item) =>
      (item.exactPhraseHit ?? false) ||
      ((item.matchedFocusRatio ?? 0) >= 0.99 && (item.lexicalScore ?? 0) >= 0.55)
  );

  const minLexicalFloor = intent === 'definition' ? 0.22 : 0.18;

  let filtered = ranked.filter((item) => {
    const lex = item.lexicalScore ?? item.score;
    const vec = item.vectorScore ?? 0;

    if (hasStrongFocusMatch && intent === 'definition') {
      // For definition queries when exact concept matches exist, exclude unrelated keyword-only matches
      if (!(item.exactPhraseHit ?? false) && (item.matchedFocusRatio ?? 0) < 0.85 && vec < 0.78) {
        return false;
      }
    }

    if (hasSemanticVectors && vec > 0) {
      return lex >= minLexicalFloor || (vec >= 0.62 && lex > 0) || vec >= 0.72;
    }

    return lex >= minLexicalFloor;
  });

  if (filtered.length === 0 && intent === 'summary') {
    const seenDocIds = new Set<string>();
    const overview: T[] = [];
    for (const item of ranked) {
      if (seenDocIds.has(item.chunk.documentId)) continue;
      seenDocIds.add(item.chunk.documentId);
      overview.push({
        ...item,
        score: Math.max(0.35, item.score),
      });
      if (overview.length >= targetMax) break;
    }
    return overview;
  }

  // Drop tail passages that score far below the top passage (noise suppression)
  if (filtered.length > 1) {
    const topScore = filtered[0].score;
    const minRatio = intent === 'comparison' || intent === 'summary' ? 0.32 : 0.45;
    filtered = filtered.filter(
      (item, idx) => idx === 0 || item.score >= topScore * minRatio || (item.exactPhraseHit ?? false)
    );
  }

  // Deduplicate identical or near-identical content across chunks
  const deduped: T[] = [];
  const seenNormalized = new Set<string>();
  for (const item of filtered) {
    const norm = item.chunk.content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    if (seenNormalized.has(norm)) continue;
    seenNormalized.add(norm);
    deduped.push(item);
    if (deduped.length >= targetMax) break;
  }

  return deduped;
}

/**
 * Extracts tightly focused supporting lines/sentences from retrieved passages
 * for Mode C (Evidence-only) fallback when no LLM is reachable.
 * Never returns unrelated definitions just because they share a stop/common keyword.
 */
export function extractFocusedEvidenceSnippets<T extends RankablePassage>(params: {
  question: string;
  intent: QuestionIntent;
  candidates: T[];
}): Array<{ text: string; score: number; candidate: T }> {
  const { question, intent, candidates } = params;
  const { focusTokens, focusPhrase } = extractFocusTerms(question);
  const qTokens = focusTokens.length > 0 ? focusTokens : tokenizeContent(question);

  const scoredUnits: Array<{
    text: string;
    score: number;
    matchedAll: boolean;
    definitionMatch: boolean;
    candidate: T;
  }> = [];

  for (const candidate of candidates) {
    const rawUnits = splitContentIntoUnits(candidate.chunk.content);
    const hasMultiStepBlock =
      intent === 'procedure' &&
      rawUnits.length > 1 &&
      rawUnits.filter((u) => /^(?:step\s*\d+[:.\s-]|\d+[.)]\s+)/i.test(u)).length >= 2;
    const units = hasMultiStepBlock
      ? [candidate.chunk.content.trim().slice(0, 650)]
      : rawUnits;

    for (const unit of units) {
      const lower = unit.toLowerCase();
      const unitTokens = tokenizeContent(unit);
      const unitTokenSet = new Set(unitTokens);
      const unitStemSet = new Set(unitTokens.map(stemToken));

      let matched = 0;
      for (const token of qTokens) {
        const stem = stemToken(token);
        if (unitTokenSet.has(token) || unitStemSet.has(stem)) {
          matched += 1;
        } else if (stem.length >= 4 && lower.includes(stem)) {
          matched += 0.6;
        }
      }

      if (matched === 0) continue;

      const ratio = qTokens.length > 0 ? matched / qTokens.length : 0;
      const matchedAll = ratio >= 0.99;

      const keyMatch = unit.match(/^(?:[-*•]\s+|\d+\.\s+)?(?:\*\*|__)?([^:\n–-]{2,70})(?:\*\*|__)?\s*[:–-]/);
      let definitionMatch = false;
      if (keyMatch && qTokens.length > 0) {
        const keyTokens = tokenizeContent(keyMatch[1]);
        const keyStems = new Set(keyTokens.map(stemToken));
        definitionMatch = qTokens.every(
          (t) => keyTokens.includes(t) || keyStems.has(stemToken(t))
        );
      }

      const phraseBoost =
        focusPhrase && lower.replace(/\s+/g, ' ').includes(focusPhrase) ? 0.5 : 0;
      const defBoost = definitionMatch ? 0.75 : 0;
      const score = ratio * 0.65 + phraseBoost + defBoost + candidate.score * 0.25;

      scoredUnits.push({
        text: unit,
        score,
        matchedAll,
        definitionMatch,
        candidate,
      });
    }
  }

  if (scoredUnits.length === 0 && intent === 'summary') {
    for (const candidate of candidates.slice(0, 3)) {
      const units = splitContentIntoUnits(candidate.chunk.content);
      for (const unit of units.slice(0, 2)) {
        if (unit.length < 18) continue;
        scoredUnits.push({
          text: unit,
          score: Math.max(0.3, candidate.score * 0.5),
          matchedAll: false,
          definitionMatch: false,
          candidate,
        });
      }
    }
  }

  scoredUnits.sort((a, b) => b.score - a.score);

  const hasDefHit = scoredUnits.some((u) => u.definitionMatch);
  const hasFullHit = scoredUnits.some((u) => u.matchedAll);

  const filtered = scoredUnits.filter((u) => {
    if (intent === 'definition' && hasDefHit) {
      return u.definitionMatch;
    }
    if (hasFullHit && qTokens.length >= 2) {
      return u.matchedAll || u.score >= scoredUnits[0].score * 0.75;
    }
    return u.score >= 0.35;
  });

  const maxExtracts = intent === 'definition' ? 2 : 4;
  const seen = new Set<string>();
  const finalSnippets: Array<{ text: string; score: number; candidate: T }> = [];

  for (const item of filtered) {
    const key = item.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    finalSnippets.push({
      text: item.text,
      score: item.score,
      candidate: item.candidate,
    });
    if (finalSnippets.length >= maxExtracts) break;
  }

  return finalSnippets;
}
