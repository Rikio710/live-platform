import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '広告について',
  description: 'LiveVault における広告・アフィリエイトプログラムの利用について',
}

/** 広告・アフィリエイトの表示についての説明（ステマ規制・ASP の審査のため） */
export default function AdPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6 text-sm text-[#ccccdd] leading-relaxed">
      <h1 className="text-2xl font-black text-white">広告について</h1>
      <p>
        LiveVault は、運営費（サーバー・データベース等）をまかなうため、アフィリエイトプログラムを利用しています。
        公演・ツアー・アーティストのページなどに「PR」と表示した枠のリンクは広告で、リンク先での商品の購入やホテルの予約などにより、LiveVault に紹介料が支払われることがあります。
      </p>
      <section className="space-y-2">
        <h2 className="text-base font-bold text-white">利用しているプログラム</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>楽天アフィリエイト（楽天市場・楽天トラベル）</li>
          <li>もしもアフィリエイト（Amazon・楽天市場など）</li>
        </ul>
        <p className="text-xs text-[#8888aa]">Amazon のアソシエイトとして、LiveVault は適格販売により収入を得ています。</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-bold text-white">掲載内容について</h2>
        <p>
          広告の有無によって、セトリや公演情報の内容を変えることはありません。商品・サービスの購入や予約は、リンク先のサイトの条件をご確認のうえ、ご自身の判断でご利用ください。
        </p>
      </section>
    </div>
  )
}
