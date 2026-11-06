import { describe, expect, it } from "vitest";
import { parseShowMyTrades } from "./showmytrades";
const now = new Date("2026-11-06T07:00:00Z");
const row = { id:"usd-cpi.test", title:"CPI", time:"2026-11-10T13:30:00Z", currency:"USD", impact:"high", status:"scheduled", confidence:"official" };
function payload(events: unknown[]) { return {generated_at:"2026-11-06T06:55:00Z", from:"2026-11-06T01:00:00Z", to:"2026-12-06T07:00:00Z", count:events.length, events}; }
describe("ShowMyTrades calendar", () => {
  it("converts UTC to KST and carries tentative status", () => {
    const {events} = parseShowMyTrades(payload([row, {...row,id:"fed",title:"Fed decision", time:"2026-12-02T15:30:00Z", status:"tentative"}]), now);
    expect(events.map(e => [e.date,e.time,e.tentative])).toEqual([["2026-11-10","22:30",false],["2026-12-03","00:30",true]]);
  });
  it("keeps important USD events and ISM while excluding other medium events", () => {
    const {events} = parseShowMyTrades(payload([row, {...row,id:"ism",title:"ISM Manufacturing PMI",impact:"medium"}, {...row,id:"other",impact:"medium"}, {...row,id:"eur",currency:"EUR"}]),now);
    expect(events.map(e => e.id)).toEqual(["smt-usd-cpi.test","smt-ism"]);
  });
  it("rejects stale, incomplete or malformed payloads to preserve old data", () => {
    expect(() => parseShowMyTrades({...payload([row]),generated_at:"2026-11-01T00:00:00Z"},now)).toThrow();
    expect(() => parseShowMyTrades({...payload([row]),to:"2026-11-07T00:00:00Z"},now)).toThrow();
    expect(() => parseShowMyTrades(payload([{...row,time:"2026-11-10T13:30:00"}]),now)).toThrow();
  });
});
