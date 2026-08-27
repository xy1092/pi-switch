/**
 * Safety net — shadow snapshots before writes + /undo
 *
 * Before `write`/`edit` mutates an existing file, copy it into a per-project
 * shadow dir (manifest.jsonl maps snapshot → original absolute path).
 * `/undo [list|<index>|last]` restores, first snapshotting the current
 * content so an undo is itself undoable.
 */

import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	type ExtensionAPI,
	getAgentDir,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";

const KEEP_PER_PROJECT = 50;

function shotsRoot(): string {
	return path.join(getAgentDir(), "extensions", "pi-safety", "shots");
}

function projectKey(cwd: string): string {
	return crypto.createHash("sha1").update(cwd).digest("hex").slice(0, 12);
}

function projectDir(cwd: string): string {
	const dir = path.join(shotsRoot(), projectKey(cwd));
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function manifestPath(cwd: string): string {
	return path.join(projectDir(cwd), "manifest.jsonl");
}

interface Shot {
	index: number;
	ts: number;
	target: string;
	file: string;
}

function listShots(cwd: string): Shot[] {
	const file = manifestPath(cwd);
	if (!fs.existsSync(file)) return [];
	return fs
		.readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line) as Shot;
			} catch {
				return null;
			}
		})
		.filter((s): s is Shot => Boolean(s));
}

function snapshot(targetAbs: string, cwd: string): void {
	let rel = path.relative(cwd, targetAbs);
	if (!rel || rel.startsWith("..")) rel = targetAbs;
	const name = `${rel.replace(/[^\w.-]+/g, "__")}`;
	const dir = projectDir(cwd);
	const stamp = Date.now();
	const file = path.join(dir, `${stamp}-${path.basename(name)}.snap`);
	fs.copyFileSync(targetAbs, file);
	try {
		execFileSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], {
			stdio: "ignore",
		});
	} catch {
		/* not a git repo — snapshots still valuable */
	}
	fs.appendFileSync(
		manifestPath(cwd),
		JSON.stringify({ index: stamp, ts: stamp, target: targetAbs, file } as Shot) +
			"\n",
	);
	prune(cwd);
}

function prune(cwd: string): void {
	const shots = listShots(cwd);
	if (shots.length <= KEEP_PER_PROJECT) return;
	for (const shot of shots.slice(0, shots.length - KEEP_PER_PROJECT)) {
		try {
			fs.unlinkSync(shot.file);
		} catch {
			/* already gone */
		}
	}
	const keep = new Set(shots.slice(-KEEP_PER_PROJECT).map((s) => s.index));
	const rest = listShotsAllExcept(cwd, keep);
	fs.writeFileSync(manifestPath(cwd), rest.join(""));
}

function listShotsAllExcept(cwd: string, keepIndex: Set<number>): string[] {
	const file = manifestPath(cwd);
	if (!fs.existsSync(file)) return [];
	return fs
		.readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.filter((line) => {
			try {
				const s = JSON.parse(line) as Shot;
				return keepIndex.has(s.index);
			} catch {
				return false;
			}
		})
		.map((line) => line + "\n");
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;
		const input = event.input as Record<string, unknown>;
		const raw = (input.file_path ?? input.path) as string | undefined;
		if (!raw) return;
		const target = path.resolve(ctx.cwd, raw);
		if (!fs.existsSync(target)) return; // brand-new files need no snapshot
		await withFileMutationQueue(async () => snapshot(target, ctx.cwd));
	});

	pi.registerCommand("undo", {
		description: "列出影子快照或回滚：/undo | /undo last | /undo <序号>",
		handler: async (args, ctx) => {
			const shots = listShots(ctx.cwd).slice(-KEEP_PER_PROJECT);
			if (shots.length === 0) {
				ctx.ui.notify("本项目还没有影子快照（编辑过的文件会自动留存）", "info");
				return;
			}
		 const arg = args.trim();

			if (!arg || arg === "list") {
				const start = Math.max(0, shots.length - 8);
				const rows = shots
					.slice(start)
					.map(
						(s, i) =>
							`[${start + i}] ${new Date(s.ts).toLocaleTimeString()}  ${s.target}`,
					)
					.join("\n");
				ctx.ui.notify(`最近的快照（新在下）：\n${rows}`, "info");
				return;
			}

			const pick =
				arg === "last"
					? shots[shots.length - 1]
					: shots[Number(arg)] ?? null;
			if (!pick || !fs.existsSync(pick.file)) {
				ctx.ui.notify("没有匹配的快照序号", "error");
				return;
			}
			if (fs.existsSync(pick.target)) {
				snapshot(pick.target, ctx.cwd); // pre-restore guard shot
			}
			fs.copyFileSync(pick.file, pick.target);
			ctx.ui.notify(`已恢复 ${pick.target}`, "info");
		},
	});
}
