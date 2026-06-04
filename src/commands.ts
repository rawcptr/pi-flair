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
 *   /flair reset                 — restore defaults
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
    getModelColors,
    resetModelColors,
    setModelColor,
} from "./settings.js";

// Completions

function flairCompletions(prefix: string): AutocompleteItem[] | null {
    const trimmed = prefix.trim();
    const parts = trimmed.split(/\s+/);
    const partial = parts[parts.length - 1] ?? "";
    const isNextWord = prefix.endsWith(" ");

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
            { value: "reset", label: "reset", description: "Restore defaults" },
        ].filter((i) => i.value.startsWith(partial));
    }

    const cmd = parts[0]?.toLowerCase();

    if (cmd === "remove") {
        return Object.keys(getModelColors())
            .filter((name) => name.startsWith(partial))
            .map((name) => ({
                value: name,
                label: name,
            }));
    }

    return null;
}

// Persistence — minimal-diff write to ~/.pi/agent/flair.json

function saveModelColors(
    notify?: (msg: string, level: "info" | "warning" | "error") => void,
): void {
    const path = join(getAgentDir(), "flair.json");
    try {
        mkdirSync(dirname(path), { recursive: true });
        let existing: Record<string, unknown> = {};
        if (existsSync(path)) {
            try {
                existing = JSON.parse(readFileSync(path, "utf-8"));
            } catch (cause) {
                notify?.(
                    `flair: corrupt settings file, starting fresh: ${String(cause)}`,
                    "warning",
                );
            }
        }
        existing.modelColors = Object.fromEntries(
            Object.entries(getModelColors()).map(([k, v]) => [k, { r: v.r, g: v.g, b: v.b }]),
        );
        writeFileSync(path, JSON.stringify(existing, null, 2) + "\n");
    } catch {
        // best-effort — not worth crashing over
    }
}

// Help text

function showHelp(ctx: ExtensionContext): void {
    ctx.ui.notify(
        "Usage: /flair <command> [args]\n\n" +
            "Commands:\n" +
            "  help                    Show this help\n" +
            "  list                    List all model colours\n" +
            "  add <name> <color>      Assign/update a model colour\n" +
            "  remove <name>           Remove a model colour\n" +
            "  clear                   Clear all model colours\n" +
            "  reset                   Restore defaults\n\n" +
            "Colors can be hex (#c15f3c) or rgb(r, g, b).",
        "info",
    );
}

// List rendering

function renderModelList(): string {
    const entries = Object.entries(getModelColors());
    if (entries.length === 0) return "  (none)";
    return entries
        .map(([n, c]) => {
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

function cmdAdd(ctx: ExtensionContext, args: string[]): void {
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

    setModelColor(name, color);
    saveModelColors(ctx.ui.notify);
    refreshAfterChange(ctx, `✨ ${name} → ${formatColor(color)}`);
}

function cmdRemove(ctx: ExtensionContext, name: string | undefined): void {
    if (!name) {
        ctx.ui.notify("Usage: /flair remove <name>", "error");
        return;
    }
    if (!deleteModelColor(name)) {
        ctx.ui.notify(`"${name}" not in model colours.`, "warning");
        return;
    }
    saveModelColors(ctx.ui.notify);
    ctx.ui.notify(`Removed "${name}" from model colours.`, "info");
    if (ctx.model) {
        applyModelIndicator(ctx, ctx.model.id);
        restartAnimationIfNeeded(ctx, getCurrentModelColor());
    }
}

function cmdClear(ctx: ExtensionContext): void {
    clearModelColors();
    saveModelColors(ctx.ui.notify);
    ctx.ui.notify("All model colours cleared.", "info");
    if (ctx.model) {
        applyModelIndicator(ctx, ctx.model.id);
        restartAnimationIfNeeded(ctx, getCurrentModelColor());
    }
}

function cmdReset(ctx: ExtensionContext): void {
    resetModelColors();
    saveModelColors(ctx.ui.notify);
    ctx.ui.notify("Model colours reset to defaults.", "info");
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
                    cmdAdd(ctx, parts.slice(1));
                    return;

                case "remove":
                case "rm":
                    cmdRemove(ctx, parts[1]);
                    return;

                case "clear":
                    cmdClear(ctx);
                    return;

                case "reset":
                    cmdReset(ctx);
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
