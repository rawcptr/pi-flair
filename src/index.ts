/**
 * pi-flair — model-branded pulsing working indicator
 *
 * Customises pi's working indicator with a model-coloured glow message
 * and a shine animation that sweeps a bright band across the verb text.
 * Users can assign brand colours to model names via /flair add.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { ansiFg, RESET, type RgbColor } from "./color.js";
import {
    applyModelIndicator,
    buildGlowMessage,
    getCurrentModelColor,
    isAnimationRunning,
    resetShineVerb,
    startShineAnimation,
    stopShineAnimation,
    syncModelFromContext,
} from "./indicator.js";
import { loadSettings, getModelColors, getSpinnerChars, getSpinnerIntervalMs, type FlairSettings } from "./settings.js";
import { registerFlairCommand } from "./commands.js";

/**
 * Load and merge user settings from the two config scopes.
 * Returns null when no user-settings file exists.
 * Errors on existing-but-corrupt files are reported via the notification callback.
 */
function loadFlairSettings(
    cwd: string,
    notify: (msg: string, level: "info" | "warning" | "error") => void,
): FlairSettings | null {
    const globalPath = join(getAgentDir(), "flair.json");
    const projectPath = join(cwd, ".pi", "flair.json");

    let result: FlairSettings = {};

    // Read global
    if (existsSync(globalPath)) {
        try {
            result = { ...result, ...JSON.parse(readFileSync(globalPath, "utf-8")) };
        } catch (cause) {
            notify(`flair: corrupt global settings (${globalPath}): ${String(cause)}`, "warning");
        }
    }

    // Read project-local (overrides global)
    if (existsSync(projectPath)) {
        try {
            result = { ...result, ...JSON.parse(readFileSync(projectPath, "utf-8")) };
        } catch (cause) {
            notify(`flair: corrupt project settings (${projectPath}): ${String(cause)}`, "warning");
        }
    }

    return Object.keys(result).length > 0 ? result : null;
}

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx) => {
        // Overlay persisted user settings on top of built-in defaults.
        const userSettings = loadFlairSettings(ctx.cwd, ctx.ui.notify);
        loadSettings(userSettings ?? undefined);

        if (ctx.model) {
            applyModelIndicator(ctx, ctx.model.id);
        }
    });

    pi.on("model_select", (event, ctx) => {
        applyModelIndicator(ctx, event.model.id);
        if (isAnimationRunning()) {
            startShineAnimation(ctx, getCurrentModelColor());
        }
    });

    pi.on("before_agent_start", (_event, ctx) => {
        syncModelFromContext(ctx);
        ctx.ui.setWorkingIndicator({
            frames: [...getSpinnerChars()],
            intervalMs: getSpinnerIntervalMs(),
        });
        ctx.ui.setWorkingMessage(buildGlowMessage(getCurrentModelColor()));
    });

    pi.on("agent_start", (_event, ctx) => {
        syncModelFromContext(ctx);
        ctx.ui.setWorkingIndicator({
            frames: [...getSpinnerChars()],
            intervalMs: getSpinnerIntervalMs(),
        });
        startShineAnimation(ctx, getCurrentModelColor());
    });

    pi.on("turn_start", (_event, ctx) => {
        syncModelFromContext(ctx);
        resetShineVerb(ctx, getCurrentModelColor());
    });

    pi.on("agent_end", () => {
        stopShineAnimation();
    });

    pi.on("session_shutdown", () => {
        stopShineAnimation();
    });

    // Custom message renderer — displays detected model names with styling

    type FlairMessageDetails = { word?: string; type?: "model"; color?: RgbColor };

    pi.registerMessageRenderer("flair-word", (message, _options, theme) => {
        const details = message.details as FlairMessageDetails | undefined;
        const content = typeof message.content === "string" ? message.content : "";

        const styledWord =
            details?.type === "model" && details.color && details.word
                ? ansiFg(details.color, 0.2) + details.word + RESET
                : "";

        const displayText = styledWord
            ? `${theme.fg("accent", theme.bold("✨ "))}${styledWord}  ${content}`
            : content;

        const box = new Box(1, 0, (s) => theme.bg("customMessageBg", s));
        box.addChild(new Text(displayText, 1, 0));
        return box;
    });

    // /flair command handler

    registerFlairCommand(pi);

    // Echo detected model names as custom messages

    pi.on("message_end", (event, _ctx) => {
        if (event.message.role !== "user") return;
        const content = event.message.content;
        if (typeof content !== "string") return;

        // Detect model names — echo as flair-word
        for (const [name, color] of Object.entries(getModelColors())) {
            if (name.length < 2) continue;
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (new RegExp(`\\b${escaped}\\b`, "i").test(content)) {
                pi.sendMessage({
                    customType: "flair-word",
                    content: `Model "${name}" glow`,
                    display: true,
                    details: { word: name, type: "model", color },
                });
                return;
            }
        }
    });
}
