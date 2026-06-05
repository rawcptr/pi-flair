/**
 * /flair command handler — manages model colours (spinner-verb domain only).
 *
 * Trigger words and boost are handled by pi-keywords via /keywords.
 *
 * Commands:
 *   /flair help                  — show usage
 *   /flair ls                    — list all model colours
 *   /flair add <name> <color>    — assign/update a model colour (hex or rgb)
 *   /flair remove <name>         — remove a model colour
 *   /flair clear                 — clear all model colours
 */

import { join } from "node:path";
import type {
    ExtensionAPI,
    ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import {
    ansiFg,
    formatColor,
    formatColorHex,
    parseColor,
    RESET,
} from "./color.js";
import {
    applyModelIndicator,
    getCurrentModelColor,
    restartAnimationIfNeeded,
} from "./indicator.js";
import {
    clearModelColors,
    deleteModelColor,
    getColorScope,
    getModelColors,
    getShadowedColor,
    saveFlairSettings,
    setModelColor,
} from "./settings.js";

// Completions

function flairCompletions(prefix: string): AutocompleteItem[] | null {
    const trimmed = prefix.trim();
    const parts = trimmed.split(/\s+/);
    const partial = parts[parts.length - 1] ?? "";
    const isNextWord = prefix.endsWith(" ");

    // Subcommand completions (first word)
    if (parts.length <= 1 && !isNextWord) {
        return [
            {
                value: "list",
                label: "list",
                description: "List all model colours",
            },
            {
                value: "add",
                label: "add",
                description: "Assign a colour to a model",
            },
            {
                value: "remove",
                label: "remove",
                description: "Remove a model colour",
            },
            {
                value: "clear",
                label: "clear",
                description: "Clear all model colours",
            },
        ].filter((i) => i.value.startsWith(partial));
    }

    const cmd = parts[0]?.toLowerCase();

    // Remove: suggest model names
    if (cmd === "remove" && !isNextWord) {
        return Object.keys(getModelColors())
            .filter((name) => name.startsWith(partial))
            .map((name) => ({
                value: name,
                label: name,
            }));
    }

    // Suggest --local / --global for mutation commands
    if (cmd === "add" || cmd === "remove" || cmd === "clear") {
        if (partial.startsWith("--") || isNextWord) {
            return [
                { value: "--local", label: "--local", description: "Save to project-local .pi/flair.json" },
                { value: "--global", label: "--global", description: "Save to global ~/.pi/agent/flair.json" },
            ].filter((i) => i.value.startsWith(partial));
        }
    }

    return null;
}

// Scope flag parsing

/** Parse --local / --global flags from args, removing them in place. Default: global. */
function parseScopeFlags(args: string[]): { scope: "global" | "local"; explicit: boolean } {
    for (let i = args.length - 1; i >= 0; i--) {
        const a = args[i]!;
        if (a === "--local") {
            args.splice(i, 1);
            return { scope: "local", explicit: true };
        }
        if (a === "--global") {
            args.splice(i, 1);
            return { scope: "global", explicit: true };
        }
    }
    return { scope: "global", explicit: false };
}

/** Resolve flair.json path for the given scope. */
function flairPath(scope: "global" | "local", cwd: string): string {
    return scope === "local"
        ? join(cwd, ".pi", "flair.json")
        : join(getAgentDir(), "flair.json");
}

// Help text

function showHelp(ctx: ExtensionContext): void {
    ctx.ui.notify(
        "Usage: /flair <command> [args] [--local | --global]\n\n" +
            "Commands:\n" +
            "  help                    Show this help\n" +
            "  list                    List all model colours\n" +
            "  add <name> <color>      Assign/update a model colour\n" +
            "  remove <name>           Remove a model colour\n" +
            "  clear                   Clear all model colours\n\n" +
            "Flags:\n" +
            "  --local                 Save to project-local .pi/flair.json\n" +
            "  --global                Save to global ~/.pi/agent/flair.json (default)\n\n" +
            "Colors can be hex (#c15f3c) or rgb(r, g, b).",
        "info",
    );
}

// List rendering

const DIM = "\x1b[2m";

function renderModelList(): string {
    const entries = Object.entries(getModelColors());
    if (entries.length === 0) return "  (none)";
    return entries
        .map(([n, c]) => {
            const whence = getColorScope(n);
            if (whence === "both") {
                const sh = getShadowedColor(n)!;
                return `  ${formatColorHex(c)} ${ansiFg(c, 0.3)}${n}${RESET} ${DIM}shadows ${ansiFg(sh)}${formatColorHex(sh)}${RESET}`;
            }
            if (whence === "local") {
                return `  ${formatColorHex(c)} ${ansiFg(c, 0.3)}${n}${RESET} (local)`;
            }
            return `  ${formatColorHex(c)} ${ansiFg(c, 0.3)}${n}${RESET}`;
        })
        .join("\n");
}

function showModelList(ctx: ExtensionContext): void {
    ctx.ui.notify(`Model colours:\n${RESET}${renderModelList()}`, "info");
}

// Model colour refresher

function refreshAfterChange(ctx: ExtensionContext, message: string): void {
    ctx.ui.notify(message, "info");
    if (ctx.model) {
        applyModelIndicator(ctx, ctx.model.id);
        restartAnimationIfNeeded(ctx, getCurrentModelColor());
    }
}

// Subcommand handlers

function cmdAdd(ctx: ExtensionContext, args: string[], scope: "global" | "local"): void {
    if (args.length < 2) {
        ctx.ui.notify("Usage: /flair add <name> <color>", "error");
        return;
    }

    // The last argument is the colour; everything before is the model name.
    const name = args.slice(0, -1).join(" ");
    const colorStr = args[args.length - 1]!;
    const color = parseColor(colorStr);

    if (!color) {
        ctx.ui.notify(
            `Invalid colour "${colorStr}". Use hex like #c15f3c or rgb(r,g,b).`,
            "error",
        );
        return;
    }

    setModelColor(name, color, scope);
    saveFlairSettings(flairPath(scope, ctx.cwd), scope, ctx.ui.notify);
    refreshAfterChange(ctx, `✨ ${name} → ${formatColor(color)}`);
}

function cmdRemove(ctx: ExtensionContext, name: string | undefined, scope: "global" | "local"): void {
    if (!name) {
        ctx.ui.notify("Usage: /flair remove <name>", "error");
        return;
    }
    if (!deleteModelColor(name, scope)) {
        const msg = scope === "local"
            ? `"${name}" not in local model colours. Try --global.`
            : `"${name}" not in global model colours.`;
        ctx.ui.notify(msg, "warning");
        return;
    }
    saveFlairSettings(flairPath(scope, ctx.cwd), scope, ctx.ui.notify);
    ctx.ui.notify(`Removed "${name}" from model colours.`, "info");
    if (ctx.model) {
        applyModelIndicator(ctx, ctx.model.id);
        restartAnimationIfNeeded(ctx, getCurrentModelColor());
    }
}

function cmdClear(ctx: ExtensionContext, scope: "global" | "local"): void {
    clearModelColors(scope);
    saveFlairSettings(flairPath(scope, ctx.cwd), scope, ctx.ui.notify);
    const label = scope === "global" ? "global" : "local";
    ctx.ui.notify(`Cleared ${label} model colours.`, "info");
    if (ctx.model) {
        applyModelIndicator(ctx, ctx.model.id);
        restartAnimationIfNeeded(ctx, getCurrentModelColor());
    }
}

// Registration

export function registerFlairCommand(pi: ExtensionAPI): void {
    pi.registerCommand("flair", {
        description: "Manage model colours for the glow indicator",
        getArgumentCompletions: flairCompletions,
        handler: async (args, ctx) => {
            const parts = args.trim().split(/\s+/);
            const { scope, explicit } = parseScopeFlags(parts);
            const cmd = parts[0]?.toLowerCase();

            switch (cmd) {
                case "help":
                case undefined:
                case "":
                    showHelp(ctx);
                    return;

                case "ls":
                case "list":
                    showModelList(ctx);
                    return;

                case "add":
                    cmdAdd(ctx, parts.slice(1), scope);
                    return;

                case "remove":
                case "rm":
                    cmdRemove(ctx, parts[1], scope);
                    return;

                case "clear":
                    if (explicit) {
                        cmdClear(ctx, scope);
                    } else {
                        clearModelColors("global");
                        clearModelColors("local");
                        saveFlairSettings(flairPath("global", ctx.cwd), "global", ctx.ui.notify);
                        saveFlairSettings(flairPath("local", ctx.cwd), "local", ctx.ui.notify);
                        refreshAfterChange(ctx, "All model colours cleared.");
                    }
                    return;


                default:
                    ctx.ui.notify(
                        `Unknown subcommand "${cmd}". Use /flair help to see available commands.`,
                        "error",
                    );
            }
        },
    });
}
