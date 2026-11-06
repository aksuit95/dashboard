import { describe, expect, it } from "vitest";
import { parseShowMyTrades, headlineIsm, koreanEventTitle, mergeRecentEvents } from "./showmytrades";
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
  it("extracts only headline ISM PMI series and keeps provider attribution", () => {
    const events=parseShowMyTrades(payload([{...row,id:"pmi",title:"ISM Manufacturing PMI",impact:"medium"},{...row,id:"price",title:"ISM Manufacturing Prices Paid",impact:"medium"}]),now).events;
    expect(headlineIsm(events).map(e=>[e.id,e.sourceName])).toEqual([["smt-pmi","ShowMyTrades"]]);
  });
  it("preserves actual and consensus as published and translates known indicators", () => {
    const event=parseShowMyTrades(payload([{...row,title:"Nonfarm Payrolls",forecast:"65K",actual:"71K",previous:"29K"}]),now).events[0];
    expect([event.forecast,event.actual,event.previous,koreanEventTitle(event.title)]).toEqual(["65K","71K","29K","비농업 고용자 수"]);
  });
  it("retains recent past events, updates matching results, and removes vanished future events", () => {
    const base=parseShowMyTrades(payload([row]),now).events[0];
    const old=[{...base,id:"past",date:"2026-11-05",time:"20:00",actual:"1"},{...base,id:"same",date:"2026-11-05",time:"20:00"},{...base,id:"future"},{...base,id:"too-old",date:"2026-10-28"}];
    expect(mergeRecentEvents(old,[{...base,id:"same",actual:"2"}],now).map(e=>[e.id,e.actual])).toEqual([["past","1"],["same","2"]]);
  });
});
