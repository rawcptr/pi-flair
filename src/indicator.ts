/**
 * Working-indicator builders and shine animation state machine.
 *
 * The verb message pulses with the model's brand colour — a breathing
 * glow effect on the working-indicator text, while the spinner stays plain.
 * The shine animation sweeps a bright band left-to-right across the message.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ansiFg, lookupModelColor, RESET, formatColor, shineText, type RgbColor } from "./color.js";
import { getModelColors, getFallbackColor, getShineIntervalMs, getSpinnerChars, getSpinnerIntervalMs, getVerbs } from "./settings.js";

// Verb selection

/** Pick a uniformly random verb from the configured list. */
export function pickRandomVerb(): string {
	const list = getVerbs();
	const index = Math.floor(Math.random() * list.length);
	return list[index] ?? "Thinking";
}

// Message builders

/**
 * Build the message text (verb + ellipsis) with the model colour at a
 * given brightness level. A random verb is picked on each call.
 *
 * @param brightness  0 = pure colour, 1 = white. Default 0.15.
 */
export function buildGlowMessage(color: RgbColor, brightness = 0.15): string {
	const verb = pickRandomVerb();
	return ansiFg(color, brightness) + verb + "..." + RESET;
}

/**
 * Build a verb message with a white-brightness shine sweep.
 *
 * Delegates to the shared shineText utility in color.ts.
 *
 * @param color           Model brand colour
 * @param verb            Verb string (without ellipsis)
 * @param shinePos        Shine position: 0-indexed character in the
 *                        full string (verb + "..."); -1 = no shine
 * @param baseBrightness  Brightness for characters not under the shine
 */
export function buildShineMessage(
	color: RgbColor,
	verb: string,
	shinePos: number,
	baseBrightness = 0.2,
): string {
	return shineText(verb + "...", [color], shinePos, baseBrightness);
}

// Current model state

let currentModel = { id: "", color: getFallbackColor() };

/** Last-known model id. */
export function getCurrentModelId(): string {
	return currentModel.id;
}

/** Last-known model colour. */
export function getCurrentModelColor(): RgbColor {
	return currentModel.color;
}

/** Update the current-model tracking. */
export function setCurrentModel(id: string, color: RgbColor): void {
	currentModel.id = id;
	currentModel.color = color;
}

/**
 * Synchronise currentModel with ctx.model.
 * Returns true if the model id or colour actually changed.
 */
export function syncModelFromContext(ctx: ExtensionContext): boolean {
	if (!ctx.model) return false;

	const modelId = ctx.model.id;
	const color = lookupModelColor(modelId, getModelColors(), getFallbackColor());

	const changed =
		modelId !== currentModel.id ||
		formatColor(color) !== formatColor(currentModel.color);

	if (changed) {
		setCurrentModel(modelId, color);
	}

	return changed;
}

// Shine animation state machine

export class ShineAnimation {
	private timer: ReturnType<typeof setInterval> | undefined;
	private verb = "";
	private frame = 0;
	private textLength = 0;

	/** True if the shine animation timer is currently running. */
	get isRunning(): boolean {
		return this.timer !== undefined;
	}

	/** Start the shine sweep animation. Picks a fresh verb and begins the interval. */
	start(ctx: ExtensionContext, color: RgbColor): void {
		this.stop();

		this.verb = pickRandomVerb();
		this.textLength = this.verb.length + 3; // + "..."
		this.frame = 0;
		ctx.ui.setWorkingMessage(buildShineMessage(color, this.verb, -1));

		// Sweep left-to-right across the full text (verb + "..."),
		// then pause for the same duration.
		const cycleLen = this.textLength * 2;
		this.timer = setInterval(() => {
			this.frame = (this.frame + 1) % cycleLen;
			const shinePos = this.frame < this.textLength ? this.frame : -1;
			ctx.ui.setWorkingMessage(
				buildShineMessage(color, this.verb, shinePos),
			);
		}, getShineIntervalMs());
	}

	/** Stop the shine animation timer. */
	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	/**
	 * Restart the animation if it's currently running.
	 * Used after model colour changes so it picks up the new colour
	 * without being started from a stopped state.
	 */
	restartIfNeeded(ctx: ExtensionContext, color: RgbColor): void {
		if (!this.timer) return;
		this.stop();
		this.start(ctx, color);
	}

	/**
	 * Pick a fresh verb without restarting the animation timer.
	 * Used at the start of each LLM turn during multi-turn agent runs.
	 */
	resetVerb(ctx: ExtensionContext, color: RgbColor): void {
		this.verb = pickRandomVerb();
		this.textLength = this.verb.length + 3;
		this.frame = 0;
		ctx.ui.setWorkingMessage(buildShineMessage(color, this.verb, -1));
	}
}

/** Singleton shine animation instance for the extension lifecycle. */
export const shineAnimation = new ShineAnimation();

// Indicator setup

/** Push the glow indicator for the given model. */
export function applyModelIndicator(
	ctx: ExtensionContext,
	modelId: string,
): void {
	const color = lookupModelColor(modelId, getModelColors(), getFallbackColor());
	setCurrentModel(modelId, color);
	ctx.ui.setWorkingIndicator({
		frames: [...getSpinnerChars()],
		intervalMs: getSpinnerIntervalMs(),
	});
	ctx.ui.setWorkingMessage(buildGlowMessage(color));
}
