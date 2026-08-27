/**
 * Sweep — multi-agent aggregated research
 *
 * /sweep <question>  (also registered as the `sweep` tool)
 *
 * Fans the question out to several read-only explorers through the installed
 * `subagent` infrastructure pattern (isolated `pi --mode json` children),
 * each with a different search lens, then feeds every structured finding to
 * a deep analyst for one deduplicated, cited report.
 *
 * Model roles are taken from your existing user agents when present:
 *   fan-out  prefers explorer-fast   (cheap/fast)
 *   synthesize prefers analyst-deep  (strong reasoning)
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ExtensionAPI,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MAX_CONCURRENCY = 3;
const PER_TASK_TIMEOUT_MS = 300_000;
const FINDING_CHAR_CAP = 6_000;
const SYNTHESIS_INPUT_CAP = 48_000;

interface AgentSpec {
	name: string;
	model?: string;
	tools?: string[];
	systemPrompt?: string;
}

function parseAgentMd(filePath: string): AgentSpec | null {
	const raw = fs.readFileSync(filePath, "utf8");
	const m = /^---\n([\s\S]*?)\n---/.exec(raw);
	if (!m) return null;
	const pick = (k: string): string => {
		const r = new RegExp(`^${k}\\s*:\\s*(.+)$`, "m").exec(m[1]);
		return r ? r[1].trim().replace(/^["']|["']$/g, "") : "";
	};
	const name = pick("name");
	if (!name) return null;
	return {
		name,
		model: pick("model") || undefined,
		tools: pick("tools")
			? pick("tools").split(",").map((t) => t.trim()).filter(Boolean)
			: undefined,
		systemPrompt: raw.slice(m[0].length).trim() || undefined,
	};
}

function discoverUserAgents(): Map<string, AgentSpec> {
	const map = new Map<string, AgentSpec>();
	const dir = path.join(getAgentDir(), "agents");
	if (!fs.existsSync(dir)) return map;
	for (const f of fs.readdirSync(dir)) {
		if (!f.endsWith(".md")) continue;
		try {
			const spec = parseAgentMd(path.join(dir, f));
			if (spec) map.set(spec.name, spec);
		} catch {
			/* skip unreadable agent */
		}
	}
	return map;
}

function pickRole(
	agents: Map<string, AgentSpec>,
	preferred: string[],
	fallbackTools: string[],
): AgentSpec {
	for (const p of preferred) {
		const hit = agents.get(p);
		if (hit) return hit;
	}
	return { name: preferred[0] ?? "assistant", tools: fallbackTools };
}

const LENSES: Array<{ key: string; brief: string }> = [
	{
		key: "symbols",
		brief:
			"Hunt exact symbols, identifiers, and definitions named or implied by the question. Prefer grep/find.",
	},
	{
		key: "flow",
		brief:
			"Trace execution/data flow and dependency chains relevant to the question. Prefer reading callers and imports.",
	},
	{
		key: "context",
		brief:
			"Gather surrounding context: configs, tests, docs, git history hints, naming conventions touching this area.",
	},
	{
		key: "edges",
		brief:
			"Look for edge cases: error handling, TODO/FIXME markers, partially implemented paths, related-but-different code.",
	},
];

function formatFindings(finds: Array<{ lens: string; output: string }>): string {
	const parts = finds.map(
		(f) =>
			`## Lens: ${f.lens}\n${f.output.slice(0, FINDING_CHAR_CAP)}${
				f.output.length > FINDING_CHAR_CAP ? "\n…(truncated)" : ""
			}`,
	);
	const text = parts.join("\n\n");
	return text.length > SYNTHESIS_INPUT_CAP
		? text.slice(0, SYNTHESIS_INPUT_CAP) + "\n…(input truncated)"
		: text;
}

async function runChild(
	spec: AgentSpec,
	task: string,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<{ output: string; tokensOut: number }> {
	const args = [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--exclude-tools",
		"subagent,sweep",
	];
	if (spec.model) args.push("--model", spec.model);
	if (spec.tools?.length) args.push("--tools", spec.tools.join(","));

	let sysTmp: string | null = null;
	if (spec.systemPrompt?.trim()) {
		sysTmp = path.join(
			os.tmpdir(),
			`pi-sweep-${spec.name}-${Math.random().toString(36).slice(2)}.md`,
		);
		fs.writeFileSync(sysTmp, spec.systemPrompt);
		args.push("--append-system-prompt", sysTmp);
	}
	args.push(task);

	try {
		return await new Promise((resolve, reject) => {
			const proc = spawn("pi", args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";
			let finalText = "";
			let tokensOut = 0;
			const timer = setTimeout(() => proc.kill("SIGKILL"), PER_TASK_TIMEOUT_MS);
			if (signal) signal.addEventListener("abort", () => proc.kill(), { once: true });

			proc.stdout.on("data", (d: Buffer) => {
				buffer += d.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const ev = JSON.parse(line);
						if (ev.type === "message_end" && ev.message?.role === "assistant") {
							for (const part of ev.message.content ?? []) {
								if (part.type === "text") finalText = part.text;
							}
							tokensOut += ev.message.usage?.output || 0;
						}
					} catch {
						/* non-json noise */
					}
				}
			});
			proc.stderr.on("data", () => {});
			proc.on("close", (code) => {
				clearTimeout(timer);
				if (code === 0 && finalText) resolve({ output: finalText, tokensOut });
				else reject(new Error(`exit ${code}`));
			});
			proc.on("error", (err) => {
				clearTimeout(timer);
				reject(err);
			});
		});
	} finally {
		if (sysTmp && fs.existsSync(sysTmp)) fs.unlinkSync(sysTmp);
	}
}

async function runLenses(
	workers: AgentSpec[],
	lenses: typeof LENSES,
	question: string,
	cwd: string,
	signal: AbortSignal | undefined,
	onProgress: ((done: number, total: number, latest?: string) => void) | undefined,
): Promise<Array<{ lens: string; output: string; error?: string }>> {
	const tasks = lenses.map((l) => ({
		lens: l.key,
		prompt:
			`${l.brief}\n\nResearch question: ${question}\n\n` +
			`Return concise markdown findings ONLY: bullet points each citing exact \`path:line\`. ` +
			`No preamble, no fixes — you are read-only.`,
	}));
	const out: Array<{ lens: string; output: string; error?: string }> = [];
	let done = 0;
	let cursor = 0;

	async function worker(w: AgentSpec) {
		while (cursor < tasks.length) {
			const t = tasks[cursor++];
			try {
				const r = await runChild(w, t.prompt, cwd, signal);
				out.push({ lens: t.lens, output: r.output });
			} catch (err) {
				out.push({
					lens: t.lens,
					output: "",
					error: err instanceof Error ? err.message : String(err),
				});
			}
			done++;
			onProgress?.(done, tasks.length);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(MAX_CONCURRENCY, workers.length) }, (_, i) =>
			worker(workers[i % workers.length]),
		),
	);
	return out.sort((a, b) => a.lens.localeCompare(b.lens));
}

export default function (pi: ExtensionAPI) {
	async function execute(
		question: string,
		cwd: string,
		signal: AbortSignal | undefined,
		onProgress?: (done: number, total: number, latest?: string) => void,
	): Promise<string> {
		const agents = discoverUserAgents();
		const fanoutSpec = pickRole(
			agents,
			["explorer-fast", "explorer"],
			["read", "grep", "find", "ls"],
		);
		const synthSpec = pickRole(
			agents,
			["analyst-deep", "analyst", "planner"],
			["read", "grep", "find", "ls"],
		);

		const specs = Array.from({ length: LENSES.length }, () => fanoutSpec);
		onProgress?.(0, LENSES.length);
		const findings = await runLenses(
			specs,
			LENSES,
			question,
			cwd,
			signal,
			onProgress,
		);
		const ok = findings.filter((f) => !f.error);
		if (ok.length === 0) {
			return `Sweep failed: all ${findings.length} lenses errored.\n` +
				findings.map((f) => `- ${f.lens}: ${f.error}`).join("\n");
		}

		const synth =
			`You are synthesizing ${ok.length}/${LENSES.length} independent research passes.\n` +
			`Question: ${question}\n\nPasses:\n${formatFindings(ok)}\n\n` +
			`Produce ONE report: (1) direct answer to the question, ` +
			`(2) consolidated evidence list deduplicated by file:line, ` +
			`(3) contradictions/gaps between passes, (4) suggested next actions. Markdown.`;
		onProgress?.(LENSES.length, LENSES.length, "synthesizing");
		const r = await runChild(synthSpec, synth, cwd, signal);
		return r.output;
	}

	// Tool surface: lets the model call it proactively.
	pi.registerTool({
		name: "sweep",
		label: "Sweep",
		description:
			"Multi-agent aggregated research: fan the question out to several read-only " +
			"explorers with different lenses, then merge findings into one cited report. " +
			"Use for open-ended 'how/where/what-state' questions spanning many files.",
		parameters: Type.Object({
			question: Type.String({ description: "The research question." }),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			let done = 0;
			const res = await execute(
				params.question,
				ctx.cwd,
				signal,
				(d, t, note) => {
					done = d;
					onUpdate?.({
						content: [
							{ type: "text", text: note ?? `lens ${d}/${t}` },
						],
						details: { progress: `${d}/${t}`, note },
					});
				},
			);
			return {
				content: [{ type: "text", text: res }],
				details: { question: params.question, progress: `${done}/done` },
			};
		},
	});

	// Command surface: /sweep <question>
	pi.registerCommand("sweep", {
		description: "多视角并行调研并汇总为一份带引用的报告",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("用法: /sweep <问题>", "info");
				return;
			}
			ctx.ui.notify(
				"sweep 已启动：多视角并行调研中，完成后输出汇总报告",
				"info",
			);
			await execute(args.trim(), ctx.cwd, undefined, (d, t, note) => {
				ctx.ui.notify(note ?? `进度 ${d}/${t}`, "info");
			});
		},
	});
}
