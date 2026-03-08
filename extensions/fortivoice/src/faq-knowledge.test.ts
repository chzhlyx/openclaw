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
});
