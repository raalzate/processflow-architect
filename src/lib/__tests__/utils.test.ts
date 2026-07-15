import { describe, it, expect } from "vitest";
import { cn, separateCamelCase } from "@/lib/utils";

describe("cn", () => {
  it("merges multiple class name strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("returns an empty string with no inputs", () => {
    expect(cn()).toBe("");
  });

  it("ignores falsy values (null, undefined, false, '')", () => {
    expect(cn("a", null, undefined, false, "", "b")).toBe("a b");
  });

  it("supports conditional object syntax", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  it("flattens arrays of class values", () => {
    expect(cn(["a", "b"], ["c"])).toBe("a b c");
  });

  it("deduplicates conflicting tailwind utilities, last wins", () => {
    // twMerge resolves conflicting padding utilities, keeping the last.
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("merges conflicting tailwind text colors keeping the last", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("keeps non-conflicting tailwind utilities together", () => {
    expect(cn("px-2 py-1", "text-sm")).toBe("px-2 py-1 text-sm");
  });

  it("handles a conditional class that resolves to false", () => {
    const isActive = false;
    expect(cn("base", isActive && "active")).toBe("base");
  });

  it("handles nested mixed inputs (array + object + string)", () => {
    expect(cn("a", ["b", { c: true, d: false }], "e")).toBe("a b c e");
  });
});

describe("separateCamelCase", () => {
  it("returns empty string for empty input", () => {
    expect(separateCamelCase("")).toBe("");
  });

  it("returns empty string for null/undefined (falsy guard)", () => {
    // `if (!s) return ""` guards against falsy values.
    expect(separateCamelCase(null as unknown as string)).toBe("");
    expect(separateCamelCase(undefined as unknown as string)).toBe("");
  });

  it("splits a simple camelCase word", () => {
    expect(separateCamelCase("camelCase")).toBe("camel Case");
  });

  it("splits multiple camelCase boundaries", () => {
    expect(separateCamelCase("myVariableName")).toBe("my Variable Name");
  });

  it("inserts a space between a letter and a following digit", () => {
    expect(separateCamelCase("version2")).toBe("version 2");
  });

  it("inserts a space between a digit and a following uppercase letter", () => {
    // matches the /([a-z0-9])([A-Z])/ rule (digit before uppercase).
    expect(separateCamelCase("abc2Def")).toBe("abc 2 Def");
  });

  it("replaces underscores with spaces", () => {
    expect(separateCamelCase("snake_case_value")).toBe("snake case value");
  });

  it("handles combined camelCase, digits and underscores", () => {
    expect(separateCamelCase("user_idValue2")).toBe("user id Value 2");
  });

  it("leaves an already-spaced lowercase string unchanged", () => {
    expect(separateCamelCase("hello world")).toBe("hello world");
  });

  it("leaves a single lowercase word unchanged", () => {
    expect(separateCamelCase("plain")).toBe("plain");
  });

  it("does not split between two consecutive uppercase letters", () => {
    // The regex only matches lower/digit -> upper transitions, so
    // consecutive uppercase letters (acronyms) stay together.
    expect(separateCamelCase("ABCWord")).toBe("ABCWord");
  });

  it("splits a lowercase letter preceding an uppercase acronym block", () => {
    expect(separateCamelCase("getHTTPResponse")).toBe("get HTTPResponse");
  });

  it("separates trailing digits in an identifier", () => {
    expect(separateCamelCase("item42")).toBe("item 42");
  });

  it("handles a leading uppercase (PascalCase)", () => {
    expect(separateCamelCase("PascalCase")).toBe("Pascal Case");
  });
});
