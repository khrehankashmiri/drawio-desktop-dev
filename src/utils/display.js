/**
 * Display Utilities for draw.io Desktop
 * Handles display/screen-related operations
 */
import { screen } from 'electron';

interface Position {
	x: number;
	y: number;
}

/**
 * Check if a position is within any display bounds
 */
export function isWithinDisplayBounds(pos: Position): boolean {
	const displays = screen.getAllDisplays();

	return displays.some(display => {
		const area = display.workArea;
		return (
			pos.x >= area.x &&
			pos.y >= area.y &&
			pos.x < area.x + area.width &&
			pos.y < area.y + area.height
		);
	});
}

/**
 * Get the display containing a position
 */
export function getDisplayAtPosition(pos: Position) {
	const displays = screen.getAllDisplays();

	return displays.find(display => {
		const area = display.workArea;
		return (
			pos.x >= area.x &&
			pos.y >= area.y &&
			pos.x < area.x + area.width &&
			pos.y < area.y + area.height
		);
	});
}

/**
 * Get primary display
 */
export function getPrimaryDisplay() {
	return screen.getPrimaryDisplay();
}

/**
 * Get all displays
 */
export function getAllDisplays() {
	return screen.getAllDisplays();
}

/**
 * Get display count
 */
export function getDisplayCount(): number {
	return screen.getAllDisplays().length;
}
