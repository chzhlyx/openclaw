import { describe, expect, it } from "vitest";
import { compileFaqKnowledgeFromMarkdown } from "./faq-knowledge.js";

describe("compileFaqKnowledgeFromMarkdown", () => {
  it("removes markdown emphasis and section separators from FAQ answers", () => {
    const entries = compileFaqKnowledgeFromMarkdown(`## FAQ-001 — Company Address

**Question examples**

- Where are you located?
- What's your office address?

**Answer**
Our office is located at **326 moodie drive, Ottawa, Ontario, Canada**.

---
`);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.answer).toBe(
      "Our office is located at 326 moodie drive, Ottawa, Ontario, Canada.",
    );
  });

  it("stops the last FAQ answer before trailing top-level sections", () => {
    const entries = compileFaqKnowledgeFromMarkdown(`## FAQ-014 — Assistant Capabilities

**Question examples**

- What can you do?
- What can this assistant do?

**Answer**
I can answer common questions and take a message for Sales or Service.

---

# Response Rules

- Speak only the answer

# Example Spoken Reply

Our regular business hours are Monday to Friday.
`);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.answer).toBe(
      "I can answer common questions and take a message for Sales or Service.",
    );
  });
});
