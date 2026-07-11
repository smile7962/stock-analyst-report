export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-bold">주식 애널리스트 리포트</h1>
      <p className="max-w-sm text-center text-sm leading-relaxed opacity-70">
        종목명을 입력하면 DART 공시와 KRX 시세 데이터를 기반으로 애널리스트
        리포트를 생성합니다. 현재 개발 중입니다.
      </p>
      <footer className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-background px-4 py-3 text-center text-xs opacity-60 dark:border-white/10">
        본 리포트는 공시 데이터 기반 자동 생성 참고자료이며, 투자 권유가
        아닙니다. 투자 판단의 책임은 이용자 본인에게 있습니다.
      </footer>
    </main>
  );
}
