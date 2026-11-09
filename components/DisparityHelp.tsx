"use client";

import { useRef } from "react";

export function DisparityHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="mb-4 rounded-lg border border-sky-400/40 px-3 py-2 text-sm text-sky-300 hover:bg-sky-400/10">이격도 차트 보는 법 ?</button>
    <dialog ref={dialog} aria-labelledby="disparity-help-title" className="m-auto w-[min(92vw,36rem)] rounded-xl border border-white/15 bg-[#151a22] p-6 text-zinc-100 backdrop:bg-black/70">
      <div className="flex items-start justify-between gap-4"><h2 id="disparity-help-title" className="text-lg font-semibold">이격도 차트 보는 법</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="설명 닫기" className="text-xl text-zinc-400">×</button></div>
      <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
        <p><strong className="text-white">이격도</strong>는 지수의 종가가 최근 평균 종가에서 얼마나 떨어져 있는지 보여줍니다. 종가를 이동평균으로 나누고 100을 곱합니다.</p>
        <p><strong className="text-white">100이 기준</strong>입니다. 예를 들어 105는 평균보다 5% 높고, 95는 평균보다 5% 낮다는 뜻입니다.</p>
        <p><strong className="text-white">25일·50일</strong>은 각각 최근 25거래일·50거래일 평균과 비교한 현재 값입니다. 차트의 파란 선은 50일 이격도의 변화이며, 오른쪽 숫자는 마지막 값입니다.</p>
        <p><strong className="text-white">6M·1Y·3Y·5Y</strong>를 누르면 표시 기간을 바꿀 수 있습니다. 선이 올라가면 평균에 비해 지수가 강해지고, 내려가면 약해지는 흐름입니다.</p>
        <p>높거나 낮다는 사실만으로 바로 매수·매도를 결정할 수는 없습니다. 추세가 오래 이어질 수 있으므로 다른 지표와 함께 살펴보세요. 한국과 미국은 거래일과 마감 시각이 달라 기준일이 다를 수 있습니다.</p>
      </div>
      <button type="button" onClick={() => dialog.current?.close()} className="mt-5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white">확인</button>
    </dialog>
  </>;
}
