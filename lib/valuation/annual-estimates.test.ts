import { describe, expect, it } from 'vitest';
import { parseAnnualEstimate } from './annual-estimates';
const sample = {itemCode:'005930',financePeriodType:'annual',financeInfo:{trTitleList:[{key:'202512',isConsensus:'N'},{key:'202612',isConsensus:'Y'},{key:'202712',isConsensus:'Y'}],rowList:[{title:'EPS',columns:{'202612':{value:'45,655'}}},{title:'BPS',columns:{'202612':{value:'-'}}}]}};
describe('annual consensus',()=>{
  it('selects the nearest forecast period and retains missing values',()=>expect(parseAnnualEstimate(sample,'005930','2026-11-11')).toEqual({fiscalPeriod:'2026-12',eps:45655,bps:null}));
  it('does not treat actual figures as estimates or use another company',()=>{expect(parseAnnualEstimate({...sample,financeInfo:{...sample.financeInfo,trTitleList:[{key:'202512',isConsensus:'N'}]}},'005930','2026-11-11')).toEqual({fiscalPeriod:null,eps:null,bps:null});expect(()=>parseAnnualEstimate(sample,'000660','2026-11-11')).toThrow();});
});
