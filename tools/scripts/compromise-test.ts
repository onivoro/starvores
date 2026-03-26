/**
 * Compromise NLP Noun Extraction Behavior Test
 *
 * Documents how compromise handles noun phrase extraction across
 * various casing, sentence structures, and word types relevant
 * to Onyvore's automatic linking feature.
 *
 * Run: bun tools/scripts/compromise-test.ts
 */

import nlp from "compromise";

interface TestCase {
  label: string;
  input: string;
}

interface ExtractionResult {
  label: string;
  input: string;
  nouns: string[];
  properNouns: string[];
  nounPhrases: string[];
  allTerms: { text: string; tags: string[] }[];
}

function extract(tc: TestCase): ExtractionResult {
  const doc = nlp(tc.input);
  const nouns = doc.nouns().out("array") as string[];
  const nounPhrases = doc.match("#Noun+").out("array") as string[];

  // Get proper nouns specifically
  const properNouns = doc.match("#ProperNoun+").out("array") as string[];

  // Get all terms with their tags for debugging
  const allTerms: { text: string; tags: string[] }[] = [];
  doc.termList().forEach((term: any) => {
    allTerms.push({
      text: term.text,
      tags: Array.from(term.tags),
    });
  });

  return {
    label: tc.label,
    input: tc.input,
    nouns,
    properNouns,
    nounPhrases,
    allTerms,
  };
}

function printResult(r: ExtractionResult) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST: ${r.label}`);
  console.log(`INPUT: "${r.input}"`);
  console.log(`  nouns():        [${r.nouns.map((n) => `"${n}"`).join(", ")}]`);
  console.log(
    `  #Noun+:         [${r.nounPhrases.map((n) => `"${n}"`).join(", ")}]`
  );
  console.log(
    `  #ProperNoun+:   [${r.properNouns.map((n) => `"${n}"`).join(", ")}]`
  );
  console.log(`  term tags:`);
  r.allTerms.forEach((t) => {
    console.log(`    "${t.text}" → [${t.tags.join(", ")}]`);
  });
}

// ============================================================
// TEST CATEGORIES
// ============================================================

const tests: TestCase[] = [
  // --- 1. Proper nouns with correct capitalization ---
  {
    label: "Proper noun, capitalized, subject position",
    input: "Onyvore is a knowledge management tool.",
  },
  {
    label: "Proper noun, capitalized, object position",
    input: "I am working on Onyvore today.",
  },
  {
    label: "Proper noun, capitalized, possessive",
    input: "Onyvore's search engine is fast.",
  },
  {
    label: "Multi-word proper noun, capitalized",
    input: "Project Atlas is our internal codename.",
  },

  // --- 2. Proper nouns with INCORRECT casing ---
  {
    label: "Made-up word, lowercase, subject position",
    input: "onyvore is a knowledge management tool.",
  },
  {
    label: "Made-up word, lowercase, object position",
    input: "I am working on onyvore today.",
  },
  {
    label: "Made-up word, lowercase, mid-sentence",
    input: "The onyvore extension handles indexing.",
  },
  {
    label: "Multi-word, lowercase",
    input: "We launched project atlas last quarter.",
  },

  // --- 3. Known dictionary nouns ---
  {
    label: "Common noun, lowercase",
    input: "The sourdough recipe is in my notes.",
  },
  {
    label: "Common noun, capitalized (start of sentence)",
    input: "Sourdough is my favorite bread.",
  },
  {
    label: "Technical noun, lowercase",
    input: "The kubernetes cluster needs scaling.",
  },
  {
    label: "Technical noun, capitalized",
    input: "Kubernetes handles container orchestration.",
  },

  // --- 4. Mixed casing in realistic note content ---
  {
    label: "Realistic note with mixed proper/common nouns",
    input:
      "Meeting with Sarah about the deployment pipeline for Project Mercury.",
  },
  {
    label: "Lowercase stream-of-consciousness",
    input:
      "need to check onyvore indexing and fix the sourdough starter recipe",
  },
  {
    label: "ALL CAPS heading style",
    input: "ONYVORE SEARCH ENGINE ARCHITECTURE",
  },

  // --- 5. Ambiguous / edge cases ---
  {
    label: "Unknown word after preposition",
    input: "Notes about onyvore are stored locally.",
  },
  {
    label: "Unknown word as direct object",
    input: "We should integrate onyvore with the pipeline.",
  },
  {
    label: "Hyphenated compound",
    input: "The machine-learning model needs retraining.",
  },
  {
    label: "Noun phrase with adjective",
    input: "The automatic linking feature is impressive.",
  },

  // --- 6. Sentence structure variations ---
  {
    label: "Question form",
    input: "Does onyvore support fuzzy matching?",
  },
  {
    label: "Imperative/command",
    input: "Configure onyvore to use the S3 backend.",
  },
  {
    label: "Bullet point style (no verb)",
    input: "onyvore search improvements",
  },
  {
    label: "Title case heading",
    input: "Onyvore Search Engine Architecture",
  },

  // --- 7. Compound noun phrases ---
  {
    label: "Compound: known words",
    input: "The search engine optimization is critical.",
  },
  {
    label: "Compound: with proper noun",
    input: "The Onyvore search engine is fast.",
  },
  {
    label: "Compound: all lowercase with unknown word",
    input: "The onyvore search engine is fast.",
  },

  // --- 8. Words that look like nouns but aren't ---
  {
    label: "Gerund (verb acting as noun)",
    input: "Indexing large vaults takes time.",
  },
  {
    label: "Verb that could be noun",
    input: "We need to search the vault quickly.",
  },
];

// ============================================================
// RUN
// ============================================================

console.log("Compromise NLP Noun Extraction Behavior Test");
console.log(`compromise version: ${nlp("").buildNumber?.() || "unknown"}`);
console.log(`Total test cases: ${tests.length}`);

const results = tests.map(extract);
results.forEach(printResult);

// ============================================================
// SUMMARY: Focus on the key question
// ============================================================

console.log(`\n${"=".repeat(70)}`);
console.log("SUMMARY: Will lowercase made-up words be extracted as nouns?");
console.log("=".repeat(70));

const keyTests = [
  "Made-up word, lowercase, subject position",
  "Made-up word, lowercase, object position",
  "Made-up word, lowercase, mid-sentence",
  "Unknown word after preposition",
  "Unknown word as direct object",
  "Question form",
  "Imperative/command",
  "Bullet point style (no verb)",
  "Compound: all lowercase with unknown word",
];

for (const label of keyTests) {
  const r = results.find((r) => r.label === label)!;
  const inNouns = r.nouns.some((n) =>
    n.toLowerCase().includes("onyvore")
  );
  const inPhrases = r.nounPhrases.some((n) =>
    n.toLowerCase().includes("onyvore")
  );
  const status = inNouns || inPhrases ? "EXTRACTED" : "MISSED";
  console.log(`  [${status}] ${r.label}`);
  if (inNouns) console.log(`           nouns(): ${r.nouns.filter((n) => n.toLowerCase().includes("onyvore")).join(", ")}`);
  if (inPhrases) console.log(`           #Noun+: ${r.nounPhrases.filter((n) => n.toLowerCase().includes("onyvore")).join(", ")}`);
}
