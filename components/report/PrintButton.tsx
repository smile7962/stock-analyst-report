/** 리포트를 인쇄/PDF로 저장하는 버튼. 브라우저 인쇄 대화상자를 연다(외부 의존 없음). */
"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-full border border-black/15 px-3 py-1.5 text-xs opacity-70 dark:border-white/15"
    >
      PDF 저장 · 인쇄
    </button>
  );
}
