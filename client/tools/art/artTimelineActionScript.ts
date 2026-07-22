import type { TimelineCommand } from "../../../shared/timeline-model";

type ScriptCommand = Partial<Pick<TimelineCommand, "type" | "target" | "event">>;

export interface TimelineActionScriptParseResult {
  commands: ScriptCommand[];
  error?: string;
}

const QUOTED_ARGS_PATTERN = /"([^"]*)"|'([^']*)'/g;
const MEMBER_CALL_PATTERN = /^([a-zA-Z_$][\w$]*)\s*\.\s*(gotoAndPlay|gotoAndStop)\s*\((.*)\)$/;
const MEMBER_LABEL_PATTERN = /^([a-zA-Z_$][\w$]*)\s*\.\s*(gotoAndPlay|gotoAndStop)\s+(.+)$/;
const SCRIPT_IDENTIFIER_PATTERN = /^[a-zA-Z_$][\w$]*$/;

function quoteScriptString(value: string): string {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function scriptCommandToLine(command: TimelineCommand): string {
  if (command.type === "stop") return "stop();";
  if (command.type === "setVisible") return `visible = ${command.target === "false" ? "false" : "true"};`;
  if (command.type === "gotoAndPlay") return `gotoAndPlay(${quoteScriptString(command.target || "")});`;
  if (command.type === "gotoAndStop") return `gotoAndStop(${quoteScriptString(command.target || "")});`;
  if (command.type === "loop") return `loop(${quoteScriptString(command.target || "")});`;
  if (command.type === "playComponent") {
    if (command.target && SCRIPT_IDENTIFIER_PATTERN.test(command.target)) {
      return `${command.target}.gotoAndPlay(${quoteScriptString(command.event || "")});`;
    }
    return `playComponent(${quoteScriptString(command.target || "")}, ${quoteScriptString(command.event || "")});`;
  }
  if (command.type === "stopComponent") {
    if (command.target && SCRIPT_IDENTIFIER_PATTERN.test(command.target)) {
      return `${command.target}.gotoAndStop(${quoteScriptString(command.event || "")});`;
    }
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

function cleanLooseLabel(value: string): string {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim();
}

function memberCommandFor(target: string, method: string, animation: string): ScriptCommand | string {
  const cleanTarget = String(target || "").trim();
  const cleanAnimation = String(animation || "").trim();
  if (!cleanTarget || !cleanAnimation) return `${method} needs a target instance and animation label.`;
  return {
    type: method === "gotoAndStop" ? "stopComponent" : "playComponent",
    target: cleanTarget,
    event: cleanAnimation
  };
}

function parseScriptStatement(statement: string): ScriptCommand | string {
  const visibleAssignment = statement.match(/^visible\s*=\s*(true|false)$/i);
  if (visibleAssignment) return { type: "setVisible", target: visibleAssignment[1].toLowerCase() };
  const memberCall = statement.match(MEMBER_CALL_PATTERN);
  if (memberCall) {
    const args = parseQuotedArgs(memberCall[3].trim());
    const hasUnquotedArgs = memberCall[3].trim().length > 0 && args.length === 0;
    if (hasUnquotedArgs) return `Arguments for ${memberCall[2]} must be quoted.`;
    if (args.length !== 1 || !args[0]) return `${memberCall[1]}.${memberCall[2]}() needs one quoted animation label.`;
    return memberCommandFor(memberCall[1], memberCall[2], args[0]);
  }
  const memberLabel = statement.match(MEMBER_LABEL_PATTERN);
  if (memberLabel) return memberCommandFor(memberLabel[1], memberLabel[2], cleanLooseLabel(memberLabel[3]));
  const call = statement.match(/^([a-zA-Z_$][\w$]*)\s*\((.*)\)$/);
  if (!call) return `Use function-call syntax, like stop();, gotoAndPlay("Appear"), bubble.gotoAndPlay("Appear"), or assign visibility with visible = false;`;
  const type = call[1];
  const rawArgs = call[2].trim();
  const args = parseQuotedArgs(rawArgs);
  const hasUnquotedArgs = rawArgs.length > 0 && args.length === 0;
  if (hasUnquotedArgs) return `Arguments for ${type} must be quoted.`;

  if (type === "stop") {
    if (args.length > 0) return "stop() does not take arguments.";
    return { type: "stop" };
  }
  if (type === "gotoAndPlay" || type === "gotoAndStop" || type === "loop") {
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
