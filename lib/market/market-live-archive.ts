import type { MarketLiveRotationStock, MarketLiveSector } from "./market-live";

export type MarketLiveArchiveFrame = {
  collectedAt: string;
  sectors: MarketLiveSector[];
  stocks: MarketLiveRotationStock[];
};

export type MarketLiveArchiveDay = {
  date: string;
  baselineDate: string;
  frames: MarketLiveArchiveFrame[];
};

export type MarketLiveArchiveResponse = {
  dates: string[];
  day: Omit<MarketLiveArchiveDay, "frames"> & {
    frames: Omit<MarketLiveArchiveFrame, "stocks">[];
  } | null;
};
