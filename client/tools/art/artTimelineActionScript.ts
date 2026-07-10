import type { TimelineCommand } from "../../../shared/timeline-model";

type ScriptCommand = Partial<Pick<TimelineCommand, "type" | "target" | "event">>;

export interface TimelineActionScriptParseResult {
  commands: ScriptCommand[];
  error?: string;
}

const QUOTED_ARGS_PATTERN = /"([^"]*)"|'([^']*)'/g;

function quoteScriptString(value: string): string {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function scriptCommandToLine(command: TimelineCommand): string {
  if (command.type === "stop") return "stop();";
  if (command.type === "gotoAndPlay") return `gotoAndPlay(${quoteScriptString(command.target || "")});`;
  if (command.type === "gotoAndStop") return `gotoAndStop(${quoteScriptString(command.target || "")});`;
  if (command.type === "playComponent") {
    return `playComponent(${quoteScriptString(command.target || "")}, ${quoteScriptString(command.event || "")});`;
  }
  if (command.type === "stopComponent") {
    return `stopComponent(${quoteScriptString(command.target || "")}, ${quoteScriptString(command.event || "")});`;
  }
  if (command.type === "emit") {
    if (command.target && command.event) return `emit(${quoteScriptString(command.target)}, ${quoteScriptString(command.event)});`;
    return `emit(${quoteScriptString(command.event || command.target || "")});`;
  }
  return `${command.type}(${[command.target, command.event].filter(Boolean).map((value) => quoteScriptString(value || "")).join(", ")});`;
}

export function timelineCommandsToActionScript(commands: TimelineCommand[]): string {
  return commands.map(scriptCommandToLine).join("\n");
}

function splitScriptStatements(source: string): string[] {
  return String(source || "")
    .split(/[\n;]/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function parseQuotedArgs(statement: string): string[] {
  const args: string[] = [];
  QUOTED_ARGS_PATTERN.lastIndex = 0;
  for (let match = QUOTED_ARGS_PATTERN.exec(statement); match; match = QUOTED_ARGS_PATTERN.exec(statement)) {
    args.push(match[1] ?? match[2] ?? "");
  }
  return args;
}

function parseScriptStatement(statement: string): ScriptCommand | string {
  const call = statement.match(/^([a-zA-Z_$][\w$]*)\s*\((.*)\)$/);
  if (!call) return `Use function-call syntax, like stop(); or gotoAndPlay("appear");`;
  const type = call[1];
  const rawArgs = call[2].trim();
  const args = parseQuotedArgs(rawArgs);
  const hasUnquotedArgs = rawArgs.length > 0 && args.length === 0;
  if (hasUnquotedArgs) return `Arguments for ${type} must be quoted.`;

  if (type === "stop") {
    if (args.length > 0) return "stop() does not take arguments.";
    return { type: "stop" };
  }
  if (type === "gotoAndPlay" || type === "gotoAndStop") {
    if (args.length !== 1 || !args[0]) return `${type}() needs one quoted frame label.`;
    return { type, target: args[0] };
  }
  if (type === "emit") {
    if (args.length === 1 && args[0]) return { type, event: args[0] };
    if (args.length === 2 && args[0] && args[1]) return { type, target: args[0], event: args[1] };
    return "emit() needs one quoted event, or a quoted target and event.";
  }
  if (type === "playComponent" || type === "stopComponent") {
    if (args.length !== 2 || !args[0] || !args[1]) return `${type}() needs a quoted component target and animation label.`;
    return { type, target: args[0], event: args[1] };
  }
  return `Unknown timeline command: ${type}`;
}

export function parseTimelineActionScript(source: string): TimelineActionScriptParseResult {
  const commands: ScriptCommand[] = [];
  const statements = splitScriptStatements(source);
  for (const statement of statements) {
    const command = parseScriptStatement(statement);
    if (typeof command === "string") return { commands: [], error: command };
    commands.push(command);
  }
  return { commands };
}
