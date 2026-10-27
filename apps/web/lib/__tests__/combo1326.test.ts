import { describe, expect, it } from "vitest";
import {
  COMBO_COUNT,
  boardStringToCards,
  cardIdFromString,
  cardIdsFromComboIndex,
  comboIndexFromCardIds,
  comboIndexFromHand,
  handFromComboIndex,
  isComboBlockedByBoard,
} from "../combo1326";

describe("combo1326 bijection", () => {
  it("covers all 1326 combos uniquely", () => {
    const seen = new Set<number>();
    for (let a = 0; a < 52; a++) {
      for (let b = a + 1; b < 52; b++) {
        const c = comboIndexFromCardIds(a, b);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(COMBO_COUNT);
        expect(seen.has(c)).toBe(false);
        seen.add(c);
        expect(cardIdsFromComboIndex(c)).toEqual([a, b]);
      }
    }
    expect(seen.size).toBe(COMBO_COUNT);
  });

  it("round-trips hand strings", () => {
    for (const hand of ["AsKd", "7c6c", "ThJh", "KhKs", "2c2d"]) {
      const c = comboIndexFromHand(hand);
      const back = handFromComboIndex(c);
      // Same cards, high-first display
      const origIds = [
        cardIdFromString(hand.slice(0, 2)),
        cardIdFromString(hand.slice(2, 4)),
      ].sort((x, y) => x - y);
      const backIds = [
        cardIdFromString(back.slice(0, 2)),
        cardIdFromString(back.slice(2, 4)),
      ].sort((x, y) => x - y);
      expect(backIds).toEqual(origIds);
      expect(comboIndexFromHand(back)).toBe(c);
    }
  });

  it("blocks combos that share a board card", () => {
    const board = boardStringToCards("AhKd2s");
    const blocked = comboIndexFromHand("Ah7c");
    const free = comboIndexFromHand("7c6c");
    expect(isComboBlockedByBoard(blocked, board)).toBe(true);
    expect(isComboBlockedByBoard(free, board)).toBe(false);
  });
});
