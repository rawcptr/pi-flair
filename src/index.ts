/**
 * pi-flair — model-branded pulsing working indicator
 *
 * Customises pi's working indicator with a model-coloured glow message
 * and a shine animation that sweeps a bright band across the verb text.
 * Users can assign brand colours to model names via /flair add.
 */

import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
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
import { loadSettings, getSpinnerChars, getSpinnerIntervalMs, readFlairSettings } from "./settings.js";
import { registerFlairCommand } from "./commands.js";

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx) => {
        // Overlay persisted user settings on top of built-in defaults.
        // Load chain: defaults → global → local (last wins)
        loadSettings();
        const global = readFlairSettings(
            join(getAgentDir(), "flair.json"),
            ctx.ui.notify,
        );
        if (Object.keys(global).length > 0) loadSettings(global, "global");
        const local = readFlairSettings(
            join(ctx.cwd, ".pi", "flair.json"),
            ctx.ui.notify,
        );
        if (Object.keys(local).length > 0) loadSettings(local, "local");

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

    // /flair command handler

    registerFlairCommand(pi);
}
