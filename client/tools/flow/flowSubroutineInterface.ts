import type {
  FlowSubroutineInput,
  FlowSubroutineOutput,
  FlowSubroutineValueType
} from "../../types/game-data";

export const subroutineValueTypes: ReadonlyArray<{
  id: FlowSubroutineValueType;
  name: string;
}> = [
  { id: "string", name: "String" },
  { id: "integer", name: "Integer" },
  { id: "number", name: "Number" },
  { id: "boolean", name: "Boolean" },
  { id: "json", name: "List / JSON" }
];

export function normalizeSubroutineVariableName(value: unknown, fallback: string): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/^[^A-Za-z_$]+/, "")
    .replace(/[^A-Za-z0-9_$]+/g, "")
    .slice(0, 64);
  return cleaned || fallback;
}

function uniqueVariableName(
  value: unknown,
  fallback: string,
  existingNames: Iterable<string>
): string {
  const used = new Set([...existingNames].map((name) => name.toLowerCase()));
  const base = normalizeSubroutineVariableName(value, fallback);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, Math.max(1, 64 - String(suffix).length))}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createSubroutineInput(
  existing: ReadonlyArray<FlowSubroutineInput>
): FlowSubroutineInput {
  const name = uniqueVariableName(
    `input${existing.length + 1}`,
    "input",
    existing.map((item) => item.name)
  );
  return { name, valueType: "string", source: `g.${name}` };
}

export function createSubroutineOutput(
  existing: ReadonlyArray<FlowSubroutineOutput>
): FlowSubroutineOutput {
  const name = uniqueVariableName(
    `output${existing.length + 1}`,
    "output",
    existing.map((item) => item.name)
  );
  return { name, valueType: "string", value: "" };
}

export function renameSubroutineInterfaceItem<
  T extends FlowSubroutineInput | FlowSubroutineOutput
>(
  values: ReadonlyArray<T>,
  index: number,
  name: unknown
): T[] {
  return values.map((value, itemIndex) => itemIndex === index
    ? {
        ...value,
        name: uniqueVariableName(
          name,
          `${"source" in value ? "input" : "output"}${index + 1}`,
          values.filter((_, otherIndex) => otherIndex !== index).map((item) => item.name)
        )
      }
    : { ...value }) as T[];
}
