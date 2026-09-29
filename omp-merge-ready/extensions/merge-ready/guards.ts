import { isAbsolute, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

export type CommandKind = "merge" | "force_push" | "hard_reset" | "ok";

export interface CommandClassification {
	kind: CommandKind;
	reason?: string;
}

type ShellToken =
	| { kind: "word"; value: string }
	| { kind: "operator"; value: string }
	| { kind: "substitution"; value: string };

const MERGE_REASON = "automatic pull-request merges are disabled while merge-ready is active";
const FORCE_PUSH_REASON = "force-pushing is disabled while merge-ready is active";
const HARD_RESET_REASON = "hard resets are disabled while merge-ready is active";
const SHELL_COMMANDS: Readonly<Record<string, true>> = {
	sh: true,
	bash: true,
	zsh: true,
	dash: true,
};


/**
 * Tokenize just enough POSIX shell syntax for the safety policy.  This is not a
 * shell parser: it deliberately preserves words and command boundaries while
 * handling quoting, escapes, separators, and command substitutions.  The
 * guard must fail closed for an actual dangerous command, but must not mistake
 * ordinary text such as `echo \"gh pr merge\"` for one.
 */
function tokenizeShell(input: string): ShellToken[] {
	const tokens: ShellToken[] = [];
	let word = "";
	let quote: "single" | "double" | undefined;
	let i = 0;
	let atWordStart = true;

	const flushWord = (): void => {
		if (word.length > 0) {
			tokens.push({ kind: "word", value: word });
			word = "";
		}
		atWordStart = true;
	};

	while (i < input.length) {
		const ch = input[i]!;

		if (quote === "single") {
			if (ch === "'") {
				quote = undefined;
			} else {
				word += ch;
			}
			i += 1;
			atWordStart = false;
			continue;
		}

		if (quote === "double") {
			if (ch === '"') {
				quote = undefined;
				i += 1;
				continue;
			}
			if (ch === "\\") {
				const next = input[i + 1];
				if (next !== undefined) {
					// In double quotes only these escapes have special shell meaning;
					// retaining the backslash for other characters is more faithful and
					// avoids turning a literal path into a different path.
					if (next === '"' || next === "\\" || next === "$" || next === "`" || next === "\n") {
						word += next;
						i += 2;
						atWordStart = false;
						continue;
					}
					word += ch;
					i += 1;
					atWordStart = false;
					continue;
				}
			}
			if (ch === "$" && input[i + 1] === "(") {
				const substitution = readSubstitution(input, i + 2);
				if (substitution) {
					tokens.push({ kind: "substitution", value: substitution.body });
					i = substitution.end;
					atWordStart = false;
					continue;
				}
			}
			if (ch === "`") {
				const substitution = readBacktick(input, i + 1);
				if (substitution) {
					tokens.push({ kind: "substitution", value: substitution.body });
					i = substitution.end;
					atWordStart = false;
					continue;
				}
			}

			word += ch;
			i += 1;
			atWordStart = false;
			continue;
		}

		if (ch === "\n") {
			flushWord();
			tokens.push({ kind: "operator", value: "\n" });
			i += 1;
			continue;
		}
		if (" \t\r".includes(ch)) {
			flushWord();
			i += 1;
			continue;
		}

		if (ch === "'") {
			quote = "single";
			atWordStart = false;
			i += 1;
			continue;
		}
		if (ch === '"') {
			quote = "double";
			atWordStart = false;
			i += 1;
			continue;
		}
		if (ch === "\\") {
			const next = input[i + 1];
			if (next !== undefined) {
				word += next;
				i += 2;
				atWordStart = false;
				continue;
			}
			word += ch;
			i += 1;
			atWordStart = false;
			continue;
		}
		if (ch === "$" && input[i + 1] === "(") {
			const substitution = readSubstitution(input, i + 2);
			if (substitution) {
				tokens.push({ kind: "substitution", value: substitution.body });
				i = substitution.end;
				atWordStart = false;
				continue;
			}
		}
		if (ch === "`") {
			const substitution = readBacktick(input, i + 1);
			if (substitution) {
				tokens.push({ kind: "substitution", value: substitution.body });
				i = substitution.end;
				atWordStart = false;
				continue;
			}
		}

		// A comment begins only at a word boundary.  Once found, the rest of
		// this command line cannot execute and can be ignored.
		if (ch === "#" && atWordStart) {
			flushWord();
			while (i < input.length && input[i] !== "\n") i += 1;
			continue;
		}

		const operator = readOperator(input, i);
		if (operator) {
			flushWord();
			tokens.push({ kind: "operator", value: operator.value });
			i = operator.end;
			continue;
		}

		word += ch;
		atWordStart = false;
		i += 1;
	}

	flushWord();
	return tokens;
}

function readOperator(input: string, start: number): { value: string; end: number } | undefined {
	const rest = input.slice(start);
	for (const value of ["&&", "||", ";;", ";&", "|&", ";", "|", "&", "(", ")"]) {
		if (rest.startsWith(value)) return { value, end: start + value.length };
	}
	return undefined;
}

function readSubstitution(input: string, start: number): { body: string; end: number } | undefined {
	let depth = 1;
	let quote: "single" | "double" | undefined;
	for (let i = start; i < input.length; i += 1) {
		const ch = input[i]!;
		if (quote === "single") {
			if (ch === "'") quote = undefined;
			continue;
		}
		if (quote === "double") {
			if (ch === "\\") {
				i += 1;
				continue;
			}
			if (ch === '"') quote = undefined;
			continue;
		}
		if (ch === "'") {
			quote = "single";
			continue;
		}
		if (ch === '"') {
			quote = "double";
			continue;
		}
		if (ch === "\\") {
			i += 1;
			continue;
		}
		if (ch === "(") {
			depth += 1;
			continue;
		}
		if (ch === ")") {
			depth -= 1;
			if (depth === 0) return { body: input.slice(start, i), end: i + 1 };
		}
	}
	return undefined;
}
function readBacktick(input: string, start: number): { body: string; end: number } | undefined {
	for (let i = start; i < input.length; i += 1) {
		const ch = input[i]!;
		if (ch === "\\") {
			i += 1;
			continue;
		}
		if (ch === "`") return { body: input.slice(start, i), end: i + 1 };
	}
	return undefined;
}


function basename(command: string): string {
	const normalized = command.replaceAll("\\", "/");
	return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function isAssignment(word: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

function skipPrefix(words: string[]): string[] {
	let index = 0;
	while (index < words.length && isAssignment(words[index]!)) index += 1;

	while (index < words.length) {
		const command = basename(words[index]!);

		if (command === "env") {
			index += 1;
			while (index < words.length) {
				const word = words[index]!;
				if (word === "--") {
					index += 1;
					break;
				}
				if (isAssignment(word)) {
					index += 1;
					continue;
				}
				if (word === "-u" || word === "--unset" || word === "-C" || word === "--chdir") {
					index += 2;
					continue;
				}
				if (
					word.startsWith("--unset=") ||
					word.startsWith("--chdir=") ||
					word === "-i" ||
					word === "--ignore-environment"
				) {
					index += 1;
					continue;
				}
				if (word.startsWith("-")) {
					index += 1;
					continue;
				}
				break;
			}
			continue;
		}

		if (command === "sudo") {
			index += 1;
			while (index < words.length) {
				const word = words[index]!;
				if (word === "--") {
					index += 1;
					break;
				}
				if (word === "-u" || word === "-g" || word === "--user" || word === "--group") {
					index += 2;
					continue;
				}
				if (
					word.startsWith("-u") ||
					word.startsWith("-g") ||
					word.startsWith("--user=") ||
					word.startsWith("--group=")
				) {
					index += 1;
					continue;
				}
				if (word.startsWith("-")) {
					index += 1;
					continue;
				}
				break;
			}
			continue;
		}

		if (command === "command" || command === "builtin" || command === "exec" || command === "nohup") {
			index += 1;
			while (index < words.length) {
				const word = words[index]!;
				if (word === "--") {
					index += 1;
					break;
				}
				if (command === "exec" && (word === "-a" || word === "--argv0")) {
					index += 2;
					continue;
				}
				if (word.startsWith("-")) {
					index += 1;
					continue;
				}
				break;
			}
			continue;
		}

		if (command === "time") {
			index += 1;
			while (index < words.length) {
				const word = words[index]!;
				if (word === "--") {
					index += 1;
					break;
				}
				if (word === "-f" || word === "--format" || word === "-o" || word === "--output") {
					index += 2;
					continue;
				}
				if (word.startsWith("--format=") || word.startsWith("--output=") || word === "-p") {
					index += 1;
					continue;
				}
				if (word.startsWith("-")) {
					index += 1;
					continue;
				}
				break;
			}
			continue;
		}

		if (command === "timeout") {
			index += 1;
			while (index < words.length) {
				const word = words[index]!;
				if (word === "--") {
					index += 1;
					break;
				}
				if (word === "-k" || word === "--kill-after" || word === "-s" || word === "--signal") {
					index += 2;
					continue;
				}
				if (
					word.startsWith("--kill-after=") ||
					word.startsWith("--signal=") ||
					word.startsWith("--preserve-status") ||
					word.startsWith("--foreground")
				) {
					index += 1;
					continue;
				}
				if (word.startsWith("-")) {
					index += 1;
					continue;
				}
				break;
			}
			if (index < words.length) index += 1; // timeout duration
			continue;
		}

		if (command === "nice") {
			index += 1;
			while (index < words.length) {
				const word = words[index]!;
				if (word === "--") {
					index += 1;
					break;
				}
				if (word === "-n") {
					index += 2;
					continue;
				}
				if (word.startsWith("--adjustment=")) {
					index += 1;
					continue;
				}
				if (word.startsWith("-")) {
					index += 1;
					continue;
				}
				break;
			}
			continue;
		}

		if (command === "xargs") {
			index += 1;
			while (index < words.length) {
				const word = words[index]!;
				if (word === "--") {
					index += 1;
					break;
				}
				if (!word.startsWith("-")) break;
				if (
					word === "-a" ||
					word === "-E" ||
					word === "-I" ||
					word === "-L" ||
					word === "-n" ||
					word === "-P" ||
					word === "-s" ||
					word === "-d" ||
					word === "--arg-file" ||
					word === "--eof" ||
					word === "--replace" ||
					word === "--max-lines" ||
					word === "--max-args" ||
					word === "--max-procs" ||
					word === "--max-chars" ||
					word === "--delimiter"
				) {
					index += 2;
					continue;
				}
				if (word.startsWith("--") && word.includes("=")) {
					index += 1;
					continue;
				}
				index += 1;
			}
			continue;
		}

		break;
	}
	return words.slice(index);
}

function gitSubcommand(words: string[]): { name?: string; index: number } {
	let index = 1;
	while (index < words.length) {
		const word = words[index]!;
		if (word === "--") return { name: words[index + 1], index: index + 1 };
		if (
			word === "-C" ||
			word === "--git-dir" ||
			word === "--work-tree" ||
			word === "--namespace" ||
			word === "-c"
		) {
			index += 2;
			continue;
		}
		if (
			word.startsWith("-C") ||
			word.startsWith("--git-dir=") ||
			word.startsWith("--work-tree=") ||
			word.startsWith("--namespace=") ||
			word.startsWith("-c")
		) {
			index += 1;
			continue;
		}
		if (word.startsWith("-")) {
			index += 1;
			continue;
		}
		return { name: word, index };
	}
	return { index };
}

function ghSubcommand(words: string[]): { name?: string; index: number } {
	let index = 1;
	while (index < words.length) {
		const word = words[index]!;
		if (word === "--") return { name: words[index + 1], index: index + 1 };
		if (!word.startsWith("-")) return { name: word, index };
		if (word === "-R" || word === "--repo" || word === "--hostname") {
			index += 2;
			continue;
		}
		if (
			word.startsWith("--repo=") ||
			word.startsWith("--hostname=") ||
			(word.startsWith("-R") && word.length > 2)
		) {
			index += 1;
			continue;
		}
		index += 1;
	}
	return { index };
}

function shellPayload(words: string[]): string | undefined {
	const executable = basename(words[0] ?? "");
	if (SHELL_COMMANDS[executable] !== true) return undefined;
	for (let index = 1; index < words.length; index += 1) {
		const word = words[index]!;
		if (word === "--") return undefined;
		if (word === "-o" || word === "--option") {
			index += 1;
			continue;
		}
		if (word.startsWith("-") && word.length > 1) {
			if (word.slice(1).includes("c")) return words[index + 1];
			continue;
		}
		return undefined;
	}
	return undefined;
}

function classifyGh(words: string[], subcommand: { name?: string; index: number }): CommandClassification {
	if (subcommand.name === "pr" && basename(words[subcommand.index + 1] ?? "") === "merge") {
		return { kind: "merge", reason: MERGE_REASON };
	}
	if (subcommand.name !== "api") return { kind: "ok" };
	const args = words.slice(subcommand.index + 1);
	if (
		args.some(
			(arg) =>
				/(?:^|\/)pulls\/\d+\/merge(?:$|[/?#])/.test(arg) ||
				arg.includes("mergePullRequest") ||
				arg.includes("enablePullRequestAutoMerge"),
		)
	) {
		return { kind: "merge", reason: MERGE_REASON };
	}
	return { kind: "ok" };
}

function classifyWords(words: string[]): CommandClassification {
	const commandWords = skipPrefix(words);
	if (commandWords.length === 0) return { kind: "ok" };
	const executable = basename(commandWords[0]!);

	const payload = shellPayload(commandWords);
	if (payload !== undefined) return classifyCommand(payload);
	if (executable === "eval") return classifyCommand(commandWords.slice(1).join(" "));

	if (executable === "gh") return classifyGh(commandWords, ghSubcommand(commandWords));

	if (executable !== "git") return { kind: "ok" };
	const subcommand = gitSubcommand(commandWords);
	if (
		subcommand.name === "reset" &&
		commandWords.slice(subcommand.index + 1).some((word) => word === "--hard" || word.startsWith("--hard="))
	) {
		return { kind: "hard_reset", reason: HARD_RESET_REASON };
	}
	if (subcommand.name === "push") {
		const args = commandWords.slice(subcommand.index + 1);
		const force = args.some((word) => {
			if (
				word === "--force" ||
				word.startsWith("--force=") ||
				word === "--force-with-lease" ||
				word.startsWith("--force-with-lease=")
			) {
				return true;
			}
			if (word.startsWith("+") && word.length > 1) return true;
			// Combined short options such as `-fu` are legal git syntax.
			return /^-[^-]*f/.test(word);
		});
		if (force) return { kind: "force_push", reason: FORCE_PUSH_REASON };
	}
	return { kind: "ok" };
}

function firstDanger(tokens: ShellToken[]): CommandClassification {
	let words: string[] = [];
	let danger: CommandClassification | undefined;
	const inspect = (candidate: CommandClassification): void => {
		if (!danger && candidate.kind !== "ok") danger = candidate;
	};
	const finish = (): void => {
		inspect(classifyWords(words));
		words = [];
	};
	for (const token of tokens) {
		if (token.kind === "substitution") {
			inspect(classifyCommand(token.value));
			continue;
		}
		if (token.kind === "operator") {
			finish();
			continue;
		}
		words.push(token.value);
	}
	finish();
	return danger ?? { kind: "ok" };
}

/** Classify dangerous shell operations without matching quoted prose. */
export function classifyCommand(cmd: string): CommandClassification {
	if (typeof cmd !== "string" || cmd.trim() === "") return { kind: "ok" };
	return firstDanger(tokenizeShell(cmd));
}

function expandHome(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
	return path;
}

function pathCandidates(token: string): string[] {
	const value = token.replace(/^[([{<]+/, "").replace(/[)\]}>;,]+$/, "");
	const candidates = [value];
	const equals = value.indexOf("=");
	if (equals > 0) candidates.push(value.slice(equals + 1));
	if (value.startsWith("file://")) candidates.push(value.slice("file://".length));
	return candidates.filter(candidate => candidate.length > 0);
}

function pathIsInside(candidate: string, base: string, baseWasAbsolute: boolean): boolean {
	const expanded = expandHome(candidate);
	if (!isAbsolute(expanded) && baseWasAbsolute) return false;
	const resolvedCandidate = resolve(expanded);
	const relation = relative(base, resolvedCandidate);
	return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

/**
 * Return true when a path or shell command mentions the controller's state
 * directory.  Callers should pass paths resolved against the tool's cwd when
 * the input is a tool path; command inputs are tokenized here.
 */
export function touchesControllerState(pathOrCmd: string, baseDir: string): boolean {
	if (typeof pathOrCmd !== "string" || typeof baseDir !== "string" || baseDir.length === 0) return false;
	const expandedBase = expandHome(baseDir);
	const baseWasAbsolute = isAbsolute(expandedBase);
	const base = resolve(expandedBase);

	for (const token of tokenizeShell(pathOrCmd)) {
		if (token.kind === "substitution") {
			if (touchesControllerState(token.value, base)) return true;
			continue;
		}
		if (token.kind !== "word") continue;
		for (const candidate of pathCandidates(token.value)) {
			if (pathIsInside(candidate, base, baseWasAbsolute)) return true;
		}
	}

	// A path may have been escaped or embedded in a shell construct that the
	// small tokenizer intentionally does not model.  Check the exact normalized
	// base spelling as a final lexical fallback; boundary checks prevent
	// `/state` from matching `/state-old`.
	const normalizedInput = expandHome(pathOrCmd).replaceAll("\\", "/");
	const normalizedBase = base.replaceAll("\\", "/").replace(/\/$/, "");
	return normalizedInput === normalizedBase || normalizedInput.includes(`${normalizedBase}/`);
}