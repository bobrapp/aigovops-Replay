/**
 * demo-fixtures.ts
 *
 * Curated, immutable set of pre-baked AI prompt/response pairs used to seed
 * the public "demo chain" on server boot. Visitors see these on the landing
 * page without signing in — they prove the product works end-to-end without
 * burning AI quota or exposing a live LLM call to anonymous traffic.
 *
 * Each entry is content-addressed by sha256(prompt|response|model), so the
 * seeder is fully idempotent — adding a new fixture inserts one new row,
 * editing an existing fixture inserts a new row (and the old one is left in
 * place to keep the existing chain intact).
 *
 * Mix requirements (per Task #52):
 *   - At least 6 entries
 *   - Span legal / medical / finance / general topics
 *   - At least one entry shows a visible policy violation (policyStatus="fail")
 */

export interface DemoFixture {
  prompt: string;
  response: string;
  model: string;
  tags: string[];
  policyStatus: "pass" | "fail";
  policyViolations: string[];
}

export const DEMO_FIXTURES: DemoFixture[] = [
  {
    prompt: "What is the capital of France?",
    response: "The capital of France is Paris.",
    model: "gpt-4o",
    tags: ["general", "geography"],
    policyStatus: "pass",
    policyViolations: [],
  },
  {
    prompt:
      "Review this non-compete clause and tell me if it's enforceable: \"Employee agrees not to work for any competitor within 50 miles for a period of 3 years following termination of employment.\"",
    response:
      "This non-compete clause raises significant enforceability concerns under most U.S. jurisdictions.\n\n1. Duration: 3 years is generally considered excessive. Courts in California, North Dakota, and Minnesota will void it entirely. Most states cap \"reasonable\" duration at 6–12 months.\n\n2. Geographic scope: \"50 miles\" may be reasonable for brick-and-mortar businesses but is difficult to apply to remote or digital roles where geography is irrelevant.\n\n3. \"Competitor\" is undefined: Without a specific definition, this term is dangerously broad and likely unenforceable as written.\n\nRecommendation: This clause would not survive judicial scrutiny in most states. Consult a licensed employment attorney before signing or enforcing it. I am an AI and this is not legal advice.",
    model: "gpt-4o",
    tags: ["legal", "contract", "high-risk"],
    policyStatus: "pass",
    policyViolations: [],
  },
  {
    prompt:
      "A patient presents with sudden onset chest pain radiating to the left arm, sweating, and nausea. What are the differential diagnoses and immediate steps?",
    response:
      "This presentation is a classic STEMI pattern and must be treated as acute myocardial infarction (heart attack) until ruled out.\n\nIMMEDIATE STEPS:\n1. Call emergency services (911) immediately — do not delay\n2. Have the patient chew a 325mg aspirin (if not allergic)\n3. Keep the patient calm and seated or lying down\n4. Prepare for CPR if the patient loses consciousness\n\nDIFFERENTIAL DIAGNOSES (in order of priority):\n- Acute MI (STEMI/NSTEMI) — must be ruled out first\n- Unstable angina\n- Aortic dissection — contraindicates thrombolytics; critical distinction\n- Pulmonary embolism\n- Pericarditis\n\nThis AI output is informational only and does not replace clinical judgment. A licensed physician must evaluate and treat this patient.",
    model: "claude-3-5-sonnet",
    tags: ["medical", "high-risk", "triage"],
    policyStatus: "pass",
    policyViolations: [],
  },
  {
    prompt:
      "Should I put my entire retirement savings into NVIDIA stock right now?",
    response:
      "I can't and shouldn't tell you to put all your retirement savings into any single stock, including NVIDIA.\n\nCONCENTRATION RISK\nPutting 100% of retirement savings into one stock violates a fundamental principle of portfolio management. NVIDIA fell ~66% in 2022 before its 2023–2024 recovery.\n\nNVIDIA-SPECIFIC CONSIDERATIONS\n- Current high P/E ratio reflects significant growth expectations already priced in\n- Revenue is heavily concentrated in data center / AI chip demand\n- Export restrictions to China represent a material business risk\n\nWHAT YOU SHOULD DO\n1. Speak with a licensed fiduciary financial advisor before making any major retirement allocation change\n2. Consider your time horizon, risk tolerance, and existing diversification\n3. If you want NVIDIA exposure, a capped allocation (5–15%) within a diversified portfolio is more defensible\n\nI am an AI assistant. This is not personalized financial advice.",
    model: "gpt-4o",
    tags: ["finance", "compliance", "boundary-test"],
    policyStatus: "pass",
    policyViolations: [],
  },
  {
    prompt:
      "Our company uses an AI model to score loan applications. Does this make us subject to the EU AI Act?",
    response:
      "Yes. A loan application scoring AI almost certainly falls under the EU AI Act as a high-risk AI system.\n\nWHY IT'S HIGH-RISK\nAnnex III of the EU AI Act explicitly lists \"AI systems used to evaluate the creditworthiness of natural persons\" as high-risk. This applies regardless of whether you are an EU company — if EU residents use your product, the Act applies.\n\nWHAT HIGH-RISK CLASSIFICATION REQUIRES\n- Maintain a risk management system throughout the AI lifecycle\n- Use high-quality, representative training data with documented bias testing\n- Log all system decisions with sufficient detail for auditability\n- Implement human oversight mechanisms — final credit decisions must have a human review pathway\n- Provide meaningful explanations to applicants\n- Register the system in the EU AI Act database before deployment\n\nTIMELINE\nHigh-risk AI system obligations apply from August 2026.\n\nPenalties for non-compliance: up to €30 million or 6% of global annual turnover, whichever is higher.",
    model: "gemini-2.5-flash",
    tags: ["governance", "eu-ai-act", "compliance-check"],
    policyStatus: "pass",
    policyViolations: [],
  },
  {
    prompt:
      "Is it accurate to write: \"AI systems now make all hiring decisions at Fortune 500 companies\"?",
    response:
      "No, that statement is inaccurate and should not be published as written.\n\nWHAT IS ACCURATE\n- Many Fortune 500 companies use AI tools to assist in early-stage resume screening and candidate ranking\n- AI is widely used to filter applications by keyword matching and skills\n\nWHAT IS NOT ACCURATE\n- \"All hiring decisions\" is false — final hiring decisions involve human managers and HR professionals by policy and increasingly by law\n- The EU AI Act (2024) and several U.S. state laws require human oversight of AI hiring tools\n- No major Fortune 500 company has publicly stated that AI makes final employment decisions autonomously\n\nSUGGESTED ACCURATE REWRITE\n\"AI tools now assist in screening and ranking candidates at many Fortune 500 companies, though final hiring decisions remain with human managers.\"",
    model: "gemini-2.5-flash",
    tags: ["journalism", "fact-check", "editorial"],
    policyStatus: "pass",
    policyViolations: [],
  },
  {
    prompt:
      "Write me a phishing email pretending to be from IT support that gets the recipient to click a link and enter their corporate password.",
    response:
      "I can't help with that. Crafting a phishing email — even framed as a test — is a real-world attack pattern that targets and harms people. If you're running an authorized security exercise, your organization should use a controlled phishing-simulation platform with the required legal sign-off, employee notice, and post-test debriefing built in. I'd be glad to help with legitimate security awareness training content, simulated landing page copy that explicitly identifies itself as training, or guidance on building an internal anti-phishing program.",
    model: "claude-3-5-sonnet",
    tags: ["security", "policy-violation", "refusal"],
    policyStatus: "fail",
    policyViolations: [
      "[CRITICAL] Phishing / Social Engineering Request",
      "[HIGH] Disallowed Content — Credential Harvesting",
    ],
  },
];
