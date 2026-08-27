/**
 * Memory — project-level session notes
 *
 * /remember <fact>   append a timestamped bullet to <cwd>/.pi/MEMORY.md
 * /forget            clear the file (with confirm when UI available)
 * /memory            show the current file
 *
 * On session_start (startup/resume) the notes are injected into context
 * silently via sendMessage(deliverAs "nextTurn") — no LLM call triggered.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_LINES = 120;
const MAX_INJECT_CHARS = 16_000;

function memoryFile(cwd: string): string {
	return path.join(cwd, ".pi", "MEMORY.md");
}

function readNotes(file: string): string {
	if (!fs.existsSync(file)) return "";
	const lines = fs.readFileSync(file, "utf8").split("\n");
	return lines.slice(-MAX_LINES).join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("remember", {
		description: "把一条关键事实写入项目记忆（.pi/MEMORY.md）",
		handler: async (args, ctx) => {
			const text = args.trim();
			if (!text) {
				ctx.ui.notify("用法: /remember <事实描述>", "info");
				return;
			}
			const file = memoryFile(ctx.cwd);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
			fs.appendFileSync(file, `- [${stamp}] ${text}\n`);
			ctx.ui.notify(`已记入 ${path.relative(ctx.cwd, file) || file}`, "info");
		},
	});

	pi.registerCommand("forget", {
		description: "清空项目记忆文件",
		handler: async (_args, ctx) => {
			const file = memoryFile(ctx.cwd);
			if (!fs.existsSync(file)) {
				ctx.ui.notify("尚无记忆文件", "info");
				return;
			}
			if (ctx.hasUI) {
				const ok = await ctx.ui.confirm(
					"清空项目记忆",
					`${file}\n\n该操作不可恢复，确认？`,
				);
				if (!ok) return;
			}
			fs.unlinkSync(file);
			ctx.ui.notify("项目记忆已清空", "info");
		},
	});

	pi.registerCommand("memory", {
		description: "查看当前项目记忆",
		handler: async (_args, ctx) => {
			const body = readNotes(memoryFile(ctx.cwd));
			ctx.ui.notify(body || "（空）", "info");
		},
	});

	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "new" || !ctx.isProjectTrusted?.()) {
			// brand-new dirs carry no history; trusted check guards hostile repos
			if (event.reason === "new") return;
		}
		const body = readNotes(memoryFile(ctx.cwd));
		if (!body.trim()) return;
		pi.sendMessage(
			{
				customType: "pi-memory-context",
				content:
					`<project-memory source="${memoryFile(ctx.cwd)}">\n` +
					body.slice(0, MAX_INJECT_CHARS) +
					`\n</project-memory>\n(以上是本项目长期记忆，来自 .pi/MEMORY.md；与当前任务相关时再使用。)`,
				display: false,
				details: undefined,
			},
			{ deliverAs: "nextTurn" },
		);
	});
}
